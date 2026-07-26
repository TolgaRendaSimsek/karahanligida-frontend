import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { publicProduct } from "../admin-api/src/catalog.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const path = join(root, "data", "products.json");
const payload = JSON.parse(await readFile(path, "utf8"));
payload.products = payload.products.map(publicProduct);
payload.security = {
  publicSchema: "allowlist-v1",
  generatedAt: new Date().toISOString(),
};
await writeFile(path, `${JSON.stringify(payload, null, 2)}\n`);
console.log(`${payload.products.length} ürün public allowlist şemasına dönüştürüldü.`);
