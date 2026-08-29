#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import process from "node:process";

const baseUrl = (process.argv[2] || "https://karahanligida.com").replace(/\/$/, "");
const catalog = JSON.parse(
  await readFile(new URL("../data/products.json", import.meta.url), "utf8"),
);
const products = catalog.products || [];
const errors = [];
const forbiddenPublicAddress = /(?:localhost|127\.0\.0\.1)/i;

async function check(path, expectedStatus, label = path) {
  try {
    const response = await fetch(`${baseUrl}${path}`, { redirect: "manual" });
    if (response.status !== expectedStatus) {
      errors.push(`${label}: ${response.status}, beklenen ${expectedStatus}`);
    }
    return response;
  } catch (error) {
    errors.push(`${label}: ${error.message}`);
    return null;
  }
}

const health = await check("/api/health", 200);
if (health) {
  const body = await health.json().catch(() => ({}));
  if (body.status !== "ok" || body.catalogProducts !== products.length) {
    errors.push("/api/health katalog sayısı veya durumu hatalı");
  }
}

const publicPages = ["/", "/urunler", "/favoriler", "/iletisim", "/admin"];
const publicResponses = await Promise.all(publicPages.map((path) => check(path, 200)));
for (let index = 0; index < publicResponses.length; index += 1) {
  const response = publicResponses[index];
  if (!response) continue;
  const html = await response.text();
  if (forbiddenPublicAddress.test(html)) {
    errors.push(`${publicPages[index]} public HTML içinde localhost/127.0.0.1 içeriyor`);
  }
}

const categorySlugs = [
  "kahve", "cay", "surup-ve-pureler", "soslar", "gida-urunleri",
  "donuk-urunler", "gida-disi-urunler", "kahve-makineleri", "endustriyel-mutfak-ekipmanlari",
];
for (const slug of categorySlugs) await check(`/kategori/${slug}`, 200, `kategori/${slug}`);

const batches = [];
for (let index = 0; index < products.length; index += 20) {
  batches.push(products.slice(index, index + 20));
}
for (const batch of batches) {
  await Promise.all(
    batch.map((product) => check(`/urunler/${product.slug}`, 200, product.slug)),
  );
}

await check("/urunler/bilinmeyen-urun-kontrolu", 404);

const legacyRoutes = [
  ["/index.html", "/"],
  ["/products.html?category=Kahve", "/urunler?category=Kahve"],
  ["/favorites.html", "/favoriler"],
  ["/account.html", "/iletisim"],
  ["/register.html", "/iletisim"],
  [`/urunler/${products[0].slug}.html`, `/urunler/${products[0].slug}`],
];

for (const [source, destination] of legacyRoutes) {
  const response = await check(source, 308, source);
  if (!response) continue;
  const location = response.headers.get("location");
  const actual = location ? new URL(location, baseUrl).pathname + new URL(location, baseUrl).search : "";
  if (actual !== destination) {
    errors.push(`${source}: Location ${actual || "(yok)"}, beklenen ${destination}`);
  }
}

const catalogResponse = await check("/api/catalog?limit=3", 200);
if (catalogResponse) {
  const text = await catalogResponse.text();
  if (/"price"|"subtotal"|"payment"/i.test(text)) {
    errors.push("/api/catalog fiyat veya ödeme alanı içeriyor");
  }
  if (forbiddenPublicAddress.test(text)) {
    errors.push("/api/catalog localhost/127.0.0.1 içeriyor");
  }
}

if (errors.length) {
  console.error(errors.map((error) => `ERROR: ${error}`).join("\n"));
  process.exit(1);
}

console.log(
  `OK: ${products.length} temiz ürün rotası, eski 308 yönlendirmeleri, 404, healthcheck ve API doğrulandı.`,
);
