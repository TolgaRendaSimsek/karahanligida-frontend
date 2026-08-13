#!/usr/bin/env node

import { readdir, readFile, unlink } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const assetRoot = path.join(root, "assets", "products");
const catalog = JSON.parse(await readFile(path.join(root, "data", "products.json"), "utf8"));
const referenced = new Set(catalog.products.flatMap((product) => product.images.flatMap((image) => [image.src, image.thumbnailSrc])));

async function walk(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(target));
    else if (entry.isFile()) files.push(target);
  }
  return files;
}

const orphans = (await walk(assetRoot)).filter((file) => {
  const relative = path.relative(root, file).replaceAll("\\", "/");
  return !referenced.has(relative);
});

for (const file of orphans) {
  const resolved = path.resolve(file);
  if (!resolved.startsWith(`${assetRoot}${path.sep}`)) throw new Error(`Güvensiz dosya yolu: ${resolved}`);
  if (!/^web-[a-f0-9]{12}(?:-thumb)?\.webp$/.test(path.basename(resolved))) {
    throw new Error(`Beklenmeyen sahipsiz dosya adı: ${resolved}`);
  }
  await unlink(resolved);
}

console.log(`${orphans.length} sahipsiz, yeniden üretilmiş görsel temizlendi.`);
