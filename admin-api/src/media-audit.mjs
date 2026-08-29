import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import { basename, join, relative, resolve, sep } from "node:path";
import sharp from "sharp";

const MEDIA_REF = /^\/media\/products\/([^/]+)\/([^/]+)$/;
const ASSET_REF = /^\/?assets\/(.+)$/;
const WEBP_NAME = /^[a-f0-9]{12,64}(?:-[a-z0-9-]+)?\.webp$/i;

function safeJoin(root, relativePath) {
  const base = resolve(root);
  const target = resolve(base, relativePath);
  if (target !== base && !target.startsWith(base + sep)) return null;
  return target;
}

function resolveReference(source, { mediaRoot, assetsRoot }) {
  if (!source || /^https?:\/\//i.test(source)) return { type: "remote", path: null };
  const value = String(source);
  const media = value.match(MEDIA_REF);
  if (media) return { type: "media", path: safeJoin(mediaRoot, join("products", media[1], media[2])) };
  const asset = value.match(ASSET_REF);
  if (asset && assetsRoot) return { type: "assets", path: safeJoin(assetsRoot, asset[1]) };
  return { type: "unknown", path: null };
}

async function inspectFile(filePath, expectedHash) {
  if (!filePath) return { exists: false, valid: false, reason: "unsupported-path" };
  try {
    const fileStat = await stat(filePath);
    if (!fileStat.isFile()) return { exists: false, valid: false, reason: "not-a-file" };
    const buffer = await readFile(filePath);
    const metadata = await sharp(buffer, { failOn: "error" }).metadata();
    const valid = metadata.format === "webp" && (metadata.width ?? 0) > 0 && (metadata.height ?? 0) > 0;
    const digest = createHash("sha256").update(buffer).digest("hex").slice(0, 16);
    return {
      exists: true,
      valid,
      format: metadata.format || null,
      width: metadata.width || null,
      height: metadata.height || null,
      hasAlpha: Boolean(metadata.hasAlpha),
      hash: digest,
      hashMatch: expectedHash ? digest === expectedHash : null,
      reason: valid ? null : "not-webp-or-invalid",
    };
  } catch (error) {
    if (error.code === "ENOENT") return { exists: false, valid: false, reason: "missing" };
    return { exists: true, valid: false, reason: "read-error" };
  }
}

async function listMediaFiles(mediaRoot) {
  const root = resolve(mediaRoot);
  const output = [];
  async function visit(directory) {
    let entries;
    try { entries = await readdir(directory, { withFileTypes: true }); }
    catch (error) { if (error.code === "ENOENT") return; throw error; }
    for (const entry of entries) {
      if (entry.name === ".trash") continue;
      const filePath = join(directory, entry.name);
      if (entry.isDirectory()) await visit(filePath);
      else if (entry.isFile() && filePath.toLowerCase().endsWith(".webp")) output.push(filePath);
    }
  }
  await visit(join(root, "products"));
  return output;
}

/** Compare Firestore image references with local media and return a JSON-safe report. */
export async function auditCatalogMedia({ families = [], drafts = [], mediaRoot, assetsRoot = null }) {
  const products = [...families, ...drafts];
  const referencedMedia = new Set();
  const productReports = [];
  let imageCount = 0;
  let missingFiles = 0;
  let invalidFiles = 0;
  let hashMismatches = 0;

  for (const product of products) {
    const images = Array.isArray(product.images) ? product.images : [];
    const imageReports = [];
    for (const image of images) {
      imageCount += 1;
      const fullRef = resolveReference(image.src, { mediaRoot, assetsRoot });
      const thumbRef = resolveReference(image.thumbnailSrc, { mediaRoot, assetsRoot });
      if (fullRef.path && fullRef.type === "media") referencedMedia.add(fullRef.path);
      if (thumbRef.path && thumbRef.type === "media") referencedMedia.add(thumbRef.path);
      const fullName = fullRef.path ? basename(fullRef.path) : "";
      const hashMatch = fullName.match(/^(?:web|image)-([a-f0-9]{16})(?:-|\.)/i)
        || fullName.match(/^([a-f0-9]{16})(?:-|\.)/i);
      const expectedHash = hashMatch ? hashMatch[1].toLowerCase() : null;
      const full = await inspectFile(fullRef.path, expectedHash);
      // Thumbnails are resized derivatives and intentionally have a different
      // content hash; their filename still carries the full-image hash.
      const thumbnail = await inspectFile(thumbRef.path, null);
      if (!full.exists || !thumbnail.exists) missingFiles += 1;
      if ((full.exists && !full.valid) || (thumbnail.exists && !thumbnail.valid)) invalidFiles += 1;
      if (full.hashMatch === false) hashMismatches += 1;
      imageReports.push({
        id: image.id,
        source: image.src,
        thumbnailSource: image.thumbnailSrc,
        sourceType: fullRef.type,
        full,
        thumbnail,
      });
    }
    const status = !images.length
      ? "research-needed"
      : imageReports.every((item) => item.full.exists && item.thumbnail.exists && item.full.valid && item.thumbnail.valid)
        ? "verified"
        : imageReports.some((item) => item.full.exists || item.thumbnail.exists) ? "file-missing" : "file-missing";
    productReports.push({ id: product.id, slug: product.slug || null, name: product.name || null, status, imageCount: images.length, images: imageReports });
  }

  const files = await listMediaFiles(mediaRoot);
  const orphanFiles = files
    .filter((filePath) => !referencedMedia.has(filePath))
    .map((filePath) => relative(resolve(mediaRoot), filePath).replaceAll("\\", "/"))
    .filter((fileName) => WEBP_NAME.test(basename(fileName)));
  return {
    generatedAt: new Date().toISOString(),
    summary: {
      products: products.length,
      images: imageCount,
      missingFiles,
      invalidFiles,
      hashMismatches,
      orphanFiles: orphanFiles.length,
      verifiedProducts: productReports.filter((product) => product.status === "verified").length,
      researchNeeded: productReports.filter((product) => product.status === "research-needed").length,
    },
    products: productReports,
    orphanFiles,
  };
}
