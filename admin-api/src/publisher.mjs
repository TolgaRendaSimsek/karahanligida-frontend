import { randomUUID } from "node:crypto";
import {
  copyFile,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { publicProduct, validateProduct } from "./catalog.mjs";
import { trashUnusedProductMedia } from "./media.mjs";

function escape(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]);
}

export function renderProductPage(product) {
  const image = product.images[0]?.src || "";
  const ogImage = image.startsWith("/") ? image : `../${image}`;
  return `<!doctype html>
<html lang="tr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="description" content="${escape(product.summary)}">
  <meta property="og:title" content="${escape(product.name)} | ${escape(product.brand)}">
  <meta property="og:description" content="${escape(product.summary)}">
  <meta property="og:image" content="${escape(ogImage)}">
  <title>${escape(product.name)} | ${escape(product.brand)} | Karahanlı Gıda</title>
  <link rel="icon" type="image/png" href="../logo.png">
  <link rel="stylesheet" href="../styles.css">
  <link rel="stylesheet" href="../catalog.css">
  <link rel="stylesheet" href="../quote-cart.css">
</head>
<body data-product-id="${escape(product.id)}" data-product-slug="${escape(product.slug)}">
  <div class="announcement">Karahanlı Gıda profesyonel ürün kataloğu · Fiyat bilgisi için teklif isteyin</div>
  <header class="site-header"><div class="header-main container"><a class="brand" href="../index.html"><img src="../logo.png" alt="Karahanlı Gıda" class="brand-logo"><span class="brand-copy"><strong>KARAHANLI GIDA</strong><small>HORECA DAĞITIM</small></span></a><form class="search" action="../products.html"><input name="q" type="search" placeholder="Ürün, model kodu veya marka ara"><button type="submit">⌕</button></form><div class="header-actions"><a class="action-link" href="../favorites.html"><span>♡</span><small>Favoriler</small></a><button class="action-link cart-button" id="cartBtn" type="button"><span>▱</span><small>Teklif Sepeti</small><b id="cartCount">0</b></button></div></div><nav class="simple-nav"><div class="container"><a href="../index.html">Ana Sayfa</a><a href="../products.html">Tüm Ürünler</a></div></nav></header>
  <main class="detail-main container" id="productDetail"><p class="loading-state">Ürün bilgileri yükleniyor…</p></main>
  <footer class="site-footer"><div class="container footer-bottom"><span>© 2026 Karahanlı Gıda.</span><a href="../products.html">Ürün kataloğu</a></div></footer>
  <aside class="cart-drawer" id="cartDrawer" aria-hidden="true"><div class="drawer-head"><h3>Teklif Sepeti</h3><button id="closeCart">×</button></div><div class="drawer-body" id="cartItems"></div><div class="drawer-footer"><span class="quote-summary" id="quoteSummary"></span><button class="btn btn-primary full" id="checkoutBtn">WhatsApp'tan Teklif İste</button></div></aside>
  <div class="overlay" id="overlay"></div><div class="toast" id="toast"></div>
  <script src="../config.js"></script><script src="../quote-message.js"></script><script src="../catalog-core.js"></script><script src="../quote-cart.js"></script><script src="../product-detail.js"></script>
</body>
</html>`;
}

async function pathExists(path) {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}

async function buildReleaseFiles({ payload, catalogPath, pagesRoot, releaseId }) {
  const catalogTemporary = `${catalogPath}.${releaseId}.tmp`;
  const pagesTemporary = join(
    dirname(pagesRoot),
    `.${basename(pagesRoot)}.${releaseId}.tmp`,
  );
  await mkdir(dirname(catalogPath), { recursive: true });
  await rm(pagesTemporary, { recursive: true, force: true });
  await mkdir(pagesTemporary, { recursive: true });
  try {
    await writeFile(catalogTemporary, `${JSON.stringify(payload, null, 2)}\n`);
    await Promise.all(
      payload.products.map((product) =>
        writeFile(join(pagesTemporary, `${product.slug}.html`), renderProductPage(product)),
      ),
    );
    return { catalogTemporary, pagesTemporary };
  } catch (error) {
    await Promise.allSettled([
      unlink(catalogTemporary),
      rm(pagesTemporary, { recursive: true, force: true }),
    ]);
    throw error;
  }
}

