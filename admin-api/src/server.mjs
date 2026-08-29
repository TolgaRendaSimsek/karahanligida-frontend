import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import helmet from "helmet";
import multer from "multer";
import { applicationDefault, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { createRequireAdmin, createRequireGoogleUser } from "./auth.mjs";
import { listAdminUsers, revokeAdminByUid } from "./admin-users.mjs";
import {
  cancelAdminInvite,
  claimAdminInvite,
  createAdminInvite,
  listAdminInvites,
} from "./admin-invites.mjs";
import { createAdminCors } from "./cors.mjs";
import { publicProduct, slugify, validateDraft, validateProduct } from "./catalog.mjs";
import { buildImportPreview, catalogTaxonomy, draftFromImportRow } from "./catalog-import.mjs";
import { cleanupExpiredTrash, processUpload, trashProductMedia } from "./media.mjs";
import { auditCatalogMedia } from "./media-audit.mjs";
import { publishDraft, rebuildPublicSnapshot } from "./publisher.mjs";

const port = Number(process.env.PORT || 3100);
const projectId = process.env.FIREBASE_PROJECT_ID;
const mediaRoot = resolve(process.env.MEDIA_ROOT || "./var/media");
const assetsRoot = resolve(process.env.ASSETS_ROOT || fileURLToPath(new URL("../../assets", import.meta.url)));
const catalogPath = resolve(process.env.CATALOG_PATH || "./var/catalog/products.json");
const allowedOrigin = process.env.ADMIN_ORIGIN || "https://karahanligida.com";

const firebaseApp = initializeApp({ credential: applicationDefault(), projectId });
const db = getFirestore();
const auth = getAuth();
const app = express();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 8 },
});

await Promise.all([
  mkdir(mediaRoot, { recursive: true }),
  mkdir(dirname(catalogPath), { recursive: true }),
]);
await cleanupExpiredTrash({ mediaRoot }).catch((error) => console.warn("Medya çöpü temizlenemedi:", error));
setInterval(() => {
  void cleanupExpiredTrash({ mediaRoot }).catch((error) => console.warn("Medya çöpü temizlenemedi:", error));
}, 24 * 60 * 60 * 1000).unref();

app.disable("x-powered-by");
app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: false }));
app.use(express.json({ limit: "2mb" }));
app.use(createAdminCors(allowedOrigin));

const requireAdmin = createRequireAdmin(auth);
const requireGoogleUser = createRequireGoogleUser(auth);

async function assertUniqueSlug(productId, slug) {
  const [families, drafts] = await Promise.all([
    db.collection("productFamilies").where("slug", "==", slug).get(),
    db.collection("productDrafts").where("slug", "==", slug).get(),
  ]);
  const conflict = [...families.docs, ...drafts.docs].find((document) => document.id !== productId);
  if (conflict) {
    const error = new Error("Bu slug başka bir ürün tarafından kullanılıyor.");
    error.status = 409;
    error.code = "slug-conflict";
    throw error;
  }
}

app.get("/health", (_request, response) => {
  response.json({ ok: true, service: "karahanli-admin-api" });
});

app.get("/health/ready", async (_request, response) => {
  try {
    await firebaseApp.options.credential.getAccessToken();
    response.json({ ok: true, service: "karahanli-admin-api", firebase: "ready" });
  } catch {
    response.status(503).json({ ok: false, service: "karahanli-admin-api", firebase: "unavailable" });
  }
});

app.post("/api/admin/claim-invite", requireGoogleUser, async (request, response, next) => {
  try {
    const admin = await claimAdminInvite({ db, auth, user: request.googleUser });
    await db.collection("auditLogs").add({
      action: "accept-admin-invite",
      actorUid: admin.uid,
      actorEmail: admin.email,
      createdAt: new Date(),
    });
    response.json({ ok: true, admin });
  } catch (error) {
    next(error);
  }
});

app.use("/api/admin", requireAdmin);

app.get("/api/admin/session", (request, response) => {
  response.json({ ok: true, admin: request.admin });
});

