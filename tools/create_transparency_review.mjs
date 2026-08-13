#!/usr/bin/env node

import { readFile, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const require = createRequire(new URL("../admin-api/package.json", import.meta.url));
const sharp = require("sharp");
const reportPath = path.resolve(process.argv[2]);
const outputPath = path.resolve(process.argv[3]);
const report = JSON.parse(await readFile(reportPath, "utf8"));

const transparent = report.results
  .filter((item) => item.status === "transparent")
  .sort((left, right) => right.transparency - left.transparency);
const selected = [
  ...transparent.slice(0, 12),
  ...transparent.filter((_, index) => index % Math.max(1, Math.floor(transparent.length / 12)) === 0).slice(0, 12),
].filter((item, index, items) => items.findIndex((candidate) => candidate.id === item.id) === index).slice(0, 24);

const columns = 4;
const cardWidth = 340;
const cardHeight = 390;
const composites = [];

function escapeXml(value) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

for (let index = 0; index < selected.length; index += 1) {
  const item = selected[index];
  const left = (index % columns) * cardWidth;
  const top = Math.floor(index / columns) * cardHeight;
  const checker = Buffer.from(`<svg width="300" height="290" xmlns="http://www.w3.org/2000/svg">
    <defs><pattern id="c" width="24" height="24" patternUnits="userSpaceOnUse"><rect width="24" height="24" fill="#f6f3ed"/><rect width="12" height="12" fill="#e3ded4"/><rect x="12" y="12" width="12" height="12" fill="#e3ded4"/></pattern></defs>
    <rect width="300" height="290" fill="url(#c)"/>
  </svg>`);
  const image = await sharp(path.join(root, item.src))
    .resize(280, 270, { fit: "contain" })
    .png()
    .toBuffer();
  const label = Buffer.from(`<svg width="300" height="72" xmlns="http://www.w3.org/2000/svg">
    <rect width="300" height="72" fill="#fff"/>
    <text x="10" y="23" font-size="14" font-family="Arial" font-weight="700" fill="#1f3328">${escapeXml(`${index + 1}. ${item.name}`.slice(0, 38))}</text>
    <text x="10" y="47" font-size="12" font-family="Arial" fill="#666">${escapeXml(item.id)} · %${(item.transparency * 100).toFixed(1)} şeffaf</text>
  </svg>`);
  composites.push({ input: checker, left: left + 20, top: top + 16 });
  composites.push({ input: image, left: left + 30, top: top + 26 });
  composites.push({ input: label, left: left + 20, top: top + 306 });
}

await mkdir(path.dirname(outputPath), { recursive: true });
await sharp({
  create: {
    width: columns * cardWidth,
    height: Math.ceil(selected.length / columns) * cardHeight,
    channels: 3,
    background: "#ded9cf",
  },
}).composite(composites).png().toFile(outputPath);

console.log(`${outputPath} (${selected.length} kritik ve temsili örnek)`);