async function activateReleaseFiles({
  catalogPath,
  pagesRoot,
  catalogTemporary,
  pagesTemporary,
  releaseId,
}) {
  const catalogBackup = `${catalogPath}.${releaseId}.previous`;
  const pagesBackup = join(dirname(pagesRoot), `.${basename(pagesRoot)}.${releaseId}.previous`);
  const hadCatalog = await pathExists(catalogPath);
  const hadPages = await pathExists(pagesRoot);
  let catalogActivated = false;
  let pagesActivated = false;
  try {
    if (hadCatalog) await rename(catalogPath, catalogBackup);
    if (hadPages) await rename(pagesRoot, pagesBackup);
    await rename(catalogTemporary, catalogPath);
    catalogActivated = true;
    await rename(pagesTemporary, pagesRoot);
    pagesActivated = true;
    await Promise.allSettled([
      unlink(catalogBackup),
      rm(pagesBackup, { recursive: true, force: true }),
    ]);
  } catch (error) {
    if (pagesActivated) await rm(pagesRoot, { recursive: true, force: true });
    if (catalogActivated) await rm(catalogPath, { force: true });
    if (hadCatalog && (await pathExists(catalogBackup))) await rename(catalogBackup, catalogPath);
    if (hadPages && (await pathExists(pagesBackup))) await rename(pagesBackup, pagesRoot);
    await Promise.allSettled([
      unlink(catalogTemporary),
      rm(pagesTemporary, { recursive: true, force: true }),
    ]);
    throw error;
  }
}

async function retainCatalogSnapshot(catalogPath, releaseId) {
  const snapshotsRoot = join(dirname(catalogPath), "releases");
  await mkdir(snapshotsRoot, { recursive: true });
  const snapshotName = `${new Date().toISOString().replaceAll(":", "-")}-${releaseId}.json`;
  await copyFile(catalogPath, join(snapshotsRoot, snapshotName));
  const snapshots = (await readdir(snapshotsRoot))
    .filter((name) => name.endsWith(".json"))
    .sort()
    .reverse();
  await Promise.all(
    snapshots.slice(30).map((name) => unlink(join(snapshotsRoot, name))),
  );
}

export async function readFallbackCatalog(path) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    return { schemaVersion: 2, generatedFrom: "Firestore catalog release", products: [] };
  }
}

export async function rebuildPublicSnapshot({ db, catalogPath, pagesRoot, releaseId = randomUUID() }) {
  const snapshot = await db.collection("productFamilies").where("status", "==", "published").get();
  const products = snapshot.docs
    .map((document) => publicProduct({ id: document.id, ...document.data() }))
    .sort((left, right) => left.name.localeCompare(right.name, "tr"));
  const payload = {
    schemaVersion: 2,
    generatedAt: new Date().toISOString(),
    generatedFrom: "Firebase Firestore productFamilies",
    products,
  };
  const temporaryFiles = await buildReleaseFiles({ payload, catalogPath, pagesRoot, releaseId });
  await activateReleaseFiles({
    catalogPath,
    pagesRoot,
    releaseId,
    ...temporaryFiles,
  });
  await retainCatalogSnapshot(catalogPath, releaseId);
  return payload;
}

export async function publishDraft({ db, productId, user, catalogPath, pagesRoot, mediaRoot }) {
  const releaseId = randomUUID();
  const draftRef = db.collection("productDrafts").doc(productId);
  const familyRef = db.collection("productFamilies").doc(productId);
  const releaseRef = db.collection("catalogReleases").doc(releaseId);
  let published;
  let previousFamily = null;
  let previousFamilyExists = false;
  let previousDraft = null;
  await db.runTransaction(async (transaction) => {
    const [draftSnapshot, familySnapshot] = await Promise.all([
      transaction.get(draftRef),
      transaction.get(familyRef),
    ]);
    if (!draftSnapshot.exists) {
      const error = new Error("Yayımlanacak taslak bulunamadı.");
      error.status = 404;
      throw error;
    }
    previousDraft = draftSnapshot.data();
    previousFamilyExists = familySnapshot.exists;
    previousFamily = familySnapshot.exists ? familySnapshot.data() : null;
    published = validateProduct({ id: productId, ...draftSnapshot.data(), status: "published" });
    const now = new Date();
    transaction.set(familyRef, {
      ...published,
      revision: (draftSnapshot.data().revision ?? 0) + 1,
      updatedAt: now,
      updatedBy: user.email,
    });
    transaction.set(releaseRef, {
      productId,
      status: "pending-files",
      createdAt: now,
      createdBy: user.email,
    });
    transaction.delete(draftRef);
  });
  let payload;
  try {
    payload = await rebuildPublicSnapshot({ db, catalogPath, pagesRoot, releaseId });
  } catch (error) {
    await db.runTransaction(async (transaction) => {
      if (previousFamilyExists) transaction.set(familyRef, previousFamily);
      else transaction.delete(familyRef);
      transaction.set(draftRef, previousDraft);
    });
    await releaseRef.update({ status: "retry-required", error: error.message, failedAt: new Date() });
    throw error;
  }
  await releaseRef.update({ status: "active", completedAt: new Date(), productCount: payload.products.length });
  await db.collection("auditLogs").add({
    action: "publish",
    productId,
    releaseId,
    actorUid: user.uid,
    actorEmail: user.email,
    createdAt: new Date(),
  });
  if (mediaRoot) {
    try {
      await trashUnusedProductMedia({ productId, images: published.images, mediaRoot });
    } catch (error) {
      console.warn(`Kullanılmayan medya çöpe taşınamadı (${productId}):`, error);
    }
  }
  return { releaseId, product: publicProduct(published), productCount: payload.products.length };
}