app.get("/api/admin/catalog", async (_request, response, next) => {
  try {
    const [families, drafts, imports] = await Promise.all([
      db.collection("productFamilies").get(),
      db.collection("productDrafts").get(),
      db.collection("catalogImports").orderBy("appliedAt", "desc").limit(1).get().catch(() => ({ docs: [] })),
    ]);
    const allFamilies = families.docs.map((document) => ({ id: document.id, ...document.data() }));
    response.json({
      products: allFamilies.filter((product) => product.status !== "archived"),
      archived: allFamilies.filter((product) => product.status === "archived"),
      drafts: drafts.docs.map((document) => ({ id: document.id, ...document.data() })),
      summary: {
        published: allFamilies.filter((product) => product.status !== "archived").length,
        archived: allFamilies.filter((product) => product.status === "archived").length,
        drafts: drafts.size,
      },
      latestImport: imports.docs[0] ? { id: imports.docs[0].id, ...imports.docs[0].data() } : null,
    });
  } catch (error) {
    next(error);
  }
});

app.put("/api/admin/products/:id/draft", async (request, response, next) => {
  try {
    const product = validateDraft({ ...request.body.product, id: request.params.id, status: "draft" });
    await assertUniqueSlug(product.id, product.slug);
    const expectedRevision = Number(request.body.expectedRevision || 0);
    const draftRef = db.collection("productDrafts").doc(product.id);
    const familyRef = db.collection("productFamilies").doc(product.id);
    let revision;
    await db.runTransaction(async (transaction) => {
      const [draft, family] = await Promise.all([transaction.get(draftRef), transaction.get(familyRef)]);
      const current = draft.exists ? draft.data() : family.exists ? family.data() : {};
      const currentRevision = Number(current.revision || 0);
      if (currentRevision !== expectedRevision) {
        const error = new Error("Bu ürün başka bir admin tarafından güncellendi.");
        error.status = 409;
        error.code = "revision-conflict";
        throw error;
      }
      revision = currentRevision + 1;
      transaction.set(draftRef, {
        ...product,
        revision,
        updatedAt: new Date(),
        updatedBy: request.admin.email,
      });
    });
    await db.collection("auditLogs").add({
      action: "save-draft",
      productId: product.id,
      revision,
      actorUid: request.admin.uid,
      actorEmail: request.admin.email,
      createdAt: new Date(),
    });
    response.json({ ok: true, revision });
  } catch (error) {
    next(error);
  }
});

app.post("/api/admin/products/:id/publish", async (request, response, next) => {
  try {
    response.json(
      await publishDraft({
        db,
        productId: request.params.id,
        user: request.admin,
        catalogPath,
        mediaRoot,
      }),
    );
  } catch (error) {
    next(error);
  }
});

app.post("/api/admin/products/:id/archive", async (request, response, next) => {
  try {
    const reference = db.collection("productFamilies").doc(request.params.id);
    const current = await reference.get();
    if (!current.exists) {
      const error = new Error("Arşivlenecek ürün bulunamadı.");
      error.status = 404;
      throw error;
    }
    const releaseRef = db.collection("catalogReleases").doc();
    await releaseRef.set({
      productId: request.params.id,
      action: "archive",
      status: "pending-files",
      createdAt: new Date(),
      createdBy: request.admin.email,
    });
    await reference.set(
      { status: "archived", updatedAt: new Date(), updatedBy: request.admin.email },
      { merge: true },
    );
    let payload;
    try {
      payload = await rebuildPublicSnapshot({
        db,
        catalogPath,
        releaseId: releaseRef.id,
      });
    } catch (error) {
      await reference.set(current.data());
      await releaseRef.update({
        status: "retry-required",
        error: error.message,
        failedAt: new Date(),
      });
      throw error;
    }
    await releaseRef.update({
      status: "active",
      completedAt: new Date(),
      productCount: payload.products.length,
    });
    await db.collection("auditLogs").add({
      action: "archive",
      productId: request.params.id,
      releaseId: releaseRef.id,
      actorUid: request.admin.uid,
      actorEmail: request.admin.email,
      createdAt: new Date(),
    });
    response.json({ ok: true, productCount: payload.products.length });
  } catch (error) {
    next(error);
  }
});

