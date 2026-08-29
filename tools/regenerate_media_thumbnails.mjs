#!/usr/bin/env node

import { mkdir, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
// Sharp is intentionally a dependency of the upload API only. This utility is
// run from the repository root, so import that same pinned runtime explicitly.
import sharp from "../admin-api/node_modules/sharp/dist/index.mjs";

const root = path.resolve(process.env.MEDIA_ROOT || "data/media");
const productsRoot = path.join(root, "products");
const dryRun = process.argv.includes("--dry-run");

async function walk(directory) {
  const files = [];
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") return files;
    throw error;
  }
  for (const entry of entries) {
    const filePath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(filePath));
    else if (/-full\.webp$/.test(entry.name)) files.push(filePath);
  }
  return files;
}

const fullFiles = (await walk(productsRoot)).filter((filePath) => /-full\.webp$/.test(filePath));
let updated = 0;
let skipped = 0;
const errors = [];

for (const fullPath of fullFiles) {
  const thumbnailPath = fullPath.replace(/-full\.webp$/, "-thumb.webp");
  try {
    const thumbnail = await sharp(fullPath, { failOn: "error", limitInputPixels: 40_000_000 })
      .ensureAlpha()
      .resize(480, 360, {
        fit: "contain",
        withoutEnlargement: false,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .webp({ quality: 84, alphaQuality: 100, effort: 5 })
      .toBuffer();
    if (!dryRun) {
      await mkdir(path.dirname(thumbnailPath), { recursive: true });
      await writeFile(thumbnailPath, thumbnail);
    }
    updated += 1;
  } catch (error) {
    skipped += 1;
    errors.push({ file: path.relative(root, fullPath).replaceAll("\\", "/"), error: error.message });
  }
}

console.log(JSON.stringify({
  mode: dryRun ? "dry-run" : "apply",
  mediaRoot: root,
  fullFiles: fullFiles.length,
  updated,
  skipped,
  errors,
}, null, 2));

if (errors.length > 0) process.exitCode = 1;
