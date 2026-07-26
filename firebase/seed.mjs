import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { applicationDefault, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const currentDir = dirname(fileURLToPath(import.meta.url));
const catalog = JSON.parse(await readFile(join(currentDir, "..", "data", "products.json"), "utf8"));

initializeApp({ credential: applicationDefault(), projectId: process.env.FIREBASE_PROJECT_ID });
const db = getFirestore();
const brandIds = new Map();
const categoryIds = new Map();
const writes = [];
const now = new Date();

function normalizedId(value) {
  return value.toLocaleLowerCase("tr-TR").normalize("NFD").replace(/\p{Diacritic}/gu, "")
    .replace(/ı/g, "i").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

for (const product of catalog.products) {
  brandIds.set(normalizedId(product.brand), product.brand);
  categoryIds.set(normalizedId(product.category), product.category);
  writes.push({
    ref: db.collection("productFamilies").doc(product.id),
    data: {
      ...product,
      revision: 1,
      createdAt: now,
      updatedAt: now,
      createdBy: "catalog-seed",
      updatedBy: "catalog-seed",
    },
  });
}
for (const [id, name] of brandIds) {
  writes.push({ ref: db.collection("brands").doc(id), data: { name, status: "published", updatedAt: now } });
}
for (const [id, name] of categoryIds) {
  writes.push({ ref: db.collection("categories").doc(id), data: { name, status: "published", updatedAt: now } });
}

for (let offset = 0; offset < writes.length; offset += 450) {
  const batch = db.batch();
  writes.slice(offset, offset + 450).forEach(({ ref, data }) => batch.set(ref, data, { merge: true }));
  await batch.commit();
  console.log(`${Math.min(offset + 450, writes.length)}/${writes.length} belge yazıldı`);
}
await db.collection("catalogReleases").add({
  status: "seeded",
  productCount: catalog.products.length,
  createdAt: now,
  createdBy: "catalog-seed",
});
console.log("Firestore katalog seed işlemi tamamlandı.");
