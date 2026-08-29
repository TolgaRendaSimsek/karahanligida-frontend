import { readFile } from "node:fs/promises";
import { applicationDefault, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { catalogTaxonomy, officialSourceForBrand } from "../admin-api/src/catalog-import.mjs";

const projectId = process.env.FIREBASE_PROJECT_ID;
if (!projectId || !process.env.GOOGLE_APPLICATION_CREDENTIALS) throw new Error("FIREBASE_PROJECT_ID ve GOOGLE_APPLICATION_CREDENTIALS zorunludur.");
initializeApp({ credential: applicationDefault(), projectId });
const db = getFirestore();
const catalog = JSON.parse(await readFile(new URL("../data/products.json", import.meta.url), "utf8"));
const archive = JSON.parse(await readFile(new URL("../data/catalog-archive.json", import.meta.url), "utf8"));
const report = JSON.parse(await readFile(new URL("../data/catalog-import-report.json", import.meta.url), "utf8"));
const now = new Date();
const writes = [];

for (const product of [...catalog.products, ...archive.products]) {
  writes.push({ ref: db.collection("productFamilies").doc(product.id), data: { ...product, revision: 1, status: product.status === "archived" ? "archived" : "published", importMeta: product.importMeta || { source: report.sourceFile, decision: product.status === "archived" ? "archived-extra" : "matched" }, updatedAt: now, updatedBy: "excel-import" } });
}
for (const row of report.rows.filter((item) => item.decision !== "matched")) {
  const id = `family-excel-${String(row.row).padStart(3, "0")}`;
  writes.push({
    ref: db.collection("productDrafts").doc(id),
    data: {
      id,
      slug: `${String(row.name).toLocaleLowerCase("tr-TR").normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/ı/g, "i").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").slice(0, 80)}-excel-${row.row}`,
      brand: row.brand,
      name: row.name,
      category: row.category,
      subcategory: row.subcategory,
      summary: `${row.name} için katalog kaydı.`,
      description: `${row.name} ürünü Excel kataloğunda yer almaktadır. Resmî ürün doğrulaması ve görseli tamamlanana kadar taslak olarak tutulur.`,
      features: [],
      specifications: row.packaging ? { Ambalaj: row.packaging } : {},
      images: [],
      variants: [{ id: `excel-${row.row}`, name: row.name, code: "", attributes: row.packaging ? { Ambalaj: row.packaging } : {} }],
      source: { catalog: report.sourceFile, pages: [Number(row.row)] },
      featured: false,
      status: "draft",
      importMeta: { excelRow: row.row, duplicateRows: row.duplicateRows || [], decision: row.ambiguous ? "needs-review" : "research-needed", research: { status: "research-needed", officialUrl: officialSourceForBrand(row.brand), checkedAt: null } },
      revision: 1,
      updatedAt: now,
      updatedBy: "excel-import",
    },
  });
}
for (const category of catalogTaxonomy()) writes.push({ ref: db.collection("categories").doc(category.id), data: { ...category, updatedAt: now, updatedBy: "excel-import" } });
for (const product of [...catalog.products, ...archive.products]) writes.push({ ref: db.collection("brands").doc(product.brand.toLocaleLowerCase("tr-TR").normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/ı/g, "i").replace(/[^a-z0-9]+/gi, "-")), data: { name: product.brand, status: "published", updatedAt: now, updatedBy: "excel-import" } });

for (let offset = 0; offset < writes.length; offset += 400) {
  const batch = db.batch();
  writes.slice(offset, offset + 400).forEach(({ ref, data }) => batch.set(ref, data, { merge: true }));
  await batch.commit();
  console.log(`${Math.min(offset + 400, writes.length)}/${writes.length} Firestore kaydı yazıldı`);
}
await db.collection("catalogImports").add({ sourceFile: report.sourceFile, status: "applied", rowCount: report.rowCount, matchedFamilyCount: report.matchedFamilyCount, draftCount: report.draftCount, archivedFamilyCount: report.archivedFamilyCount, appliedAt: now, appliedBy: "excel-import" });
await db.collection("auditLogs").add({ action: "catalog-import-apply", sourceFile: report.sourceFile, rowCount: report.rowCount, actorEmail: "excel-import", createdAt: now });
console.log(JSON.stringify({ productFamilies: catalog.products.length + archive.products.length, drafts: report.draftCount, categories: catalogTaxonomy().length }));
