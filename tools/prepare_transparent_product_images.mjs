#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(new URL("../admin-api/package.json", import.meta.url));
const sharp = require("sharp");

const catalogPath = path.resolve(process.argv[2] || "data/products.json");
const manifestPath = path.join(path.dirname(catalogPath), "catalog-manifest.json");
const auditOutput = path.resolve(process.argv[3] || "output/image-audit/risky-backgrounds.png");
const reportOutput = path.resolve(process.argv[4] || "output/image-audit/transparency-report.json");
const catalog = JSON.parse(await readFile(catalogPath, "utf8"));
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const replacedAssets = [];

function localAssetPath(src) {
  return path.resolve(src.replace(/^\//, ""));
}

function median(values) {
  if (!values.length) return 255;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)];
}

function edgeStats(data, width, height, channels) {
  let edge = 0;
  let neutral = 0;
  const reds = [];
  const greens = [];
  const blues = [];

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (x > 2 && x < width - 3 && y > 2 && y < height - 3) continue;
      edge += 1;
      const index = (y * width + x) * channels;
      const red = data[index];
      const green = data[index + 1];
      const blue = data[index + 2];
      const spread = Math.max(red, green, blue) - Math.min(red, green, blue);
      const average = (red + green + blue) / 3;
      if (spread < 12 && average > 215) neutral += 1;
      if (spread < 30 && average > 195) {
        reds.push(red);
        greens.push(green);
        blues.push(blue);
      }
    }
  }

  return {
    neutralRatio: neutral / edge,
    background: [median(reds), median(greens), median(blues)],
  };
}

function removeConnectedLightBackground(data, width, height, background) {
  const pixels = width * height;
  const removed = new Uint8Array(pixels);
  const queued = new Uint8Array(pixels);
  const queue = new Int32Array(pixels);
  let head = 0;
  let tail = 0;

  function qualifies(pixel) {
    const index = pixel * 4;
    const red = data[index];
    const green = data[index + 1];
    const blue = data[index + 2];
    const spread = Math.max(red, green, blue) - Math.min(red, green, blue);
    const average = (red + green + blue) / 3;
    const distance = Math.sqrt(
      (red - background[0]) ** 2
      + (green - background[1]) ** 2
      + (blue - background[2]) ** 2,
    );
    return average >= 202 && spread <= 42 && distance <= 100;
  }

  function enqueue(pixel) {
    if (queued[pixel] || !qualifies(pixel)) return;
    queued[pixel] = 1;
    queue[tail] = pixel;
    tail += 1;
  }

  for (let x = 0; x < width; x += 1) {
    enqueue(x);
    enqueue((height - 1) * width + x);
  }
  for (let y = 1; y < height - 1; y += 1) {
    enqueue(y * width);
    enqueue(y * width + width - 1);
  }

  while (head < tail) {
    const pixel = queue[head];
    head += 1;
    removed[pixel] = 1;
    const x = pixel % width;
    const y = Math.floor(pixel / width);
    if (x > 0) enqueue(pixel - 1);
    if (x < width - 1) enqueue(pixel + 1);
    if (y > 0) enqueue(pixel - width);
    if (y < height - 1) enqueue(pixel + width);
  }

  let transparent = 0;
  for (let pixel = 0; pixel < pixels; pixel += 1) {
    const alphaIndex = pixel * 4 + 3;
    if (removed[pixel]) {
      data[alphaIndex] = 0;
      transparent += 1;
      continue;
    }

    const x = pixel % width;
    const y = Math.floor(pixel / width);
    const touchesBackground = (x > 0 && removed[pixel - 1])
      || (x < width - 1 && removed[pixel + 1])
      || (y > 0 && removed[pixel - width])
      || (y < height - 1 && removed[pixel + width]);
    if (touchesBackground) data[alphaIndex] = Math.min(data[alphaIndex], 210);
  }

  return transparent / pixels;
}

function removeThinVerticalFrameArtifacts(data, width, height) {
  const searchWidth = Math.max(2, Math.floor(width * 0.06));

  for (const [start, end] of [[0, searchWidth], [width - searchWidth, width]]) {
    for (let x = start; x < end; x += 1) {
      let darkPixels = 0;
      for (let y = 0; y < height; y += 1) {
        const index = (y * width + x) * 4;
        const average = (data[index] + data[index + 1] + data[index + 2]) / 3;
        if (data[index + 3] > 0 && average < 55) darkPixels += 1;
      }
      if (darkPixels / height < 0.65) continue;

      for (let offset = -1; offset <= 1; offset += 1) {
        const targetX = x + offset;
        if (targetX < 0 || targetX >= width) continue;
        for (let y = 0; y < height; y += 1) {
          data[(y * width + targetX) * 4 + 3] = 0;
        }
      }
    }
  }
}

