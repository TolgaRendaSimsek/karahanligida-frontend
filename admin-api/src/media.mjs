import { createHash, randomUUID } from "node:crypto";
import { mkdir, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import sharp from "sharp";
import { encodeProductBuffers, prepareTransparentBuffer } from "./transparency.mjs";

const PRODUCT_ID = /^family-[a-z0-9-]{3,80}$/;
const WEBP_FILE = /^[a-f0-9]{16}-(?:full|thumb)\.webp$/;
const FORMAT_MIME = {
  jpeg: new Set(["image/jpeg", "image/jpg"]),
  png: new Set(["image/png"]),
  webp: new Set(["image/webp"]),
  avif: new Set(["image/avif"]),
};

function detectedImageFormat(buffer) {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "jpeg";
  }
  if (
    buffer.length >= 8
    && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return "png";
  }
  if (
    buffer.length >= 12
    && buffer.toString("ascii", 0, 4) === "RIFF"
    && buffer.toString("ascii", 8, 12) === "WEBP"
  ) {
    return "webp";
  }
  if (buffer.length >= 12 && buffer.toString("ascii", 4, 8) === "ftyp") {
    const brands = buffer.toString("ascii", 8, Math.min(buffer.length, 40));
    if (/(?:avif|avis)/.test(brands)) return "avif";
  }
  return "";
}

export function assertProductId(value) {
  if (!PRODUCT_ID.test(value ?? "")) {
    const error = new Error("Geçersiz ürün kimliği.");
    error.status = 400;
    throw error;
  }
  return value;
}

export async function processUpload({
  buffer,
  productId,
  mediaRoot,
  mimeType = "",
}) {
  assertProductId(productId);
  if (!Buffer.isBuffer(buffer) || buffer.length === 0 || buffer.length > 10 * 1024 * 1024) {
    const error = new Error("Görsel boş veya 10 MB sınırını aşıyor.");
    error.status = 413;
    throw error;
  }
  const signatureFormat = detectedImageFormat(buffer);
  if (!signatureFormat) {
    const error = new Error("Yalnızca JPEG, PNG, WebP veya AVIF görseller kabul edilir.");
    error.status = 415;
    throw error;
  }
  if (mimeType && !FORMAT_MIME[signatureFormat].has(mimeType.toLowerCase())) {
    const error = new Error("Dosyanın MIME türü ile görsel imzası eşleşmiyor.");
    error.status = 415;
    throw error;
  }
  let metadata;
  try {
    metadata = await sharp(buffer, { failOn: "error", limitInputPixels: 40_000_000 }).metadata();
  } catch {
    const error = new Error("Dosya geçerli bir görsel değil.");
    error.status = 415;
    throw error;
  }
  const metadataMatches =
    metadata.format === signatureFormat
    || (signatureFormat === "avif" && metadata.format === "heif");
  if (!metadataMatches) {
    const error = new Error("Desteklenmeyen görsel biçimi.");
    error.status = 415;
    throw error;
  }
  if ((metadata.width ?? 0) < 180 || (metadata.height ?? 0) < 180) {
    const error = new Error("Görsel en az 180×180 piksel olmalıdır.");
    error.status = 422;
    throw error;
  }

  let prepared;
  try {
    prepared = await prepareTransparentBuffer(buffer);
  } catch {
    const error = new Error("Görsel işlenemedi.");
    error.status = 415;
    throw error;
  }
  const { full: fullBuffer, thumbnail: thumbnailBuffer } = await encodeProductBuffers(prepared, buffer);
  const digest = createHash("sha256").update(fullBuffer).digest("hex").slice(0, 16);
  const directory = join(mediaRoot, "products", productId);
  await mkdir(directory, { recursive: true });
  const fullName = `${digest}-full.webp`;
  const thumbName = `${digest}-thumb.webp`;
  const fullTemp = join(directory, `.${randomUUID()}.tmp`);
  const thumbTemp = join(directory, `.${randomUUID()}.tmp`);
  await Promise.all([
    writeFile(fullTemp, fullBuffer),
    writeFile(thumbTemp, thumbnailBuffer),
  ]);
  await rename(fullTemp, join(directory, fullName));
  await rename(thumbTemp, join(directory, thumbName));
  return {
    id: `image-${digest}`,
    src: `/media/products/${productId}/${fullName}`,
    thumbnailSrc: `/media/products/${productId}/${thumbName}`,
    alt: "Ürün görseli",
    order: 0,
    variantIds: [],
    source: {
      type: "admin-upload",
      uploadedAt: new Date().toISOString(),
      backgroundRemoval: prepared.status,
      edgeNeutralRatio: Number(prepared.edgeNeutralRatio.toFixed(4)),
      transparency: Number(prepared.transparency.toFixed(4)),
    },
  };
}

export async function moveToTrash({ productId, fileName, mediaRoot }) {
  assertProductId(productId);
  const safeName = basename(fileName);
  if (safeName !== fileName || !WEBP_FILE.test(safeName)) {
    const error = new Error("Geçersiz medya dosyası.");
    error.status = 400;
    throw error;
  }
  const source = join(mediaRoot, "products", productId, safeName);
  const trash = join(mediaRoot, ".trash", new Date().toISOString().slice(0, 10), productId);
  await mkdir(trash, { recursive: true });
  await rename(source, join(trash, safeName));
}

export async function trashUnusedProductMedia({ productId, images, mediaRoot }) {
  assertProductId(productId);
  const directory = join(mediaRoot, "products", productId);
  let fileNames;
  try {
    fileNames = await readdir(directory);
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
  const inUse = new Set(
    (images ?? [])
      .flatMap((image) => [image.src, image.thumbnailSrc])
      .filter((source) => source?.startsWith(`/media/products/${productId}/`))
      .map((source) => basename(source)),
  );
  const unused = fileNames.filter((fileName) => WEBP_FILE.test(fileName) && !inUse.has(fileName));
  await Promise.all(
    unused.map((fileName) => moveToTrash({ productId, fileName, mediaRoot })),
  );
  return unused;
}

export async function trashProductMedia({ productId, mediaRoot }) {
  assertProductId(productId);
  const source = join(mediaRoot, "products", productId);
  try {
    await stat(source);
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
  const trash = join(mediaRoot, ".trash", new Date().toISOString().slice(0, 10));
  await mkdir(trash, { recursive: true });
  const target = join(trash, `${productId}-${Date.now()}`);
  await rename(source, target);
  return target;
}

export async function cleanupExpiredTrash({ mediaRoot, retentionDays = 30, now = Date.now() }) {
  const trashRoot = join(mediaRoot, ".trash");
  let entries;
  try {
    entries = await readdir(trashRoot, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
  const cutoff = now - retentionDays * 24 * 60 * 60 * 1000;
  const removed = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || !/^\d{4}-\d{2}-\d{2}$/.test(entry.name)) continue;
    const timestamp = Date.parse(`${entry.name}T00:00:00Z`);
    if (Number.isNaN(timestamp) || timestamp >= cutoff) continue;
    await rm(join(trashRoot, entry.name), { recursive: true, force: true });
    removed.push(entry.name);
  }
  return removed;
}
