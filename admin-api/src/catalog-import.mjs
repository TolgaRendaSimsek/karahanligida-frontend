const STOP_WORDS = new Set([
  "ve", "ile", "icin", "bir", "grup", "grubu", "cesitleri", "cesit", "serisi", "normal",
  "profesyonel", "premium", "kg", "gr", "grlik", "ml", "lit", "adet", "paket", "koli",
  "kahve", "urun", "ürün", "suruplari", "suruplar", "püre", "püreleri", "sos", "soslar",
]);

export function normalizeCatalogText(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("tr-TR")
    .replace(/ı/g, "i")
    .replace(/[^a-z0-9]+/gi, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function slugifyCatalog(value) {
  return normalizeCatalogText(value).replace(/ /g, "-").slice(0, 96) || "urun";
}

const CATEGORY_TREE = [
  { name: "Kahve", subcategories: ["Çekirdek Kahve", "Filtre Kahve", "Kapsül Kahve", "Türk Kahvesi ve Yöresel"] },
  { name: "Çay", subcategories: ["Siyah Çay", "Bitki Çayları"] },
  { name: "Şurup ve Püreler", subcategories: ["Kokteyl Şurupları", "Meyve Püreleri"] },
  { name: "Soslar", subcategories: ["Profesyonel Soslar", "Topping ve Dekor Sosları"] },
  { name: "Gıda Ürünleri", subcategories: ["Toz İçecekler", "Süt ve Krema", "Tatlı/Topping Ürünleri", "Diğer Gıda Ürünleri"] },
  { name: "Donuk Ürünler", subcategories: ["Donuk Meyveler", "Donuk İçecekler"] },
  { name: "Gıda Dışı Ürünler", subcategories: ["Bardak ve Kapak", "Pipet ve Karıştırıcı", "Servis Sarfı", "Temizlik Ürünleri", "Diğer Sarf Ürünleri"] },
  { name: "Kahve Makineleri", subcategories: ["Espresso Kahve Makineleri", "Süper Otomatik Kahve Makineleri", "Filtre Kahve Makineleri", "Kahve Değirmenleri"] },
  { name: "Endüstriyel Mutfak Ekipmanları", subcategories: [] },
];

export function catalogTaxonomy() {
  return CATEGORY_TREE.map((entry) => ({
    id: slugifyCatalog(entry.name),
    name: entry.name,
    slug: slugifyCatalog(entry.name),
    subcategories: entry.subcategories.map((name) => ({ name, slug: slugifyCatalog(name) })),
    status: "published",
  }));
}

function sectionText(row) {
  return normalizeCatalogText(row.section);
}

export function inferExcelCategory(row) {
  const section = sectionText(row);
  const name = normalizeCatalogText(row.name);
  // Excel section is authoritative for food/consumable rows. In particular,
  // Nespresso capsules are coffee products, not espresso machines.
  if (section.includes("cekirdek") || section.includes("filtre kahve") || section.includes("filitre kahve") || section.includes("turk kahvesi")) {
    if (section.includes("cekirdek")) return ["Kahve", "Çekirdek Kahve"];
    if (name.includes("kapsul")) return ["Kahve", "Kapsül Kahve"];
    if (section.includes("filtre") || section.includes("filitre")) return ["Kahve", "Filtre Kahve"];
    return ["Kahve", "Türk Kahvesi ve Yöresel"];
  }
  if (section.includes("cay")) return ["Çay", section.includes("bitki") ? "Bitki Çayları" : "Siyah Çay"];
  if (section.includes("kokteyl")) return ["Şurup ve Püreler", "Kokteyl Şurupları"];
  if (section.includes("meyve pure") || section.includes("meyve püre")) {
    return [name.includes("sos") || name.includes("topping") || name.includes("dekor") ? "Soslar" : "Şurup ve Püreler", name.includes("sos") || name.includes("topping") || name.includes("dekor") ? "Topping ve Dekor Sosları" : "Meyve Püreleri"];
  }
  if (section.includes("profosyonel sos") || section.includes("profesyonel sos")) return ["Soslar", "Profesyonel Soslar"];
  if (section.includes("donuk")) return ["Donuk Ürünler", name.includes("meyve") ? "Donuk Meyveler" : "Donuk İçecekler"];
  if (section.includes("gida urun")) {
    if (name.includes("toz icecek")) return ["Gıda Ürünleri", "Toz İçecekler"];
    if (name.includes("sut") || name.includes("krema")) return ["Gıda Ürünleri", "Süt ve Krema"];
    if (name.includes("cikolata") || name.includes("biskuvi") || name.includes("milks") || name.includes("santi")) return ["Gıda Ürünleri", "Tatlı/Topping Ürünleri"];
    return ["Gıda Ürünleri", "Diğer Gıda Ürünleri"];
  }
  if (section.includes("gida disi")) {
    if (name.includes("bardak") || name.includes("kapak") || name.includes("hutamaki")) return ["Gıda Dışı Ürünler", "Bardak ve Kapak"];
    if (name.includes("pipet") || name.includes("karistirici") || name.includes("filtre kahve kagidi")) return ["Gıda Dışı Ürünler", "Pipet ve Karıştırıcı"];
    if (name.includes("temiz") || name.includes("puly") || name.includes("poligaf")) return ["Gıda Dışı Ürünler", "Temizlik Ürünleri"];
    if (name.includes("frenc") || name.includes("blender") || name.includes("sifon")) return ["Gıda Dışı Ürünler", "Servis Sarfı"];
    return ["Gıda Dışı Ürünler", "Diğer Sarf Ürünleri"];
  }
  // Machine classification is only applied to explicit machine rows or
  // Kroom records. Never infer a machine from the word "espresso" alone
  // when it is part of a capsule/coffee product name.
  if (!name.includes("nespresso")) {
    if (name.includes("super otomatik")) return ["Kahve Makineleri", "Süper Otomatik Kahve Makineleri"];
    if (name.includes("filtre kahve makinesi")) return ["Kahve Makineleri", "Filtre Kahve Makineleri"];
    if (name.includes("kahve degirmen") || name.includes("kahve degirmeni") || name.includes("degirmen")) return ["Kahve Makineleri", "Kahve Değirmenleri"];
    if (name.includes("espresso makinesi") || name.includes("espresso makina")) return ["Kahve Makineleri", "Espresso Kahve Makineleri"];
  }
  return ["Gıda Ürünleri", "Diğer Gıda Ürünleri"];
}

export function extractBrand(name) {
  const value = String(name ?? "").trim();
  const normalized = normalizeCatalogText(value);
  const brands = [
    ["KİMBO", "Kimbo"], ["COFFE HİLL", "Coffe Hill"], ["CAFE HİLL", "Cafe Hill"], ["CAFEC HİLL", "Cafe Hill"],
    ["LUGANO", "Lugano"], ["MİSKIN", "Miskin"], ["MORNİNG", "Morning"], ["GÜZELÇAY", "Güzel Çay"], ["GÜZEL ÇAY", "Güzel Çay"],
    ["TOSCHİ", "Toschi"], ["TOSCHI", "Toschi"], ["MONTE CRİSTO", "Monte Cristo"], ["MONTE CRISTO", "Monte Cristo"], ["FO", "FO"],
    ["YOOK", "YOOK"], ["FAVORİ", "Favori Fresh"], ["DE LUCCA", "De Lucca"], ["DELUCCA", "De Lucca"], ["REPO", "Repo"],
  ];
  const found = brands.find(([needle]) => normalized.startsWith(normalizeCatalogText(needle)));
  return found?.[1] || "Karahanlı Gıda";
}

export function meaningfulTokens(value) {
  return normalizeCatalogText(value).split(" ").filter((token) => token.length > 2 && !STOP_WORDS.has(token) && !/^\d+$/.test(token));
}

export function officialSourceForBrand(brand) {
  const sources = {
    Kimbo: "https://kimbo.com.tr/",
    Toschi: "https://www.toschi.it/sciroppi-toschi/",
    YOOK: "https://yook.eu/products/organic-oat-drink/",
    "Favori Fresh": "https://favorifresh.com/product/limonata/",
    "De Lucca": "https://www.delucca.com.tr/en/ev-disi-tuketim/",
    "Güzel Çay": "https://kurumsal.ozcay.com.tr/urunler/",
  };
  return sources[brand] || null;
}

export function buildImportPreview({ rows, existingProducts = [] }) {
  const normalizedRows = rows.map((row) => {
    const [category, subcategory] = inferExcelCategory(row);
    const name = String(row.name ?? "").trim();
    const duplicateKey = normalizeCatalogText(name);
    const duplicateRows = rows.filter((candidate) => normalizeCatalogText(candidate.name) === duplicateKey).map((candidate) => candidate.row);
    const tokens = meaningfulTokens(name);
    const candidates = existingProducts.map((product) => {
      const candidateTokens = new Set(meaningfulTokens(`${product.brand} ${product.name}`));
      const score = tokens.reduce((sum, token) => sum + (candidateTokens.has(token) ? 1 : 0), 0)
        + (normalizeCatalogText(product.brand) === normalizeCatalogText(extractBrand(name)) ? 2 : 0);
      return { product, score };
    }).filter((candidate) => candidate.score >= Math.max(2, Math.ceil(tokens.length * 0.55))).sort((a, b) => b.score - a.score);
    const ambiguous = duplicateRows.length > 1 || typeof row.name === "number" || name === "15";
    return {
      row: row.row,
      name,
      brand: extractBrand(name),
      category,
      subcategory,
      packaging: typeof row.pack === "string" || typeof row.pack === "number" ? String(row.pack).trim() : "",
      duplicateRows,
      ambiguous,
      match: candidates[0] ? { id: candidates[0].product.id, name: candidates[0].product.name, score: candidates[0].score } : null,
      // Ambiguity is recorded for admin review, but it must not hide an Excel
      // row from the catalog. Apply creates a variant/family for every row.
      decision: candidates[0] ? "matched" : "new-family",
    };
  });
  return {
    rows: normalizedRows,
    counts: {
      total: normalizedRows.length,
      matched: normalizedRows.filter((row) => row.decision === "matched").length,
      researchNeeded: normalizedRows.filter((row) => row.decision === "research-needed").length,
      ambiguous: normalizedRows.filter((row) => row.ambiguous).length,
      duplicates: normalizedRows.filter((row) => row.duplicateRows.length > 1).length,
    },
  };
}

export function draftFromImportRow(row, { catalogName = "KARAHANLI FİYAT LİSTESİ - Kopya (1).xlsx" } = {}) {
  const slug = `${slugifyCatalog(row.name)}-excel-${row.row}`;
  const variantId = `excel-${row.row}`;
  return {
    id: `family-excel-${String(row.row).padStart(3, "0")}`,
    slug,
    brand: row.brand,
    name: row.name,
    category: row.category,
    subcategory: row.subcategory,
    summary: `${row.name} için katalog kaydı.`,
    description: `${row.name} ürünü Karahanlı Gıda Excel kataloğunda yer almaktadır. Resmî ürün doğrulaması tamamlanana kadar taslak olarak tutulur.`,
    features: [],
    specifications: row.packaging ? { Ambalaj: row.packaging } : {},
    images: [],
    variants: [{ id: variantId, name: row.name, code: "", attributes: row.packaging ? { Ambalaj: row.packaging } : {} }],
    source: { catalog: catalogName, pages: [Number(row.row)] },
    featured: false,
    status: "draft",
    imageStatus: "research-needed",
    importMeta: {
      excelRow: Number(row.row),
      duplicateRows: row.duplicateRows || [],
      decision: row.ambiguous ? "needs-review" : "research-needed",
      originalName: row.originalName || row.name,
      research: { status: "research-needed", officialUrl: officialSourceForBrand(row.brand), checkedAt: null },
    },
  };
}
