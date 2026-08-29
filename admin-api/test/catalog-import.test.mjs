import test from "node:test";
import assert from "node:assert/strict";
import { buildImportPreview, catalogTaxonomy, draftFromImportRow, inferExcelCategory } from "../src/catalog-import.mjs";

const rows = [
  { row: 10, section: "ÇEKİRDEK KAHVE GRUBU", name: "KİMBO İNTENSO ÇEKİRDEK KAHVE 1 KG", pack: 6 },
  { row: 13, section: "ÇEKİRDEK KAHVE GRUBU", name: "COFFE HİLL FİLTER KAHVE 1000 GR", pack: 8 },
  { row: 27, section: "FİLİTRE KAHVE & DÜNYA KAHVELERİ GRUBU", name: "COFFE HİLL FİLTER KAHVE 1000 GR", pack: 6 },
  { row: 185, section: "GIDA DIŞI ÜRÜNLER", name: "15", pack: "25 PAKET" },
];

test("Excel grupları yeni kategori ağacına ayrılır", () => {
  assert.deepEqual(inferExcelCategory(rows[0]), ["Kahve", "Çekirdek Kahve"]);
  assert.deepEqual(inferExcelCategory(rows[3]), ["Gıda Dışı Ürünler", "Diğer Sarf Ürünleri"]);
  assert.deepEqual(inferExcelCategory({ section: "FİLİTRE KAHVE & DÜNYA KAHVELERİ GRUBU", name: "KİMBO KAPSUL KAHVE NESPRESSO" }), ["Kahve", "Kapsül Kahve"]);
  assert.equal(catalogTaxonomy().find((category) => category.name === "Kahve Makineleri").subcategories.length, 4);
});

test("tekrarlar ve belirsiz satır metadata ile yayınlanabilir", () => {
  const preview = buildImportPreview({ rows, existingProducts: [] });
  assert.equal(preview.counts.total, 4);
  assert.equal(preview.counts.duplicates, 2);
  assert.equal(preview.rows.find((row) => row.row === 185).decision, "new-family");
  const draft = draftFromImportRow(preview.rows[0]);
  assert.equal(draft.status, "draft");
  assert.equal(draft.specifications.Ambalaj, "6");
  assert.equal(JSON.stringify(draft).includes("stock"), false);
});