function escapeXml(value) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function wrapLabel(value, max = 29) {
  const words = value.split(/\s+/);
  const lines = [];
  let line = "";
  for (const word of words) {
    if (`${line} ${word}`.trim().length <= max) line = `${line} ${word}`.trim();
    else {
      if (line) lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines.slice(0, 3);
}

async function createAuditBoard(products) {
  const columns = 4;
  const cardWidth = 340;
  const cardHeight = 390;
  const rows = Math.ceil(products.length / columns);
  const composites = [];

  for (let index = 0; index < products.length; index += 1) {
    const product = products[index];
    const left = (index % columns) * cardWidth;
    const top = Math.floor(index / columns) * cardHeight;
    const source = localAssetPath(product.images[0].src);
    const image = await sharp(source)
      .resize(300, 285, { fit: "contain", background: "#f6f3ed" })
      .webp({ quality: 88 })
      .toBuffer();
    const lines = wrapLabel(`${index + 1}. ${product.brand} - ${product.name}`);
    const text = lines.map((line, lineIndex) => `<text x="18" y="${24 + lineIndex * 22}" font-size="16" font-family="Arial" font-weight="${lineIndex === 0 ? 700 : 500}" fill="#1f3328">${escapeXml(line)}</text>`).join("");
    const label = Buffer.from(`<svg width="300" height="82" xmlns="http://www.w3.org/2000/svg"><rect width="300" height="82" fill="#ffffff"/>${text}</svg>`);
    composites.push({ input: image, left: left + 20, top: top + 18 });
    composites.push({ input: label, left: left + 20, top: top + 303 });
  }

  await mkdir(path.dirname(auditOutput), { recursive: true });
  await sharp({
    create: {
      width: columns * cardWidth,
      height: rows * cardHeight,
      channels: 3,
      background: "#e9e5dc",
    },
  }).composite(composites).png().toFile(auditOutput);
}

const results = [];
const risky = [];

for (const product of catalog.products) {
  const sourcePath = localAssetPath(product.images[0].src);
  const previousAssets = [product.images[0].src, product.images[0].thumbnailSrc];
  const sample = await sharp(sourcePath)
    .resize(120, 120, { fit: "fill" })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const stats = edgeStats(sample.data, sample.info.width, sample.info.height, sample.info.channels);

  if (stats.neutralRatio < 0.5) {
    risky.push(product);
    results.push({ id: product.id, name: product.name, status: "manual-review", edgeNeutralRatio: stats.neutralRatio });
    continue;
  }

  const original = await sharp(sourcePath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  removeThinVerticalFrameArtifacts(original.data, original.info.width, original.info.height);
  const transparency = removeConnectedLightBackground(
    original.data,
    original.info.width,
    original.info.height,
    stats.background,
  );
  if (transparency < 0.03 || transparency > 0.97) {
    risky.push(product);
    results.push({ id: product.id, name: product.name, status: "quality-review", edgeNeutralRatio: stats.neutralRatio, transparency });
    continue;
  }

  const fullBuffer = await sharp(original.data, {
    raw: {
      width: original.info.width,
      height: original.info.height,
      channels: 4,
    },
  }).webp({ quality: 92, alphaQuality: 100 }).toBuffer();
  const hash = createHash("sha256").update(fullBuffer).digest("hex").slice(0, 12);
  const directory = path.dirname(sourcePath);
  const fullPath = path.join(directory, `web-${hash}.webp`);
  const thumbPath = path.join(directory, `web-${hash}-thumb.webp`);
  await writeFile(fullPath, fullBuffer);
  await sharp(fullBuffer).resize(480, 480, { fit: "contain" }).webp({ quality: 88, alphaQuality: 100 }).toFile(thumbPath);

  const relativeFull = path.relative(process.cwd(), fullPath).replaceAll("\\", "/");
  const relativeThumb = path.relative(process.cwd(), thumbPath).replaceAll("\\", "/");
  product.images[0].src = relativeFull;
  product.images[0].thumbnailSrc = relativeThumb;
  replacedAssets.push(...previousAssets);
  results.push({ id: product.id, name: product.name, status: "transparent", edgeNeutralRatio: stats.neutralRatio, transparency, src: relativeFull });
}

await createAuditBoard(risky);
const productsById = new Map(catalog.products.map((product) => [product.id, product]));
for (const item of manifest.items) {
  const product = productsById.get(item.productId);
  if (!product) continue;
  item.assets = product.images.flatMap((image) => [image.src, image.thumbnailSrc]);
}
await mkdir(path.dirname(reportOutput), { recursive: true });
await writeFile(reportOutput, `${JSON.stringify({ generatedAt: new Date().toISOString(), catalogPath, safe: results.filter((item) => item.status === "transparent").length, risky: risky.length, results }, null, 2)}\n`);
await writeFile(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`);
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

const referencedAssets = new Set(catalog.products.flatMap((product) => product.images.flatMap((image) => [image.src, image.thumbnailSrc])));
const assetRoot = path.resolve("assets/products");
for (const asset of new Set(replacedAssets)) {
  if (referencedAssets.has(asset)) continue;
  const target = localAssetPath(asset);
  if (!target.startsWith(`${assetRoot}${path.sep}`)) throw new Error(`Güvensiz temizleme yolu: ${target}`);
  await unlink(target).catch((error) => {
    if (error.code !== "ENOENT") throw error;
  });
}

console.log(JSON.stringify({
  safe: results.filter((item) => item.status === "transparent").length,
  risky: risky.length,
  auditOutput,
  reportOutput,
}, null, 2));
