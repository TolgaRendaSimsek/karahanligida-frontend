import fs from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const catalogPath = path.join(root, "data", "products.json");
const manifestPath = path.join(root, "data", "product-image-research.kroom.json");
const baseUrl = "https://krommutfak.com.tr";

function decodeHtml(value = "") {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, code) =>
      String.fromCodePoint(Number.parseInt(code, 16)),
    )
    .replace(/&#(\d+);/g, (_, code) =>
      String.fromCodePoint(Number.parseInt(code, 10)),
    )
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&nbsp;", " ");
}

function normalize(value = "") {
  return decodeHtml(value)
    .toLocaleLowerCase("tr-TR")
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .replaceAll("ı", "i")
    .replaceAll("’", "'")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function compact(value = "") {
  return normalize(value).replaceAll(" ", "");
}

function tokens(value = "") {
  return new Set(
    normalize(value)
      .split(" ")
      .filter((token) => token.length > 1),
  );
}

function similarity(left, right) {
  const a = tokens(left);
  const b = tokens(right);
  if (!a.size || !b.size) return 0;
  let intersection = 0;
  for (const token of a) {
    if (b.has(token)) intersection += 1;
  }
  return intersection / new Set([...a, ...b]).size;
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: {
      "user-agent":
        "Mozilla/5.0 (compatible; KarahanliCatalogResearch/1.0; +https://karahanligida.com)",
    },
  });
  if (!response.ok) {
    throw new Error(`${url} returned ${response.status}`);
  }
  return response.text();
}

function parseCards(html) {
  const expression =
    /<a class='art-picture[^>]+href="([^"]+)"[^>]*>\s*<img data-src="([^"]+)" alt="([^"]+)"/gi;
  return [...html.matchAll(expression)].map((match) => {
    const pageUrl = new URL(decodeHtml(match[1]), baseUrl).href;
    const imageUrl = new URL(decodeHtml(match[2]), baseUrl).href;
    const title = decodeHtml(match[3]).replace(/\s+resmi$/i, "").trim();
    return { title, pageUrl, imageUrl };
  });
}

function chooseCandidate(product, variant, cards) {
  const code = variant.code?.trim() || "";
  const codeKey = compact(code);
  const variantLabel =
    variant.name && variant.name !== "Katalog seçeneği"
      ? variant.name
      : product.name;

  let candidates = cards;
  if (codeKey.length >= 3) {
    const codeMatches = cards.filter((card) =>
      compact(card.title).includes(codeKey),
    );
    if (codeMatches.length) candidates = codeMatches;
  }

  const ranked = candidates
    .map((card) => {
      const titleKey = compact(card.title);
      const exactCode = codeKey.length >= 3 && titleKey.includes(codeKey);
      const nameScore = similarity(variantLabel, card.title);
      const familyScore = similarity(product.name, card.title);
      const score = (exactCode ? 0.65 : 0) + nameScore * 0.25 + familyScore * 0.1;
      return { ...card, score, exactCode };
    })
    .sort((a, b) => b.score - a.score);

  const best = ranked[0];
  if (!best) return null;
  const confidence =
    best.exactCode && best.score >= 0.75
      ? "high"
      : best.score >= 0.62
        ? "medium"
        : "low";
  return {
    ...best,
    confidence,
    query: `site:krommutfak.com.tr "${code || variantLabel}"`,
  };
}

function chooseFamilyCandidate(product, cards) {
  const variantCandidates = product.variants
    .map((variant) => chooseCandidate(product, variant, cards))
    .filter(Boolean);
  const rankedByFamily = cards
    .map((card) => ({
      ...card,
      familySimilarity: similarity(product.name, card.title),
    }))
    .sort((a, b) => b.familySimilarity - a.familySimilarity);
  const exactVariant = variantCandidates.find(
    (candidate) => candidate.exactCode && candidate.score >= 0.75,
  );
  const best = exactVariant || rankedByFamily[0] || null;
  if (!best) return null;
  const familySimilarity =
    best.familySimilarity ?? similarity(product.name, best.title);
  return {
    title: best.title,
    pageUrl: best.pageUrl,
    imageUrl: best.imageUrl,
    query: `site:krommutfak.com.tr "${product.name}"`,
    score: Math.max(best.score || 0, familySimilarity),
    confidence:
      exactVariant || familySimilarity >= 0.55
        ? "high"
        : familySimilarity >= 0.34
          ? "medium"
          : "low",
  };
}

const catalog = JSON.parse(await fs.readFile(catalogPath, "utf8"));
const listingUrl = `${baseUrl}/urunler?s=960`;
const cards = parseCards(await fetchText(listingUrl))
  .filter(
    (card, index, all) =>
      all.findIndex((candidate) => candidate.pageUrl === card.pageUrl) === index,
  );
const products = catalog.products.filter((product) => product.brand === "Kroom");
const matches = products.map((product) => ({
  productId: product.id,
  slug: product.slug,
  productName: product.name,
  familyCandidate: chooseFamilyCandidate(product, cards),
  variants: product.variants.map((variant) => ({
    variantId: variant.id,
    variantName: variant.name,
    variantCode: variant.code || "",
    candidate: chooseCandidate(product, variant, cards),
  })),
}));

const manifest = {
  generatedAt: new Date().toISOString(),
  source: {
    name: "Krom Mutfak resmî ürün kataloğu",
    url: `${baseUrl}/urunler`,
    pagesScanned: 1,
    listingUrl,
    cardsFound: cards.length,
  },
  summary: {
    productFamilies: products.length,
    variants: matches.reduce((total, product) => total + product.variants.length, 0),
    highConfidence: matches.reduce(
      (total, product) =>
        total +
        product.variants.filter(
          (variant) => variant.candidate?.confidence === "high",
        ).length,
      0,
    ),
    mediumConfidence: matches.reduce(
      (total, product) =>
        total +
        product.variants.filter(
          (variant) => variant.candidate?.confidence === "medium",
        ).length,
      0,
    ),
    lowConfidence: matches.reduce(
      (total, product) =>
        total +
        product.variants.filter(
          (variant) => variant.candidate?.confidence === "low",
        ).length,
      0,
    ),
    highConfidenceFamilies: matches.filter(
      (product) => product.familyCandidate?.confidence === "high",
    ).length,
    mediumConfidenceFamilies: matches.filter(
      (product) => product.familyCandidate?.confidence === "medium",
    ).length,
    lowConfidenceFamilies: matches.filter(
      (product) => product.familyCandidate?.confidence === "low",
    ).length,
  },
  products: matches,
};

await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(JSON.stringify(manifest.summary, null, 2));
console.log(`Manifest: ${manifestPath}`);
