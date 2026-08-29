#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";

const path = "data/products.json";
const payload = JSON.parse(await readFile(path, "utf8"));
let changed = 0;
for (const product of payload.products) {
  if (product.imageStatus !== "verified") continue;
  const next = String(product.description || "").replace(
    "Resmî ürün görseli doğrulanıyor.",
    "Resmî ürün görseli doğrulandı."
  );
  if (next !== product.description) {
    product.description = next;
    changed += 1;
  }
}
await writeFile(path, `${JSON.stringify(payload, null, 2)}\n`);
console.log(JSON.stringify({ changed }));
