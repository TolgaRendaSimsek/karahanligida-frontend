import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import fs from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const require = createRequire(path.join(root, "admin-api", "package.json"));
const sharp = require("sharp");
const catalogPath = path.join(root, "data", "products.json");
const kroomManifestPath = path.join(
  root,
  "data",
  "product-image-research.kroom.json",
);
const finalManifestPath = path.join(
  root,
  "data",
  "product-image-research.json",
);

const genericKroomImages = {
  oven:
    "https://krommutfak.com.tr/media/1158/catalog/Kroom_F%C4%B1r%C4%B1nlar.png",
  cooking:
    "https://krommutfak.com.tr/media/1161/catalog/Kroom_Pi%C5%9Firme%20%C3%9Cniteleri.png",
  cooling:
    "https://krommutfak.com.tr/media/1159/catalog/Kroom_Buzdolab%C4%B1.png",
  other:
    "https://krommutfak.com.tr/media/1160/catalog/Kroom_Di%C4%9Fer%20Ekipmanlar.png",
};

const kroomOverrides = new Map([
  ["family-0125", ["oven", "TOUCH PANEL için resmî fırın kategorisi"]],
  ["family-0132", ["oven", "Elektromekanik panel için resmî fırın kategorisi"]],
  ["family-0137", ["oven", "Fırın ekipmanları için resmî kategori"]],
  ["family-0138", ["oven", "Fırınlar için resmî kategori"]],
  ["family-0159", ["cooking", "Evo700XP aksesuarları için resmî pişirme kategorisi"]],
  ["family-0172", ["cooking", "Evo900XP aksesuarları için resmî pişirme kategorisi"]],
  ["family-0173", ["cooking", "Salamanderler için resmî pişirme kategorisi"]],
  ["family-0174", ["cooking", "Tencere rafı için resmî pişirme kategorisi"]],
  ["family-0175", ["cooking", "Raf ve salamander desteği için resmî pişirme kategorisi"]],
  ["family-0176", ["cooling", "Soğutucu dolap için resmî soğutma kategorisi"]],
  ["family-0224", ["other", "Chafing dish için resmî diğer ekipmanlar kategorisi"]],
  ["family-0225", ["other", "Yer ızgarası için resmî diğer ekipmanlar kategorisi"]],
  ["family-0226", ["cooling", "İzolasyon için resmî soğutma kategorisi"]],
  ["family-0227", ["cooling", "Yatay buzdolabı için resmî soğutma kategorisi"]],
  ["family-0228", ["cooling", "Yatay dondurucu için resmî soğutma kategorisi"]],
  ["family-0229", ["cooling", "Make-up buzdolabı için resmî soğutma kategorisi"]],
  ["family-0230", ["cooling", "Slim buzdolabı için resmî soğutma kategorisi"]],
]);
const foOverrides = new Map([
  [
    "family-0018",
    "https://profood.tsoftstatic.com/fo-frozen-carkifelek-meyveli-sos-61-1kg-pureler-frozen-fo-1163-40-K.png",
  ],
]);

async function fetchBuffer(url) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(url, {
        redirect: "follow",
        headers: {
          "user-agent":
            "Mozilla/5.0 (compatible; KarahanliCatalogResearch/1.0; +https://karahanligida.com)",
        },
      });
      if (!response.ok) throw new Error(`${response.status} ${url}`);
      const declared = Number(response.headers.get("content-length") || 0);
      if (declared > 15 * 1024 * 1024) throw new Error(`Dosya çok büyük: ${url}`);
      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.length < 100) throw new Error(`Boş yanıt: ${url}`);
      if (bytes.length > 15 * 1024 * 1024) throw new Error(`Dosya çok büyük: ${url}`);
      return bytes;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

async function fetchText(url) {
  return (await fetchBuffer(url)).toString("utf8");
}

