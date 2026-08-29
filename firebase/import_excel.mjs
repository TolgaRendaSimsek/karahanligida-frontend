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
const verifiedSources = JSON.parse(await readFile(new URL("../data/verified-image-sources.json", import.meta.url), "utf8"));
const now = new Date();
const allProducts = [...catalog.products, ...archive.products];
const reportRowsByNumber = new Map(report.rows.map((row) => [Number(row.row), row]));

function importMetaFor(product) {
  const rowNumbers = product.variants.map((variant) => String(variant.id)).filter((id) => id.startsWith("excel-")).map((id) => Number(id.slice(6))).filter(Number.isFinite);
  if (!rowNumbers.length) return product.importMeta || undefined;
  const rows = rowNumbers.map((number) => reportRowsByNumber.get(number)).filter(Boolean);
  const first = rows[0];
  const verified = verifiedSources[product.id];
  return {
    excelRows: rowNumbers,
    originalName: first?.name || product.name,
    originalNames: [...new Set(rows.map((row) => row.name))],
    sourceFile: report.sourceFile,
    decision: "published",
    research: {
      sourceUrl: verified?.sourceUrl || (product.images?.length ? null : officialSourceForBrand(product.brand)),
      sourceType: verified?.sourceType || (product.images?.length ? "catalog-asset" : "pending-official-research"),
      checkedAt: verified?.checkedAt || null,
      confidence: verified?.confidence || (product.images?.length ? "catalog" : "unverified"),
      imageStatus: product.images?.length ? "verified" : "research-needed",
      officialUrl: verified?.sourceUrl || officialSourceForBrand(product.brand),
      ...(verified?.imageUrl ? { imageUrl: verified.imageUrl } : {}),
      ...(verified?.fileHash ? { fileHash: verified.fileHash } : {}),
    },
  };
}

const writes = [];
for (const product of allProducts) {
  writes.push({
    ref: db.collection("productFamilies").doc(product.id),
    data: {
      ...product,
      status: product.status === "archived" ? "archived" : "published",
      imageStatus: product.imageStatus || (product.images?.length ? "verified" : "research-needed"),
      ...(importMetaFor(product) ? { importMeta: importMetaFor(product) } : {}),
      updatedAt: now,
      updatedBy: "excel-import",
    },
  });
}

// Old imports created one draft per unmatched row. They are obsolete now that
// every Excel row is published as a family/variant; keep unrelated admin drafts.
const oldDraftRefs = (await db.collection("productDrafts").listDocuments()).filter((ref) => ref.id.startsWith("family-excel-"));
for (const ref of oldDraftRefs) writes.push({ ref, delete: true });

for (const category of catalogTaxonomy()) writes.push({ ref: db.collection("categories").doc(category.id), data: { ...category, updatedAt: now, updatedBy: "excel-import" } });
for (const product of allProducts) {
  const id = product.brand.toLocaleLowerCase("tr-TR").normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/ı/g, "i").replace(/[^a-z0-9]+/gi, "-");
  writes.push({ ref: db.collection("brands").doc(id), data: { name: product.brand, status: "published", updatedAt: now, updatedBy: "excel-import" } });
}

for (let offset = 0; offset < writes.length; offset += 400) {
  const batch = db.batch();
  writes.slice(offset, offset + 400).forEach((entry) => entry.delete ? batch.delete(entry.ref) : batch.set(entry.ref, entry.data, { merge: true }));
  await batch.commit();
  console.log(`${Math.min(offset + 400, writes.length)}/${writes.length} Firestore kaydı yazıldı`);
}
await db.collection("catalogImports").add({
  sourceFile: report.sourceFile,
  sourceHash: report.sourceHash || null,
  status: "applied",
  rowCount: report.rowCount,
  publishedExcelRowCount: report.publishedExcelRowCount,
  uniqueFamilyCount: report.uniqueFamilyCount,
  matchedFamilyCount: report.matchedFamilyCount,
  newFamilyCount: report.newFamilyCount,
  draftCount: 0,
  archivedFamilyCount: report.archivedFamilyCount,
  duplicateGroups: report.duplicateGroups,
  researchNeededCount: report.researchNeededCount,
  appliedAt: now,
  appliedBy: "excel-import",
});
await db.collection("auditLogs").add({ action: "catalog-import-apply", sourceFile: report.sourceFile, sourceHash: report.sourceHash || null, rowCount: report.rowCount, actorEmail: "excel-import", createdAt: now });
console.log(JSON.stringify({ productFamilies: catalog.products.length + archive.products.length, removedObsoleteDrafts: oldDraftRefs.length, categories: catalogTaxonomy().length, excelRows: report.rowCount }, null, 2));
