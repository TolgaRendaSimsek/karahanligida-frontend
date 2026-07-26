import { createHash, randomUUID } from "node:crypto";
import { mkdir, readdir, rename } from "node:fs/promises";
import { basename, join } from "node:path";
import sharp from "sharp";

const PRODUCT_ID = /^family-[a-z0-9-]{3,80}$/;
const WEBP_FILE = /^[a-f0-9]{16}-(?:full|thumb)\.webp$/;
const FORMAT_MIME = {
  jpeg: new Set(["image/jpeg", "image/jpg"]),
  png: new Set(["image/png"]),
  webp: new Set(["image/webp"]),
  avif: new Set(["image/avif"]),
  tiff: new Set(["image/tiff"]),
};

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
  originalName = "image",
  mimeType = "",
}) {
  assertProductId(productId);
  if (!Buffer.isBuffer(buffer) || buffer.length === 0 || buffer.length > 10 * 1024 * 1024) {
    const error = new Error("Görsel boş veya 10 MB sınırını aşıyor.");
    error.status = 413;
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
  if (!["jpeg", "png", "webp", "avif", "tiff"].includes(metadata.format)) {
    const error = new Error("Desteklenmeyen görsel biçimi.");
    error.status = 415;
    throw error;
  }
  if (mimeType && !FORMAT_MIME[metadata.format]?.has(mimeType.toLowerCase())) {
    const error = new Error("Dosyanın MIME türü ile görsel imzası eşleşmiyor.");
    error.status = 415;
    throw error;
  }
  if ((metadata.width ?? 0) < 180 || (metadata.height ?? 0) < 180) {
    const error = new Error("Görsel en az 180×180 piksel olmalıdır.");
    error.status = 422;
    throw error;
  }

  const digest = createHash("sha256").update(buffer).digest("hex").slice(0, 16);
  const directory = join(mediaRoot, "products", productId);
  await mkdir(directory, { recursive: true });
  const fullName = `${digest}-full.webp`;
  const thumbName = `${digest}-thumb.webp`;
  const fullTemp = join(directory, `.${randomUUID()}.tmp`);
  const thumbTemp = join(directory, `.${randomUUID()}.tmp`);
  await sharp(buffer)
    .rotate()
    .resize(1600, 1200, { fit: "inside", withoutEnlargement: true })
    .flatten({ background: "#ffffff" })
    .webp({ quality: 86, effort: 5 })
    .toFile(fullTemp);
  await sharp(buffer)
    .rotate()
    .resize(480, 360, { fit: "contain", background: "#ffffff", withoutEnlargement: false })
    .flatten({ background: "#ffffff" })
    .webp({ quality: 80, effort: 5 })
    .toFile(thumbTemp);
  await rename(fullTemp, join(directory, fullName));
  await rename(thumbTemp, join(directory, thumbName));
  return {
    id: `image-${digest}`,
    src: `/media/products/${productId}/${fullName}`,
    thumbnailSrc: `/media/products/${productId}/${thumbName}`,
    alt: originalName.replace(/\.[^.]+$/, ""),
    order: 0,
    variantIds: [],
    source: { type: "admin-upload", originalName, uploadedAt: new Date().toISOString() },
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