app.post("/api/admin/media", upload.array("images", 8), async (request, response, next) => {
  try {
    if (!request.files?.length) {
      const error = new Error("En az bir görsel seçin.");
      error.status = 400;
      throw error;
    }
    const images = await Promise.all(
      request.files.map((file) =>
        processUpload({
          buffer: file.buffer,
          productId: request.body.productId,
          mediaRoot,
          mimeType: file.mimetype,
        }),
      ),
    );
    response.status(201).json({ images });
  } catch (error) {
    next(error);
  }
});

app.get("/api/admin/media/audit", async (_request, response, next) => {
  try {
    const [families, drafts] = await Promise.all([
      db.collection("productFamilies").get(),
      db.collection("productDrafts").get(),
    ]);
    const report = await auditCatalogMedia({
      families: families.docs.map((document) => ({ id: document.id, ...document.data() })),
      drafts: drafts.docs.map((document) => ({ id: document.id, ...document.data() })),
      mediaRoot,
      assetsRoot,
    });
    response.json({ ok: true, ...report });
  } catch (error) {
    next(error);
  }
});

app.post("/api/admin/products/:id/restore", async (request, response, next) => {
  try {
    const reference = db.collection("productFamilies").doc(request.params.id);
    const snapshot = await reference.get();
    if (!snapshot.exists || snapshot.data().status !== "archived") {
      const error = new Error("Arşivde ürün bulunamadı.");
      error.status = 404;
      throw error;
    }
    const restored = validateProduct({ id: request.params.id, ...snapshot.data(), status: "published" });
    await reference.set({ ...restored, status: "published", updatedAt: new Date(), updatedBy: request.admin.email }, { merge: true });
    let payload;
    try {
      payload = await rebuildPublicSnapshot({ db, catalogPath });
    } catch (error) {
      await reference.set(snapshot.data());
      throw error;
    }
    await db.collection("auditLogs").add({ action: "restore-product", productId: request.params.id, actorUid: request.admin.uid, actorEmail: request.admin.email, createdAt: new Date() });
    response.json({ ok: true, product: publicProduct(restored), productCount: payload.products.length });
  } catch (error) { next(error); }
});

app.get("/api/admin/taxonomy", async (_request, response, next) => {
  try {
    const [categorySnapshot, brandSnapshot, families, drafts] = await Promise.all([
      db.collection("categories").get(),
      db.collection("brands").get(),
      db.collection("productFamilies").get(),
      db.collection("productDrafts").get(),
    ]);
    const allProducts = [...families.docs, ...drafts.docs].map((document) => document.data());
    const publicProducts = [...families.docs.filter((document) => document.data().status !== "archived"), ...drafts.docs].map((document) => document.data());
    const categoriesById = new Map(categorySnapshot.docs.map((document) => [document.id, { id: document.id, ...document.data() }]));
    for (const category of catalogTaxonomy()) {
      if (!categoriesById.has(category.id)) categoriesById.set(category.id, category);
    }
    const categories = [...categoriesById.values()].map((category) => ({
      ...category,
      subcategories: Array.isArray(category.subcategories) ? category.subcategories : [],
      productCount: publicProducts.filter((product) => product.category === category.name).length,
    })).filter((category) => catalogTaxonomy().some((item) => item.id === category.id) || category.productCount > 0 || category.custom)
      .sort((a, b) => String(a.name).localeCompare(String(b.name), "tr"));
    const brands = new Map(brandSnapshot.docs.map((document) => [document.id, { id: document.id, ...document.data() }]));
    for (const product of allProducts) {
      const id = slugify(String(product.brand || ""));
      if (id && !brands.has(id)) brands.set(id, { id, name: product.brand, status: "published" });
      const brand = brands.get(id);
      if (brand) brand.productCount = (brand.productCount || 0) + 1;
    }
    response.json({ categories, brands: [...brands.values()].sort((a, b) => String(a.name).localeCompare(String(b.name), "tr")) });
  } catch (error) {
    next(error);
  }
});

