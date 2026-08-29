#!/usr/bin/env node
/**
 * Excel aktarımının yerel, tekrar çalıştırılabilir adımıdır. Xlsx dosyası
 * depoya alınmaz; artifact-tool ile üretilen data/excel-catalog-import.json
 * yalnızca A/B sütunlarının güvenli bir kopyasını içerir.
 */
import { readFile, writeFile, copyFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildImportPreview, catalogTaxonomy, draftFromImportRow, inferExcelCategory, extractBrand } from "../admin-api/src/catalog-import.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const productsPath = resolve(root, "data/products.json");
const rowsPath = resolve(root, "data/excel-catalog-import.json");
const reportPath = resolve(root, "data/catalog-import-report.json");
const archivePath = resolve(root, "data/catalog-archive.json");
const backupDir = resolve(root, "data/backups");
const products = JSON.parse(await readFile(productsPath, "utf8"));
const source = JSON.parse(await readFile(rowsPath, "utf8"));
let existingArchive = { products: [] };
try { existingArchive = JSON.parse(await readFile(archivePath, "utf8")); } catch { /* ilk aktarım */ }
const rows = source.rows.map((row) => ({ ...row, name: String(row.name ?? "").trim() }));

await mkdir(backupDir, { recursive: true });
await copyFile(productsPath, resolve(backupDir, `products.before-excel-${new Date().toISOString().slice(0, 10)}.json`));

function machineCategory(product) {
  const text = `${product.name} ${product.summary} ${product.description}`.toLocaleLowerCase("tr-TR");
  if (text.includes("değirmen") || text.includes("degirmen")) return ["Kahve Makineleri", "Kahve Değirmenleri"];
  if (text.includes("süper otomatik") || text.includes("super otomatik")) return ["Kahve Makineleri", "Süper Otomatik Kahve Makineleri"];
  if (text.includes("espresso") || text.includes("kahve makinesi")) return ["Kahve Makineleri", "Espresso Kahve Makineleri"];
  if (text.includes("filtre kahve makinesi")) return ["Kahve Makineleri", "Filtre Kahve Makineleri"];
  return ["Endüstriyel Mutfak Ekipmanları", product.subcategory || "Endüstriyel Mutfak Ekipmanları"];
}

function stripCommercialText(product) {
  const clean = (value) => String(value ?? "")
    .replace(/Fiyatlarımıza\s*KDV\s*dahil\s*değildir\.?/gi, "")
    .replace(/Kırmızı yıldızlı ürünler sürekli stokta olup, hemen teslim edilebilir\.?/gi, "")
    .replace(/\s{2,}/g, " ").trim();
  return {
    ...product,
    summary: clean(product.summary),
    description: clean(product.description),
    features: Array.isArray(product.features) ? product.features.map(clean).filter(Boolean) : [],
    specifications: Object.fromEntries(Object.entries(product.specifications || {}).map(([key, value]) => [clean(key), clean(value)]).filter(([key, value]) => key && value)),
  };
}

function mappedFamily(row, families) {
  const name = row.name.toLocaleLowerCase("tr-TR");
  if (name.includes("kimbo")) {
    if (name.includes("kapsul")) return families.find((p) => p.id === (name.includes("blue") ? "family-0026" : "family-0025"));
    if (name.includes("filtre")) return families.find((p) => p.id === "family-0024");
    return families.find((p) => p.id === "family-0023");
  }
  if (name.includes("favori")) return families.find((p) => p.id === "family-0001");
  if (name.startsWith("fo ")) {
    if (name.includes("sos") || name.includes("dekor")) return families.find((p) => p.id === "family-0010");
    if (name.includes("püre") || name.includes("pure")) return families.find((p) => p.id === "family-0013");
    if (name.includes("toz")) return families.find((p) => p.id === "family-0017");
    return families.find((p) => p.id === "family-0002");
  }
  if (name.includes("toschi") || name.includes("toschi")) {
    if (name.includes("püre") || name.includes("pure")) return families.find((p) => p.id === "family-0037");
    if (name.includes("sos") || name.includes("topping")) return families.find((p) => p.id === "family-0035");
    return families.find((p) => p.id === "family-0033");
  }
  if (name.includes("yook")) return families.find((p) => p.id === "family-0038");
  return null;
}

