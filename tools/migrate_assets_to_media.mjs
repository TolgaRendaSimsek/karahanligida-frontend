import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

function argument(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

const repositoryRoot = resolve(import.meta.dirname, "..");
const input = resolve(argument("--input", join(repositoryRoot, "data", "products.json")));
const mediaRoot = resolve(argument("--media-root", join(repositoryRoot, ".media-migration")));
const output = resolve(argument("--output", join(mediaRoot, "products.json")));
const manifestOutput = argument("--manifest-output", "");
const payload = JSON.parse(await readFile(input, "utf8"));

for (const product of payload.products) {
  const imageIds = new Map();
  for (const image of product.images) {
    if (image.src.startsWith("/media/")) continue;
    const fullSource = resolve(repositoryRoot, image.src.replace(/^\//, ""));
    const thumbSource = resolve(repositoryRoot, image.thumbnailSrc.replace(/^\//, ""));
    const full = await readFile(fullSource);
    const digest = createHash("sha256").update(full).digest("hex").slice(0, 16);
    const directory = join(mediaRoot, "products", product.id);
    await mkdir(directory, { recursive: true });
    await copyFile(fullSource, join(directory, `${digest}-full.webp`));
    await copyFile(thumbSource, join(directory, `${digest}-thumb.webp`));
    const previousId = image.id;
    image.id = `image-${digest}`;
    image.src = `/media/products/${product.id}/${digest}-full.webp`;
    image.thumbnailSrc = `/media/products/${product.id}/${digest}-thumb.webp`;
    imageIds.set(previousId, image.id);
  }
  for (const variant of product.variants) {
    if (variant.imageId && imageIds.has(variant.imageId)) variant.imageId = imageIds.get(variant.imageId);
  }
}

payload.generatedAt = new Date().toISOString();
payload.generatedFrom = "Asset-to-Linux-media migration";
await mkdir(dirname(output), { recursive: true });
await writeFile(output, `${JSON.stringify(payload, null, 2)}\n`);
if (manifestOutput) {
  const manifestPath = resolve(manifestOutput);
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const byId = new Map(payload.products.map((product) => [product.id, product]));
  manifest.items = (manifest.items || []).map((item) => {
    const product = byId.get(item.productId);
    return product ? { ...item, assets: product.images.flatMap((image) => [image.src, image.thumbnailSrc]) } : item;
  });
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
}
console.log(JSON.stringify({ products: payload.products.length, mediaRoot, output }));