app.post("/api/admin/categories", async (request, response, next) => {
  try {
    const name = String(request.body?.name || "").trim();
    if (!name) { const error = new Error("Kategori adı zorunludur."); error.status = 422; throw error; }
    const id = slugify(name);
    const reference = db.collection("categories").doc(id);
    if ((await reference.get()).exists) { const error = new Error("Bu kategori zaten mevcut."); error.status = 409; throw error; }
    const subcategories = Array.isArray(request.body?.subcategories)
      ? request.body.subcategories.map((item) => ({ name: String(item.name || item).trim(), slug: slugify(String(item.name || item)) })).filter((item) => item.name)
      : [];
    await reference.set({ name, slug: id, subcategories, custom: true, status: "published", createdAt: new Date(), updatedAt: new Date(), createdBy: request.admin.email });
    await db.collection("auditLogs").add({ action: "create-category", categoryId: id, categoryName: name, actorUid: request.admin.uid, actorEmail: request.admin.email, createdAt: new Date() });
    response.status(201).json({ ok: true, category: { id, name, slug: id, subcategories, custom: true, status: "published", productCount: 0 } });
  } catch (error) { next(error); }
});

app.patch("/api/admin/categories/:id", async (request, response, next) => {
  try {
    const reference = db.collection("categories").doc(request.params.id);
    const currentSnapshot = await reference.get();
    if (!currentSnapshot.exists) { const error = new Error("Kategori bulunamadı."); error.status = 404; throw error; }
    const current = currentSnapshot.data();
    const name = String(request.body?.name || current.name || "").trim();
    const slug = slugify(String(request.body?.slug || name));
    const nextSubcategories = Array.isArray(request.body?.subcategories)
      ? request.body.subcategories.map((item) => ({ name: String(item.name || item).trim(), slug: slugify(String(item.slug || item.name || item)) })).filter((item) => item.name)
      : (Array.isArray(current.subcategories) ? current.subcategories : []);
    const families = await db.collection("productFamilies").where("category", "==", current.name).get();
    const drafts = await db.collection("productDrafts").where("category", "==", current.name).get();
    const batch = db.batch();
    const nextData = { ...current, name, slug, subcategories: nextSubcategories, updatedAt: new Date(), updatedBy: request.admin.email };
    batch.set(reference, nextData, { merge: true });
    [...families.docs, ...drafts.docs].forEach((document) => batch.set(document.ref, { category: name, updatedAt: new Date(), updatedBy: request.admin.email }, { merge: true }));
    await batch.commit();
    if (families.size) await rebuildPublicSnapshot({ db, catalogPath });
    await db.collection("auditLogs").add({ action: "update-category", categoryId: request.params.id, previousName: current.name, categoryName: name, actorUid: request.admin.uid, actorEmail: request.admin.email, createdAt: new Date() });
    response.json({ ok: true, category: { id: request.params.id, ...nextData, productCount: families.size + drafts.size } });
  } catch (error) { next(error); }
});

app.delete("/api/admin/categories/:id", async (request, response, next) => {
  try {
    const reference = db.collection("categories").doc(request.params.id);
    const snapshot = await reference.get();
    if (!snapshot.exists) { const error = new Error("Kategori bulunamadı."); error.status = 404; throw error; }
    const name = snapshot.data().name;
    const [families, drafts] = await Promise.all([
      db.collection("productFamilies").where("category", "==", name).get(),
      db.collection("productDrafts").where("category", "==", name).get(),
    ]);
    if (families.size + drafts.size) { const error = new Error(`Kategori ${families.size + drafts.size} ürün tarafından kullanılıyor; önce ürünleri taşıyın.`); error.status = 409; error.code = "category-in-use"; throw error; }
    await reference.delete();
    await db.collection("auditLogs").add({ action: "delete-category", categoryId: request.params.id, categoryName: name, actorUid: request.admin.uid, actorEmail: request.admin.email, createdAt: new Date() });
    response.json({ ok: true });
  } catch (error) { next(error); }
});

