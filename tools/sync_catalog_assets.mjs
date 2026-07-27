import fs from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const assetsRoot = path.resolve(root, "assets", "products");
const catalogPath = path.join(root, "data", "products.json");
const manifestPath = path.join(root, "data", "catalog-manifest.json");
const catalog = JSON.parse(await fs.readFile(catalogPath, "utf8"));
const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));

const referenced = new Set(
  catalog.products.flatMap((product) =>
    product.images.flatMap((image) => [image.src, image.thumbnailSrc]),
  ),
);
const byId = new Map(catalog.products.map((product) => [product.id, product]));

manifest.items = manifest.items.map((item) => {
  const product = byId.get(item.productId);
  return {
    ...item,
    assets: product
      ? product.images.flatMap((image) => [image.src, image.thumbnailSrc])
      : [],
  };
});

async function walk(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  return (
    await Promise.all(
      entries.map(async (entry) => {
        const target = path.join(directory, entry.name);
        return entry.isDirectory() ? walk(target) : [target];
      }),
    )
  ).flat();
}

const files = await walk(assetsRoot);
let removed = 0;
for (const file of files) {
  const resolved = path.resolve(file);
  if (!resolved.startsWith(`${assetsRoot}${path.sep}`)) {
    throw new Error(`Güvensiz yol reddedildi: ${resolved}`);
  }
  const relative = path.relative(root, resolved).replaceAll(path.sep, "/");
  if (!referenced.has(relative)) {
    await fs.rm(resolved);
    removed += 1;
  }
}

await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(
  JSON.stringify(
    { referencedFiles: referenced.size, removedUnreferencedFiles: removed },
    null,
    2,
  ),
);
