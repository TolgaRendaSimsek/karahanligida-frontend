import { createRequire } from "node:module";
import fs from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const require = createRequire(path.join(root, "admin-api", "package.json"));
const sharp = require("sharp");
const output = process.argv[2] || path.join(root, "test-results", "product-images.webp");
const catalog = JSON.parse(
  await fs.readFile(path.join(root, "data", "products.json"), "utf8"),
);
const grouped = new Map();
for (const product of catalog.products) {
  if (!grouped.has(product.brand)) grouped.set(product.brand, []);
  grouped.get(product.brand).push(product);
}
const products = [...grouped.values()]
  .flatMap((items) => {
    const step = Math.max(1, Math.floor(items.length / 5));
    return items.filter((_, index) => index % step === 0).slice(0, 5);
  })
  .slice(0, 30);

const width = 260;
const imageHeight = 210;
const cellHeight = 260;
const columns = 5;
const cells = [];

for (const product of products) {
  const image = await sharp(path.join(root, product.images[0].src))
    .resize(width, imageHeight, { fit: "contain", background: "white" })
    .toBuffer();
  const safeLabel = `${product.brand} — ${product.name}`
    .replace(/[&<>]/g, "")
    .slice(0, 34);
  const label = Buffer.from(
    `<svg width="${width}" height="50">
      <rect width="${width}" height="50" fill="white"/>
      <text x="8" y="20" font-size="13" font-family="Arial" fill="#111">${safeLabel}</text>
      <text x="8" y="39" font-size="11" font-family="Arial" fill="#666">${product.id}</text>
    </svg>`,
  );
  cells.push(
    await sharp({
      create: { width, height: cellHeight, channels: 3, background: "white" },
    })
      .composite([
        { input: image, top: 0, left: 0 },
        { input: label, top: imageHeight, left: 0 },
      ])
      .webp()
      .toBuffer(),
  );
}

await fs.mkdir(path.dirname(output), { recursive: true });
await sharp({
  create: {
    width: columns * width,
    height: Math.ceil(cells.length / columns) * cellHeight,
    channels: 3,
    background: "#dddddd",
  },
})
  .composite(
    cells.map((input, index) => ({
      input,
      left: (index % columns) * width,
      top: Math.floor(index / columns) * cellHeight,
    })),
  )
  .webp({ quality: 90 })
  .toFile(output);

console.log(`${output} (${products.length} örnek)`);
