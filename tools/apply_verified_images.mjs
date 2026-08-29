#!/usr/bin/env node
/** Download only manually verified product images and create local WebP assets. */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "../admin-api/node_modules/sharp/dist/index.mjs";
import { slugifyCatalog } from "../admin-api/src/catalog-import.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const productsPath = resolve(root, "data/products.json");
const reportPath = resolve(root, "data/catalog-import-report.json");
const sourcesPath = resolve(root, "data/verified-image-sources.json");
const manifestPath = resolve(root, "data/catalog-manifest.json");
const productsPayload = JSON.parse(await readFile(productsPath, "utf8"));
const sourceMap = JSON.parse(await readFile(sourcesPath, "utf8"));
const report = JSON.parse(await readFile(reportPath, "utf8"));
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const now = new Date().toISOString();
const errors = [];
let applied = 0;

function hash(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function imagePath(product, fileName) {
  return `assets/products/${slugifyCatalog(product.brand)}/${product.slug}/${fileName}`;
}

for (const [productId, source] of Object.entries(sourceMap)) {
  const product = productsPayload.products.find((candidate) => candidate.id === productId);
  if (!product) {
    errors.push(`${productId}: ürün bulunamadı`);
    continue;
  }
  if (product.images?.length) continue;
  if (!source.imageUrl || !source.sourceUrl) {
    errors.push(`${productId}: sourceUrl ve imageUrl zorunlu`);
    continue;
  }
  try {
    let input;
    let sourceContentType = "";
    if (source.localImagePath) {
      input = await readFile(resolve(root, source.localImagePath));
      sourceContentType = "local-derived";
    } else {
      const response = await fetch(source.imageUrl, { headers: { "user-agent": "Karahanli-Gida-Catalog-Importer/1.0" } });
      if (!response.ok) throw new Error(`görsel HTTP ${response.status}`);
      sourceContentType = response.headers.get("content-type") || "";
      if (!sourceContentType.startsWith("image/")) throw new Error(`görsel türü ${sourceContentType || "bilinmiyor"}`);
      input = Buffer.from(await response.arrayBuffer());
    }
    const metadata = await sharp(input).metadata();
    if (!metadata.width || !metadata.height || Math.min(metadata.width, metadata.height) < 600) {
      throw new Error(`düşük çözünürlük (${metadata.width || 0}x${metadata.height || 0}); AI iyileştirmesi sonrası tekrar doğrulanmalı`);
    }
    const fileHash = hash(input);
    const stem = `web-${fileHash.slice(0, 12)}`;
    const dir = resolve(root, "assets", "products", slugifyCatalog(product.brand), product.slug);
    await mkdir(dir, { recursive: true });
    const fullPath = resolve(dir, `${stem}.webp`);
    const thumbPath = resolve(dir, `${stem}-thumb.webp`);
    await sharp(input).rotate().resize({ width: 1800, height: 1800, fit: "inside", withoutEnlargement: false }).webp({ quality: 90 }).toFile(fullPath);
    await sharp(input).rotate().resize({ width: 640, height: 640, fit: "inside", withoutEnlargement: false }).webp({ quality: 82 }).toFile(thumbPath);
    product.images = [{ id: `image-web-${fileHash.slice(0, 10)}`, src: imagePath(product, `${stem}.webp`), thumbnailSrc: imagePath(product, `${stem}-thumb.webp`), alt: product.name, order: 1, variantIds: [] }];
    product.imageStatus = "verified";
    product.description = String(product.description || "").replace(
      "Resmî ürün görseli doğrulanıyor.",
      source.processing === "ai-enhanced" ? "Resmî ürün görseli doğrulanmış kaynak üzerinden iyileştirildi." : "Resmî ürün görseli doğrulandı."
    );
    source.checkedAt = now;
    source.inputType = sourceContentType;
    source.fileHash = fileHash;
    source.width = metadata.width;
    source.height = metadata.height;
    source.appliedAt = now;
    source.status = "applied";
    const rowNumbers = product.variants.filter((variant) => String(variant.id).startsWith("excel-")).map((variant) => Number(String(variant.id).slice(6))).filter(Number.isFinite);
    for (const row of report.rows) if (rowNumbers.includes(Number(row.row))) row.imageStatus = "verified";
    const oldItem = manifest.items.find((item) => item.productId === product.id);
    const manifestItem = oldItem || { productId: product.id, slug: product.slug, catalog: "Karahanlı Gıda Excel Kataloğu", pages: product.source.pages, assets: [], originalImages: [] };
    manifestItem.assets = [...new Set([...(manifestItem.assets || []), product.images[0].src, product.images[0].thumbnailSrc])];
    manifestItem.originalImages = [...(manifestItem.originalImages || []).filter((item) => item.type !== "official"), { type: source.processing === "ai-enhanced" ? "ai-enhanced" : "official", url: source.imageUrl || source.localImagePath, sourceUrl: source.sourceUrl, checkedAt: now, sha256: fileHash, processing: source.processing || "source-preserved" }];
    if (!oldItem) manifest.items.push(manifestItem);
    applied += 1;
    console.log(`${product.id}: ${metadata.width}x${metadata.height} -> ${product.images[0].src}`);
  } catch (error) {
    source.checkedAt = now;
    source.status = "research-needed";
    source.error = String(error?.message || error);
    errors.push(`${productId}: ${source.error}`);
  }
}

report.researchNeededCount = productsPayload.products.filter((product) => product.imageStatus === "research-needed").length;
report.verifiedImageCount = productsPayload.products.filter((product) => product.imageStatus === "verified").length;
await writeFile(productsPath, `${JSON.stringify(productsPayload, null, 2)}\n`);
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
await writeFile(sourcesPath, `${JSON.stringify(sourceMap, null, 2)}\n`);
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
if (errors.length) {
  console.error(JSON.stringify({ applied, errors }, null, 2));
  process.exitCode = 1;
} else {
  console.log(JSON.stringify({ applied, remainingResearchNeeded: report.researchNeededCount, verifiedImages: report.verifiedImageCount }, null, 2));
}