const allFamilies = [...new Map([...products.products, ...(existingArchive.products || [])].map((product) => [product.id, product])).values()];
const previewRows = rows.map((row) => {
  const [category, subcategory] = inferExcelCategory(row);
  const family = mappedFamily(row, allFamilies);
  const duplicateRows = rows.filter((candidate) => String(candidate.name).toLocaleLowerCase("tr-TR") === String(row.name).toLocaleLowerCase("tr-TR")).map((candidate) => candidate.row);
  return {
    row: row.row,
    name: row.name,
    brand: extractBrand(row.name),
    category,
    subcategory,
    packaging: row.pack == null ? "" : String(row.pack).trim(),
    duplicateRows,
    ambiguous: duplicateRows.length > 1 || row.name === "15",
    match: family ? { id: family.id, name: family.name, score: 99 } : null,
    decision: family && duplicateRows.length === 1 && row.name !== "15" ? "matched" : "research-needed",
  };
});

const matchedIds = new Set(previewRows.filter((row) => row.match && row.decision === "matched").map((row) => row.match.id));
const matchedRowsById = new Map();
for (const row of previewRows) if (row.match && row.decision === "matched") (matchedRowsById.get(row.match.id) || matchedRowsById.set(row.match.id, []).get(row.match.id)).push(row);

const nextProducts = [];
for (const product of allFamilies) {
  if (product.brand === "Kroom") {
    const [category, subcategory] = machineCategory(product);
    nextProducts.push(stripCommercialText({ ...product, category, subcategory }));
    continue;
  }
  if (!matchedIds.has(product.id)) {
    nextProducts.push(stripCommercialText({ ...product, status: "archived" }));
    continue;
  }
  const rowsForFamily = matchedRowsById.get(product.id) || [];
  const first = rowsForFamily[0];
  const variants = [...(product.variants || [])];
  for (const row of rowsForFamily) {
    const id = `excel-${row.row}`;
    if (!variants.some((variant) => variant.id === id)) variants.push({ id, name: row.name, code: "", attributes: row.packaging ? { Ambalaj: row.packaging } : {} });
  }
  const specifications = { ...(product.specifications || {}) };
  for (const row of rowsForFamily) if (row.packaging) specifications[`Ambalaj Excel ${row.row}`] = row.packaging;
  nextProducts.push(stripCommercialText({ ...product, category: first.category, subcategory: first.subcategory, variants, specifications, importMeta: { source: source.sourceFile, matchedRows: rowsForFamily.map((row) => row.row), decision: "matched" } }));
}

const drafts = previewRows.filter((row) => !row.match || row.decision !== "matched").map((row) => draftFromImportRow(row));
const report = {
  sourceFile: source.sourceFile,
  sheet: source.sheet,
  importedAt: new Date().toISOString(),
  rowCount: rows.length,
  matchedFamilyCount: matchedIds.size,
  draftCount: drafts.length,
  archivedFamilyCount: allFamilies.filter((product) => product.brand !== "Kroom" && !matchedIds.has(product.id)).length,
  duplicateGroups: [...new Map(previewRows.filter((row) => row.duplicateRows.length > 1).map((row) => [row.duplicateRows.join(","), ({ rows: row.duplicateRows, name: row.name })])).values()],
  needsReview: previewRows.filter((row) => row.ambiguous).map((row) => ({ row: row.row, name: row.name })),
  categories: catalogTaxonomy(),
  rows: previewRows,
};
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
const publicProducts = nextProducts.filter((product) => product.status !== "archived").map(({ importMeta: _internal, ...product }) => product);
const archivedProducts = nextProducts.filter((product) => product.status === "archived").map(({ importMeta: _internal, ...product }) => product);
await writeFile(productsPath, `${JSON.stringify({ ...products, generatedAt: new Date().toISOString(), products: publicProducts }, null, 2)}\n`);
await writeFile(archivePath, `${JSON.stringify({ schemaVersion: 2, generatedAt: new Date().toISOString(), source: "Excel catalog import", products: archivedProducts }, null, 2)}\n`);
console.log(JSON.stringify({ published: nextProducts.filter((product) => product.status !== "archived").length, archived: nextProducts.filter((product) => product.status === "archived").length, drafts: drafts.length, matchedFamilies: matchedIds.size, reportPath }, null, 2));