app.post("/api/admin/catalog/import/preview", async (request, response, next) => {
  try {
    if (!Array.isArray(request.body?.rows) || !request.body.rows.length) { const error = new Error("Excel satırları bulunamadı."); error.status = 422; throw error; }
    const families = await db.collection("productFamilies").get();
    const preview = buildImportPreview({ rows: request.body.rows, existingProducts: families.docs.map((document) => ({ id: document.id, ...document.data() })) });
    const reference = await db.collection("catalogImports").add({ source: request.body.source || "Excel", status: "preview", preview, createdAt: new Date(), createdBy: request.admin.email });
    response.json({ ok: true, importId: reference.id, ...preview });
  } catch (error) { next(error); }
});

app.post("/api/admin/catalog/import/apply", async (request, response, next) => {
  try {
    let preview = request.body?.preview;
    let importId = request.body?.importId;
    if (!preview && importId) {
      const snapshot = await db.collection("catalogImports").doc(importId).get();
      if (!snapshot.exists) { const error = new Error("İçe aktarma önizlemesi bulunamadı."); error.status = 404; throw error; }
      preview = snapshot.data().preview;
    }
    if (!preview?.rows?.length) { const error = new Error("Uygulanacak içe aktarma önizlemesi bulunamadı."); error.status = 422; throw error; }
    const [familiesSnapshot, draftsSnapshot] = await Promise.all([db.collection("productFamilies").get(), db.collection("productDrafts").get()]);
    const families = familiesSnapshot.docs.map((document) => ({ id: document.id, ...document.data() }));
    const familyById = new Map(families.map((product) => [product.id, product]));
    const batch = db.batch();
    const applied = [];
    for (const row of preview.rows) {
      if (row.match?.id && familyById.has(row.match.id)) {
        const product = familyById.get(row.match.id);
        const variantId = `excel-${row.row}`;
        const variants = Array.isArray(product.variants) ? product.variants : [];
        if (!variants.some((variant) => variant.id === variantId)) variants.push({ id: variantId, name: row.name, code: "", attributes: row.packaging ? { Ambalaj: row.packaging } : {} });
        batch.set(db.collection("productFamilies").doc(product.id), { category: row.category, subcategory: row.subcategory, variants, specifications: { ...(product.specifications || {}), ...(row.packaging ? { Ambalaj: row.packaging } : {}) }, importMeta: { excelRow: row.row, decision: "matched" }, updatedAt: new Date(), updatedBy: request.admin.email }, { merge: true });
        applied.push({ row: row.row, id: product.id, decision: "matched" });
      } else {
        const draft = validateDraft(draftFromImportRow(row));
        const product = { ...draft, status: "published", imageStatus: "research-needed" };
        batch.set(db.collection("productFamilies").doc(product.id), { ...product, updatedAt: new Date(), updatedBy: request.admin.email }, { merge: true });
        batch.delete(db.collection("productDrafts").doc(product.id));
        applied.push({ row: row.row, id: product.id, decision: "new-family" });
      }
    }
    if (request.body.archiveExtras) {
      const importedIds = new Set(applied.map((item) => item.id));
      families.filter((product) => product.brand !== "Kroom" && !importedIds.has(product.id) && product.status !== "archived").forEach((product) => batch.set(db.collection("productFamilies").doc(product.id), { status: "archived", updatedAt: new Date(), updatedBy: request.admin.email }, { merge: true }));
    }
    await batch.commit();
    const payload = await rebuildPublicSnapshot({ db, catalogPath });
    const result = { ok: true, importId, appliedCount: applied.length, applied, productCount: payload.products.length };
    if (importId) await db.collection("catalogImports").doc(importId).set({ status: "applied", appliedAt: new Date(), result }, { merge: true });
    await db.collection("auditLogs").add({ action: "catalog-import-apply", importId, appliedCount: applied.length, actorUid: request.admin.uid, actorEmail: request.admin.email, createdAt: new Date() });
    response.json(result);
  } catch (error) { next(error); }
});

