import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import express from "express";
import helmet from "helmet";
import multer from "multer";
import { applicationDefault, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { createRequireAdmin } from "./auth.mjs";
import { createAdminCors } from "./cors.mjs";
import { validateProduct } from "./catalog.mjs";
import { processUpload } from "./media.mjs";
import { publishDraft, rebuildPublicSnapshot } from "./publisher.mjs";

const port = Number(process.env.PORT || 3100);
const projectId = process.env.FIREBASE_PROJECT_ID;
const mediaRoot = resolve(process.env.MEDIA_ROOT || "./var/media");
const catalogPath = resolve(process.env.CATALOG_PATH || "./var/catalog/products.json");
const allowedOrigin = process.env.ADMIN_ORIGIN || "https://karahanligida.com";

initializeApp({ credential: applicationDefault(), projectId });
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

app.disable("x-powered-by");
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: "2mb" }));
app.use(createAdminCors(allowedOrigin));

const requireAdmin = createRequireAdmin(auth);

app.get("/health", (_request, response) => {
  response.json({ ok: true, service: "karahanli-admin-api" });
});

app.use("/api/admin", requireAdmin);

app.get("/api/admin/catalog", async (_request, response, next) => {
  try {
    const [families, drafts] = await Promise.all([
      db.collection("productFamilies").get(),
      db.collection("productDrafts").get(),
    ]);
    response.json({
      products: families.docs.map((document) => ({ id: document.id, ...document.data() })),
      drafts: drafts.docs.map((document) => ({ id: document.id, ...document.data() })),
    });
  } catch (error) {
    next(error);
  }
});

app.put("/api/admin/products/:id/draft", async (request, response, next) => {
  try {
    const product = validateProduct({ ...request.body.product, id: request.params.id, status: "published" });
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

app.use((error, _request, response, _next) => {
  const status = error.status || (error.code === "LIMIT_FILE_SIZE" ? 413 : 500);
  if (status >= 500) console.error(error);
  response.status(status).json({ error: status >= 500 ? "Sunucu işlemi tamamlanamadı." : error.message, code: error.code });
});

app.listen(port, "0.0.0.0", () => {
  console.log(`Karahanlı admin API ${port} portunda hazır.`);
});
