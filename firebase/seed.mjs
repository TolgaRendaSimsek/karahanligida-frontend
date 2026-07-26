import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { applicationDefault, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const currentDir = dirname(fileURLToPath(import.meta.url));
const catalogPath = join(currentDir, "..", "data", "products.json");
const catalog = JSON.parse(await readFile(catalogPath, "utf8"));

initializeApp({ credential: applicationDefault() });
const db = getFirestore();
const brandIds = new Map();
const categoryIds = new Map();
const writes = [];

function normalizedId(value) {
  return value
    .toLocaleLowerCase("tr-TR")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

for (const product of catalog.products) {
  const brandId = normalizedId(product.brand);
  const categoryId = normalizedId(product.category);
  brandIds.set(brandId, product.brand);
  categoryIds.set(categoryId, product.category);

  const familyRef = db.collection("productFamilies").doc(product.id);
  const { variants, images, specifications, ...family } = product;
  writes.push({
    ref: familyRef,
    data: {
      ...family,
      brandId,
      categoryId,
      searchTerms: [
        product.brand,
        product.name,
        product.category,
        product.subcategory,
        ...variants.flatMap((variant) => [variant.name, variant.code]).filter(Boolean),
      ].map((value) => value.toLocaleLowerCase("tr-TR")),
      updatedAt: new Date(),
    },
  });
  variants.forEach((variant) => {
    writes.push({ ref: familyRef.collection("variants").doc(variant.id), data: variant });
  });
  images.forEach((image, index) => {
    writes.push({
      ref: familyRef.collection("images").doc(`image-${index + 1}`),
      data: { ...image, order: index + 1 },
    });
  });
  Object.entries(specifications).forEach(([label, value], index) => {
    writes.push({
      ref: familyRef.collection("specs").doc(`spec-${index + 1}`),
      data: { label, value, order: index + 1 },
    });
  });
}

for (const [id, name] of brandIds) {
  writes.push({ ref: db.collection("brands").doc(id), data: { name, status: "published" } });
}
for (const [id, name] of categoryIds) {
  writes.push({ ref: db.collection("categories").doc(id), data: { name, status: "published" } });
}

for (let offset = 0; offset < writes.length; offset += 450) {
  const batch = db.batch();
  writes.slice(offset, offset + 450).forEach(({ ref, data }) => batch.set(ref, data, { merge: true }));
  await batch.commit();
  console.log(`${Math.min(offset + 450, writes.length)}/${writes.length} belge yazıldı`);
}

console.log("Firebase katalog seed işlemi tamamlandı.");