app.delete("/api/admin/products/:id", async (request, response, next) => {
  const familyRef = db.collection("productFamilies").doc(request.params.id);
  const draftRef = db.collection("productDrafts").doc(request.params.id);
  let previousFamily = null;
  let previousDraft = null;
  try {
    const [family, draft] = await Promise.all([familyRef.get(), draftRef.get()]);
    if (!family.exists && !draft.exists) {
      const error = new Error("Silinecek ürün bulunamadı.");
      error.status = 404;
      throw error;
    }
    const actualName = String((draft.exists ? draft.data() : family.data()).name || "").trim();
    previousFamily = family.exists ? family.data() : null;
    previousDraft = draft.exists ? draft.data() : null;
    await db.runTransaction(async (transaction) => {
      transaction.delete(familyRef);
      transaction.delete(draftRef);
    });
    let payload;
    try {
      payload = await rebuildPublicSnapshot({ db, catalogPath });
    } catch (error) {
      await db.runTransaction(async (transaction) => {
        if (previousFamily) transaction.set(familyRef, previousFamily);
        if (previousDraft) transaction.set(draftRef, previousDraft);
      });
      throw error;
    }
    // Firestore ve canlı snapshot başarıyla güncellendikten sonra medya çöpü
    // yalnızca fiziksel arşivleme adımıdır. Dizin izinleri yanlışsa silme
    // isteğini 500 ile başarısız göstermemeliyiz; aksi halde ürün silinmiş
    // olmasına rağmen panel kullanıcıya hata gösterir. Hata audit kaydına
    // yazılır ve sunucu yöneticisi medya denetiminden tekrar işleyebilir.
    let trashedMediaPath = null;
    let mediaTrashError = null;
    try {
      trashedMediaPath = await trashProductMedia({ productId: request.params.id, mediaRoot });
    } catch (error) {
      mediaTrashError = error instanceof Error ? error.message : String(error);
      console.error(`Ürün medyası çöp alanına taşınamadı (${request.params.id}):`, error);
    }
    await db.collection("auditLogs").add({
      action: "delete-product",
      productId: request.params.id,
      productName: actualName,
      actorUid: request.admin.uid,
      actorEmail: request.admin.email,
      mediaTrashed: Boolean(trashedMediaPath),
      ...(mediaTrashError ? { mediaTrashError } : {}),
      createdAt: new Date(),
    });
    response.json({
      ok: true,
      productCount: payload.products.length,
      mediaTrashed: Boolean(trashedMediaPath),
      ...(mediaTrashError ? { warning: "Ürün silindi ancak medya dosyaları çöp alanına taşınamadı." } : {}),
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/admin/admins", async (_request, response, next) => {
  try {
    const [admins, invites] = await Promise.all([listAdminUsers(auth), listAdminInvites(db)]);
    response.json({ admins, invites });
  } catch (error) {
    next(error);
  }
});

app.post("/api/admin/admins", async (request, response, next) => {
  try {
    const invite = await createAdminInvite(db, request.body.email, request.admin);
    await db.collection("auditLogs").add({
      action: "invite-admin",
      inviteId: invite.id,
      targetEmail: invite.email,
      actorUid: request.admin.uid,
      actorEmail: request.admin.email,
      createdAt: new Date(),
    });
    response.status(201).json({ invite });
  } catch (error) {
    next(error);
  }
});

app.delete("/api/admin/invites/:id", async (request, response, next) => {
  try {
    const invite = await cancelAdminInvite(db, request.params.id, request.admin);
    await db.collection("auditLogs").add({
      action: "cancel-admin-invite",
      inviteId: request.params.id,
      targetEmail: invite.email,
      actorUid: request.admin.uid,
      actorEmail: request.admin.email,
      createdAt: new Date(),
    });
    response.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.delete("/api/admin/admins/:uid", async (request, response, next) => {
  try {
    const admin = await revokeAdminByUid(auth, request.params.uid, request.admin.uid);
    await db.collection("auditLogs").add({
      action: "revoke-admin",
      targetUid: admin.uid,
      targetEmail: admin.email,
      actorUid: request.admin.uid,
      actorEmail: request.admin.email,
      createdAt: new Date(),
    });
    response.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.use((error, _request, response, _next) => {
  const status = error.status || (error.code === "LIMIT_FILE_SIZE" ? 413 : 500);
  if (status >= 500) console.error(error);
  response.status(status).json({ error: status >= 500 ? "Sunucu işlemi tamamlanamadı." : error.message, code: error.code });
});

app.listen(port, "0.0.0.0", () => {
  console.log(`Karahanlı admin API ${port} portunda hazır.`);
});
