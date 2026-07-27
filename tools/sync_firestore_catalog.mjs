import { createRequire } from "node:module";
import fs from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const require = createRequire(path.join(root, "admin-api", "package.json"));
const { cert, getApps, initializeApp } = require("firebase-admin/app");
const { FieldValue, getFirestore } = require("firebase-admin/firestore");
const catalog = JSON.parse(
  await fs.readFile(path.join(root, "data", "products.json"), "utf8"),
);
const credentialPath =
  process.env.FIREBASE_SERVICE_ACCOUNT_FILE ||
  process.env.GOOGLE_APPLICATION_CREDENTIALS;

if (!credentialPath) {
  throw new Error(
    "FIREBASE_SERVICE_ACCOUNT_FILE veya GOOGLE_APPLICATION_CREDENTIALS gerekli.",
  );
}

const resolvedCredential = path.resolve(credentialPath);
const serviceAccount = JSON.parse(await fs.readFile(resolvedCredential, "utf8"));
if (serviceAccount.project_id !== "karahanligida01") {
  throw new Error(`Beklenmeyen Firebase projesi: ${serviceAccount.project_id}`);
}

if (!getApps().length) {
  initializeApp({ credential: cert(serviceAccount) });
}
const db = getFirestore();
const releaseRef = db.collection("catalogReleases").doc();
await releaseRef.set({
  type: "image-source-refresh",
  status: "running",
  productCount: catalog.products.length,
  startedAt: FieldValue.serverTimestamp(),
});

try {
  const writer = db.bulkWriter();
  for (const product of catalog.products) {
    writer.set(db.collection("productFamilies").doc(product.id), product);
  }
  await writer.close();
  await releaseRef.update({
    status: "completed",
    completedAt: FieldValue.serverTimestamp(),
  });
  console.log(
    `${catalog.products.length} ürün ailesi Firestore'a yazıldı (${releaseRef.id}).`,
  );
} catch (error) {
  await releaseRef.update({
    status: "failed",
    failedAt: FieldValue.serverTimestamp(),
    error: String(error.message || error).slice(0, 500),
  });
  throw error;
}
