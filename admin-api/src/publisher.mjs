import { randomUUID } from "node:crypto";
import {
  copyFile,
  mkdir,
  readFile,
  readdir,
  rename,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";
import { dirname, join } from "node:path";
import { publicProduct, validateProduct } from "./catalog.mjs";
import { trashUnusedProductMedia } from "./media.mjs";

async function pathExists(path) {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}

async function activateCatalog({ catalogPath, payload, releaseId }) {
  const temporary = `${catalogPath}.${releaseId}.tmp`;
  const backup = `${catalogPath}.${releaseId}.previous`;
  const hadCatalog = await pathExists(catalogPath);
  await mkdir(dirname(catalogPath), { recursive: true });
  await writeFile(temporary, `${JSON.stringify(payload, null, 2)}\n`);
  try {
    if (hadCatalog) await rename(catalogPath, backup);
    await rename(temporary, catalogPath);
    if (hadCatalog) await unlink(backup).catch(() => {});
  } catch (error) {
    await unlink(temporary).catch(() => {});
    if (await pathExists(backup)) {
      await unlink(catalogPath).catch(() => {});
      await rename(backup, catalogPath);
    }
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
  await Promise.all(snapshots.slice(30).map((name) => unlink(join(snapshotsRoot, name))));
}

export async function readFallbackCatalog(path) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    return { schemaVersion: 2, generatedFrom: "Firestore catalog release", products: [] };
  }
}

export async function rebuildPublicSnapshot({ db, catalogPath, releaseId = randomUUID() }) {
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
  await activateCatalog({ catalogPath, payload, releaseId });
  await retainCatalogSnapshot(catalogPath, releaseId);
  return payload;
}

export async function publishDraft({ db, productId, user, catalogPath, mediaRoot }) {
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
      status: "pending-snapshot",
      createdAt: now,
      createdBy: user.email,
    });
    transaction.delete(draftRef);
  });
  let payload;
  try {
    payload = await rebuildPublicSnapshot({ db, catalogPath, releaseId });
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
