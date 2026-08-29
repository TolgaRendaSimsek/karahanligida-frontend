#!/usr/bin/env node
/** Build the public catalog from the sanitized Excel extract. */
import { readFile, writeFile, copyFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { catalogTaxonomy, extractBrand, inferExcelCategory, normalizeCatalogText, slugifyCatalog } from "../admin-api/src/catalog-import.mjs";
import { sanitizeCommercialText } from "../admin-api/src/catalog.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const productsPath = resolve(root, "data/products.json");
const rowsPath = resolve(root, "data/excel-catalog-import.json");
const reportPath = resolve(root, "data/catalog-import-report.json");
const archivePath = resolve(root, "data/catalog-archive.json");
const backupDir = resolve(root, "data/backups");
const current = JSON.parse(await readFile(productsPath, "utf8"));
const source = JSON.parse(await readFile(rowsPath, "utf8"));
let archive = { products: [] };
try { archive = JSON.parse(await readFile(archivePath, "utf8")); } catch { /* first import */ }
const rows = source.rows.map((row) => ({ ...row, name: String(row.name ?? "").trim() }));

await mkdir(backupDir, { recursive: true });
const backupStamp = new Date().toISOString().replace(/[:.]/g, "-");
await copyFile(productsPath, resolve(backupDir, `products.before-excel-complete-${backupStamp}.json`));
try { await copyFile(archivePath, resolve(backupDir, `archive.before-excel-complete-${backupStamp}.json`)); } catch { /* first import */ }

function machineCategory(product) {
  const text = normalizeCatalogText(`${product.name} ${product.summary} ${product.description}`);
  if (text.includes("super otomatik")) return ["Kahve Makineleri", "Süper Otomatik Kahve Makineleri"];
  if (text.includes("filtre kahve makinesi")) return ["Kahve Makineleri", "Filtre Kahve Makineleri"];
  if (text.includes("kahve degirmen") || text.includes("kahve degirmeni") || text.includes("degirmen")) return ["Kahve Makineleri", "Kahve Değirmenleri"];
  if (text.includes("espresso makinesi") || text.includes("espresso makina")) return ["Kahve Makineleri", "Espresso Kahve Makineleri"];
  return ["Endüstriyel Mutfak Ekipmanları", product.subcategory || "Endüstriyel Mutfak Ekipmanları"];
}

function stripCommercialText(product) {
  const clean = (value) => String(value ?? "")
    .replace(/Fiyatlarımıza\s*KDV\s*dahil\s*değildir\.?/gi, "")
    .replace(/Kırmızı yıldızlı ürünler sürekli stokta olup, hemen teslim edilebilir\.?/gi, "")
    .replace(/f[ıiİI]yata?\s+dahildir/giu, "kapsama dahildir")
    .replace(/stok\s+kahve\s+kapasitesi/giu, "kahve kapasitesi")
    .replace(/stok/giu, "")
    .replace(/\s{2,}/g, " ").trim();
  return {
    ...product,
    summary: clean(product.summary),
    description: clean(product.description),
    features: Array.isArray(product.features) ? product.features.map(clean).filter(Boolean) : [],
    specifications: Object.fromEntries(Object.entries(product.specifications || {}).map(([key, value]) => [clean(key), clean(value)]).filter(([key, value]) => key && value)),
  };
}

// Conservative public spelling corrections. The exact Excel value remains in
// importMeta.originalName/originalNames for traceability.
function displayName(value, row) {
  if (row === 185 || String(value).trim() === "15") return "Excel satırı 185 – ürün adı doğrulanıyor";
  return String(value)
    .replace(/FİLİTRE/gi, "FİLTRE").replace(/KAADI/gi, "KAĞIDI")
    .replace(/ÇİKOLLATA/gi, "ÇİKOLATA").replace(/MİLKŞHAK/gi, "MILKSHAKE")
    .replace(/BÖGÜRTLEN/gi, "BÖĞÜRTLEN").replace(/FRAMBUGAZ/gi, "FRAMBUAZ")
    .replace(/MEYMESİ/gi, "MEYVESİ").replace(/DONOK/gi, "DONUK")
    .replace(/PAKER/gi, "PAKET").replace(/GRAFT/gi, "KRAFT")
    .replace(/CEATRİNG/gi, "CATERING").replace(/KIRIİTAL/gi, "KRİSTAL")
    .replace(/PİPERT/gi, "PİPET").replace(/(?:\s*,\s*)?ML\b/gi, " ML")
    .replace(/\s+F[İiIı]YAT[Iİiı]?\b/giu, "")
    .replace(/\s{2,}/g, " ").trim();
}

function mappedFamily(row, families) {
  const name = normalizeCatalogText(row.name);
  const byId = (id) => families.find((product) => product.id === id);
  if (name.includes("kimbo")) {
    if (name.includes("kapsul")) return byId(name.includes("blue") ? "family-0026" : "family-0025");
    if (name.includes("filtre") || name.includes("filitre")) return byId("family-0024");
    if (name.includes("cekirdek")) return byId("family-0023");
  }
  if (name.includes("favori")) return byId("family-0001");
  if (name.startsWith("fo ")) {
    if (name.includes("sos") || name.includes("dekor")) return byId("family-0010");
    if (name.includes("pure")) return byId("family-0013");
    if (name.includes("toz")) return byId("family-0017");
    if (name.includes("surup")) return byId("family-0002");
  }
  if (name.includes("toschi")) {
    if (name.includes("pure")) return byId("family-0037");
    if (name.includes("sos") || name.includes("topping")) return byId("family-0035");
    if (name.includes("surup")) return byId("family-0033");
  }
  if (name.includes("yook")) return byId("family-0038");
  return null;
}

const allFamilies = [...new Map([...current.products, ...(archive.products || [])].map((product) => [product.id, product])).values()];
const familyPool = allFamilies.filter((product) => product.brand !== "Kroom");
const rowsByName = new Map();
for (const row of rows) {
  const key = normalizeCatalogText(row.name);
  if (!rowsByName.has(key)) rowsByName.set(key, []);
  rowsByName.get(key).push(row);
}
const previewRows = rows.map((row) => {
  const [category, subcategory] = inferExcelCategory(row);
  const family = mappedFamily(row, familyPool);
  const duplicateRows = (rowsByName.get(normalizeCatalogText(row.name)) || []).map((candidate) => candidate.row);
  return {
    row: row.row, name: row.name, displayName: displayName(row.name, row.row), brand: extractBrand(row.name),
    category, subcategory, packaging: row.pack == null ? "" : String(row.pack).trim(), duplicateRows,
    ambiguous: duplicateRows.length > 1 || row.row === 185, match: family ? { id: family.id, name: family.name, score: 99 } : null,
    decision: family ? "matched" : "new-family",
  };
});
const previewByName = new Map();
for (const item of previewRows) {
  const key = normalizeCatalogText(item.name);
  if (!previewByName.has(key)) previewByName.set(key, []);
  previewByName.get(key).push(item);
}
const rowsByMatchedId = new Map();
for (const item of previewRows) if (item.match) {
  if (!rowsByMatchedId.has(item.match.id)) rowsByMatchedId.set(item.match.id, []);
  rowsByMatchedId.get(item.match.id).push(item);
}
function variantFor(item) {
  return { id: `excel-${item.row}`, name: item.displayName, code: "", attributes: { ...(item.packaging ? { Ambalaj: item.packaging } : {}), ExcelSatırı: String(item.row) } };
}
function excelMeta(items, decision = "published") {
  return {
    excelRows: items.map((item) => Number(item.row)), originalName: items[0].name,
    originalNames: [...new Set(items.map((item) => item.name))], sourceFile: source.sourceFile, decision,
    research: { sourceUrl: null, sourceType: "pending-official-research", checkedAt: null, confidence: "unverified", imageStatus: "research-needed" },
  };
}

const excelFamilies = [];
for (const [id, items] of rowsByMatchedId.entries()) {
  const original = allFamilies.find((product) => product.id === id);
  if (!original) continue;
  const first = items[0];
  // Remove variants from a previous Excel run before rebuilding the
  // authoritative row-to-variant mapping.
  const variants = (original.variants || []).filter((variant) => !String(variant.id).startsWith("excel-"));
  for (const item of items) if (!variants.some((variant) => variant.id === `excel-${item.row}`)) variants.push(variantFor(item));
  const specifications = Object.fromEntries(Object.entries(original.specifications || {}).filter(([key]) => !String(key).startsWith("Ambalaj Excel ")));
  for (const item of items) if (item.packaging) specifications[`Ambalaj Excel ${item.row}`] = item.packaging;
  excelFamilies.push(stripCommercialText({ ...original, category: first.category, subcategory: first.subcategory, variants, specifications, imageStatus: original.images?.length ? "verified" : "research-needed", importMeta: excelMeta(items, "matched"), status: "published" }));
}

const matchedIds = new Set(rowsByMatchedId.keys());
for (const items of previewByName.values()) {
  const first = items[0];
  const matched = mappedFamily(first, familyPool);
  if (matched && matchedIds.has(matched.id)) continue;
  const family = {
    id: `family-excel-${String(first.row).padStart(3, "0")}`,
    slug: `${slugifyCatalog(displayName(first.name, first.row))}-excel-${first.row}`,
    brand: extractBrand(first.name), name: displayName(first.name, first.row), category: first.category, subcategory: first.subcategory,
    summary: `${displayName(first.name, first.row)} için Karahanlı Gıda katalog kaydı.`,
    description: `${displayName(first.name, first.row)} ürünü Karahanlı Gıda Excel kataloğunda yer almaktadır. Resmî ürün görseli doğrulanıyor.`,
    features: [], specifications: Object.fromEntries(items.filter((item) => item.packaging).map((item) => [`Ambalaj Excel ${item.row}`, item.packaging])), images: [], variants: items.map(variantFor),
    source: { catalog: "Karahanlı Gıda Excel Kataloğu", pages: items.map((item) => Number(item.row)) }, featured: false, status: "published", imageStatus: "research-needed", importMeta: excelMeta(items),
  };
  excelFamilies.push(family);
}

const usedIds = new Set(excelFamilies.map((product) => product.id));
const nextProducts = [...excelFamilies];
const archivedProducts = [];
for (const product of allFamilies) {
  if (product.brand === "Kroom") {
    const [category, subcategory] = machineCategory(product);
    nextProducts.push(stripCommercialText({ ...product, category, subcategory, imageStatus: product.images?.length ? "verified" : "research-needed", status: "published" }));
  } else if (String(product.id).startsWith("family-excel-")) {
    // Excel families are rebuilt from the authoritative source on every run;
    // never leave stale generated families in the archive when a row is now
    // mapped to an existing family or merged as a duplicate variant.
  } else if (!usedIds.has(product.id) && !matchedIds.has(product.id)) {
    archivedProducts.push(stripCommercialText({ ...product, status: "archived" }));
  }
}
const duplicateGroups = [...rowsByName.values()].filter((items) => items.length > 1).map((items) => ({ rows: items.map((item) => item.row), name: items[0].name }));
const report = {
  sourceFile: source.sourceFile, sourceHash: source.sourceHash || null, sheet: source.sheet, importedAt: new Date().toISOString(), rowCount: rows.length,
  uniqueFamilyCount: excelFamilies.length, matchedFamilyCount: matchedIds.size, newFamilyCount: excelFamilies.length - matchedIds.size, publishedExcelRowCount: rows.length,
  draftCount: 0, researchNeededCount: excelFamilies.filter((product) => product.imageStatus === "research-needed").length, archivedFamilyCount: archivedProducts.length,
  duplicateGroups, needsReview: previewRows.filter((item) => item.ambiguous).map((item) => ({ row: item.row, name: item.name })), categories: catalogTaxonomy(), rows: previewRows,
};
const publicProducts = nextProducts.map(({ importMeta: _internal, ...product }) => {
  const clean = stripCommercialText(product);
  return {
    ...clean,
    name: displayName(clean.name, Number(clean.source?.pages?.[0])),
    source: { ...clean.source, catalog: sanitizeCommercialText(clean.source?.catalog) || "Karahanlı Gıda kataloğu" },
  };
});
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
await writeFile(productsPath, `${JSON.stringify({ ...current, schemaVersion: 3, generatedAt: new Date().toISOString(), generatedFrom: "Karahanlı Gıda Excel Kataloğu", products: publicProducts }, null, 2)}\n`);
await writeFile(archivePath, `${JSON.stringify({ schemaVersion: 3, generatedAt: new Date().toISOString(), source: "Excel catalog import", products: archivedProducts }, null, 2)}\n`);
console.log(JSON.stringify({ published: publicProducts.length, publishedExcelRows: rows.length, excelFamilies: excelFamilies.length, archived: archivedProducts.length, duplicateGroups: duplicateGroups.length, researchNeeded: report.researchNeededCount, reportPath }, null, 2));
