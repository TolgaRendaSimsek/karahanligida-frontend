#!/usr/bin/env node

import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { encodeProductBuffers, prepareTransparentBuffer } from "../admin-api/src/transparency.mjs";

const root = process.cwd();
const args = new Set(process.argv.slice(2));
const catalogPath = path.resolve(process.env.CATALOG_PATH || "data/products.json");
const manifestPath = path.join(path.dirname(catalogPath), "catalog-manifest.json");
const reportPath = path.resolve(process.env.TRANSPARENCY_REPORT || "data/backups/transparency-report.json");
const backupRoot = path.resolve(process.env.TRANSPARENCY_BACKUP_ROOT || "data/backups/transparency-originals");
const dryRun = args.has("--dry-run") || !args.has("--apply");
const thresholdArg = process.argv.find((value) => value.startsWith("--threshold="));
const edgeThreshold = thresholdArg ? Number(thresholdArg.split("=")[1]) : 0.85;

const catalog = JSON.parse(await readFile(catalogPath, "utf8"));
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));

function sourcePath(src) {
  if (!src) return null;
  const clean = String(src).replace(/^\/+/, "");
  if (clean.startsWith("assets/")) return path.resolve(root, clean);
  if (clean.startsWith("media/")) return path.resolve(process.env.MEDIA_ROOT || "data/media", clean.slice("media/".length));
  return path.resolve(root, clean);
}

function relativeAssetPath(filePath, originalSrc) {
  if (String(originalSrc).replace(/^\/+/, "").startsWith("media/")) {
    const mediaRoot = path.resolve(process.env.MEDIA_ROOT || "data/media");
    return `/media/${path.relative(mediaRoot, filePath).replaceAll("\\", "/")}`;
  }
  return path.relative(root, filePath).replaceAll("\\", "/");
}

async function backupOriginal(source, originalSrc) {
  const clean = String(originalSrc).replace(/^\/+/, "");
  const target = path.join(backupRoot, clean);
  await mkdir(path.dirname(target), { recursive: true });
  await copyFile(source, target);
  return path.relative(root, target).replaceAll("\\", "/");
}

const results = [];
const changedImages = [];

for (const product of catalog.products) {
  for (const image of product.images || []) {
    const source = sourcePath(image.src);
    const item = {
      productId: product.id,
      slug: product.slug,
      name: product.name,
      imageId: image.id,
      source: image.src,
      status: "missing",
      edgeNeutralRatio: null,
      transparency: null,
    };
    if (!source) {
      results.push(item);
      continue;
    }
    try {
      const prepared = await prepareTransparentBuffer(source, { edgeThreshold });
      item.edgeNeutralRatio = Number(prepared.edgeNeutralRatio.toFixed(4));
      item.transparency = Number(prepared.transparency.toFixed(4));
      item.status = prepared.safe ? "transparent" : "review";
      if (prepared.safe && !dryRun) {
        const { full, thumbnail } = await encodeProductBuffers(prepared, source);
        const digest = createHash("sha256").update(full).digest("hex").slice(0, 16);
        const directory = path.dirname(source);
        const fullPath = path.join(directory, `web-${digest}-transparent.webp`);
        const thumbPath = path.join(directory, `web-${digest}-transparent-thumb.webp`);
        const backup = await backupOriginal(source, image.src);
        await Promise.all([
          writeFile(fullPath, full),
          writeFile(thumbPath, thumbnail),
        ]);
        item.backup = backup;
        item.output = relativeAssetPath(fullPath, image.src);
        item.thumbnailOutput = relativeAssetPath(thumbPath, image.src);
        item.outputHash = digest;
        image.src = item.output;
        image.thumbnailSrc = item.thumbnailOutput;
        changedImages.push(item);
      }
    } catch (error) {
      item.status = "invalid";
      item.error = error.message;
    }
    results.push(item);
  }
}

if (!dryRun) {
  const byId = new Map(catalog.products.map((product) => [product.id, product]));
  for (const entry of manifest.items || []) {
    const product = byId.get(entry.productId);
    if (!product) continue;
    entry.assets = (product.images || []).flatMap((image) => [image.src, image.thumbnailSrc]);
  }
  await mkdir(path.dirname(reportPath), { recursive: true });
  await writeFile(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`);
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
}

const report = {
  generatedAt: new Date().toISOString(),
  catalogPath,
  mode: dryRun ? "dry-run" : "apply",
  edgeThreshold,
  products: catalog.products.length,
  images: results.length,
  safe: results.filter((item) => item.status === "transparent").length,
  review: results.filter((item) => item.status === "review").length,
  missing: results.filter((item) => item.status === "missing").length,
  invalid: results.filter((item) => item.status === "invalid").length,
  changed: changedImages.length,
  backupRoot: dryRun ? null : path.relative(root, backupRoot).replaceAll("\\", "/"),
  results,
};

if (!dryRun) {
  await mkdir(path.dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
}

console.log(JSON.stringify({
  mode: report.mode,
  products: report.products,
  images: report.images,
  safe: report.safe,
  review: report.review,
  missing: report.missing,
  invalid: report.invalid,
  changed: report.changed,
  report: dryRun ? "(dry-run; yazılmadı)" : reportPath,
}, null, 2));
