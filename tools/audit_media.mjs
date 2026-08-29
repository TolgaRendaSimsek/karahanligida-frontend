#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { auditCatalogMedia } from "../admin-api/src/media-audit.mjs";

const root = process.cwd();
const catalogPath = path.resolve(process.env.CATALOG_PATH || "data/products.json");
const archivePath = path.resolve(process.env.ARCHIVE_PATH || "data/catalog-archive.json");
const mediaRoot = path.resolve(process.env.MEDIA_ROOT || "data/media");
const output = process.argv.find((value) => value.startsWith("--output="))?.split("=").slice(1).join("=");
const catalog = JSON.parse(await readFile(catalogPath, "utf8"));
let archived = [];
try { archived = JSON.parse(await readFile(archivePath, "utf8")).products || []; } catch { /* archive is optional locally */ }
const report = await auditCatalogMedia({
  families: catalog.products || [],
  drafts: archived,
  mediaRoot,
  assetsRoot: path.join(root, "assets"),
});
if (output) await writeFile(path.resolve(output), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ ...report.summary, output: output || null }, null, 2));