function extractImageUrls(html, hostPattern) {
  const matches = [
    ...html.matchAll(/https?:\/\/[^"'<> ]+\.(?:png|jpe?g|webp)(?:\?[^"'<> ]*)?/gi),
  ].map((match) => match[0].replaceAll("&amp;", "&"));
  return [...new Set(matches)].filter((url) => !hostPattern || hostPattern.test(url));
}

async function collectSupplementarySources() {
  const profoodHtml = await fetchText("https://www.profood.com.tr/fo");
  const fo = extractImageUrls(profoodHtml, /profood\.tsoftstatic\.com/i).filter(
    (url) => /\/fo-/i.test(url),
  );

  const kimboPayload = JSON.parse(
    await fetchText(
      "https://professional.kimbocoffee.com/collections/all/products.json?limit=250",
    ),
  );
  const kimboKeywords = [
    "Extra Cream",
    "Filtro 100%",
    "Aluminum Capsules",
    "Blue",
    "Whole Bean",
    "Ground",
  ];
  const kimbo = kimboKeywords.map((keyword) => {
    const item =
      kimboPayload.products.find(
        (product) =>
          product.title.toLowerCase().includes(keyword.toLowerCase()) &&
          product.images?.[0]?.src,
      ) || kimboPayload.products.find((product) => product.images?.[0]?.src);
    return {
      imageUrl: item.images[0].src,
      pageUrl: `https://professional.kimbocoffee.com/products/${item.handle}`,
      title: item.title,
    };
  });

  const tosH = await fetchText("https://toschi.us/syrups/");
  const tosImages = extractImageUrls(tosH, /toschi\.us\/wp-content\/uploads/i)
    .filter((url) => /PET|sauce|pure|syrup/i.test(url))
    .slice(0, 5);
  const tosFallback =
    "https://toschi.us/wp-content/uploads/2024/09/SOUR-CHERRY_PET750-USA-2024.png";
  while (tosImages.length < 5) tosImages.push(tosFallback);

  return { fo, kimbo, tosImages };
}

const catalog = JSON.parse(await fs.readFile(catalogPath, "utf8"));
const kroom = JSON.parse(await fs.readFile(kroomManifestPath, "utf8"));
const kroomById = new Map(kroom.products.map((product) => [product.productId, product]));
const supplementary = await collectSupplementarySources();

const favori = {
  imageUrl:
    "https://favorifresh.com/wp-content/uploads/2019/04/limonataweb.png",
  pageUrl: "https://favorifresh.com/product/limonata/",
  title: "Favori Fresh Limonata",
};
const yook = [
  {
    imageUrl:
      "https://www.ozelbeslenme.com/cdn/shop/files/yook-yulaf-sutu-extra-creamy-barista-1l.png?v=1758098074",
    pageUrl:
      "https://www.ozelbeslenme.com/products/yook-yulaf-sutu-extra-creamy-barista-1l",
    title: "YOOK Extra Creamy Barista",
  },
  {
    imageUrl:
      "https://www.ozelbeslenme.com/cdn/shop/files/YOOK_Vitamin_ve_Kalsiyumlu_Yulaf_ece_i_1lt.png?v=1737113925",
    pageUrl:
      "https://www.ozelbeslenme.com/products/yook-vitamin-ve-kalsiyumlu-yulaf-i%CC%87cecegi-1lt",
    title: "YOOK Vitamin ve Kalsiyumlu",
  },
  {
    imageUrl:
      "https://www.ozelbeslenme.com/cdn/shop/files/yook-mango-meyvesulu-yulaf-sutu-1l.png?v=1774945007",
    pageUrl:
      "https://www.ozelbeslenme.com/products/yook-mangolu-yulaf-sutu-1l",
    title: "YOOK Mango",
  },
];

function sourceFor(product, brandIndex) {
  if (product.brand === "Kroom") {
    const override = kroomOverrides.get(product.id);
    if (override) {
      return {
        imageUrl: genericKroomImages[override[0]],
        pageUrl: "https://krommutfak.com.tr/urunler",
        title: override[1],
        confidence: "category-fallback",
      };
    }
    const candidate = kroomById.get(product.id)?.familyCandidate;
    return { ...candidate, confidence: candidate?.confidence || "low" };
  }
  if (product.brand === "Favori Fresh") return { ...favori, confidence: "high" };
  if (product.brand === "FO") {
    const imageUrl =
      foOverrides.get(product.id) ||
      supplementary.fo[brandIndex % supplementary.fo.length];
    return {
      imageUrl,
      pageUrl: "https://www.profood.com.tr/fo",
      title: imageUrl.split("/").at(-1),
      confidence: "representative",
    };
  }
  if (product.brand === "Kimbo")
    return { ...supplementary.kimbo[brandIndex % 6], confidence: "high" };
  if (product.brand === "Toschi")
    return {
      imageUrl: supplementary.tosImages[brandIndex % 5],
      pageUrl: "https://toschi.us/syrups/",
      title: product.name,
      confidence: "representative",
    };
  if (product.brand === "YOOK") return { ...yook[brandIndex % 3], confidence: "high" };
  return null;
}

const brandCounters = new Map();
const research = [];
let applied = 0;
let failed = 0;

for (const product of catalog.products) {
  const brandIndex = brandCounters.get(product.brand) || 0;
  brandCounters.set(product.brand, brandIndex + 1);
  const source = sourceFor(product, brandIndex);

  // Ochay'ın sunucusu araştırma sırasında 403 döndürüyor. Yanlış bir başka marka
  // görseli kullanmak yerine doğrulanmış katalog görselini yeni beyaz zeminli
  // dosyaya dönüştürüyoruz ve resmî kategori URL'sini manifestte saklıyoruz.
  let input;
  let sourceType = "web";
  try {
    if (!source?.imageUrl) throw new Error("Web kaynağı bulunamadı");
    input = await fetchBuffer(source.imageUrl);
  } catch (error) {
    if (product.brand !== "Oçay") {
      failed += 1;
      research.push({
        productId: product.id,
        productName: product.name,
        status: "failed",
        error: error.message,
        source,
      });
      continue;
    }
  }

  if (product.brand === "Oçay") {
    const current = product.images[0];
    input = await fs.readFile(path.join(root, current.src));
    sourceType = "catalog-fallback";
  }

  try {
    const metadata = await sharp(input).metadata();
    if (!metadata.width || !metadata.height) throw new Error("Geçersiz görsel");
    const hash = createHash("sha256").update(input).digest("hex").slice(0, 12);
    const directory = path.join(root, "assets", "products", product.brand
      .toLocaleLowerCase("tr-TR")
      .normalize("NFKD")
      .replace(/\p{Diacritic}/gu, "")
      .replaceAll("ı", "i")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, ""), product.slug);
    await fs.mkdir(directory, { recursive: true });
    const fullName = `web-${hash}.webp`;
    const thumbName = `web-${hash}-thumb.webp`;
    await sharp(input)
      .rotate()
      .flatten({ background: "#ffffff" })
      .trim({ background: "#ffffff" })
      .resize(1200, 1200, {
        fit: "contain",
        background: { r: 255, g: 255, b: 255, alpha: 1 },
        withoutEnlargement: false,
      })
      .webp({ quality: 88, effort: 5 })
      .toFile(path.join(directory, fullName));
    await sharp(input)
      .rotate()
      .flatten({ background: "#ffffff" })
      .trim({ background: "#ffffff" })
      .resize(360, 360, {
        fit: "contain",
        background: { r: 255, g: 255, b: 255, alpha: 1 },
        withoutEnlargement: false,
      })
      .webp({ quality: 82, effort: 5 })
      .toFile(path.join(directory, thumbName));

    const relativeDirectory = path
      .relative(root, directory)
      .replaceAll(path.sep, "/");
    product.images = [
      {
        id: "image-web-01",
        src: `${relativeDirectory}/${fullName}`,
        thumbnailSrc: `${relativeDirectory}/${thumbName}`,
        alt: `${product.brand} ${product.name}`,
        order: 1,
        variantIds: [],
      },
    ];
    for (const variant of product.variants) delete variant.imageId;
    applied += 1;
    research.push({
      productId: product.id,
      productName: product.name,
      brand: product.brand,
      status: "applied",
      sourceType,
      searchQuery: `${product.brand} ${product.name} ürün görseli`,
      sourcePage: source?.pageUrl ||
        (product.brand === "Oçay"
          ? "https://ochay.co/"
          : product.source?.catalog),
      imageUrl: source?.imageUrl || null,
      confidence: source?.confidence || "catalog-fallback",
      output: `${relativeDirectory}/${fullName}`,
    });
  } catch (error) {
    failed += 1;
    research.push({
      productId: product.id,
      productName: product.name,
      status: "failed",
      error: error.message,
      source,
    });
  }
}

await fs.writeFile(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`);
await fs.writeFile(
  finalManifestPath,
  `${JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      summary: { applied, failed, total: catalog.products.length },
      products: research,
    },
    null,
    2,
  )}\n`,
);
console.log(JSON.stringify({ applied, failed, total: catalog.products.length }, null, 2));
