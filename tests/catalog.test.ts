import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { catalogPayloadSchema, publicAssetPath } from "@/lib/catalog-schema";
import {
  buildQuoteMessage,
  decodeCursor,
  encodeCursor,
  normalizeSearch,
  queryCatalog,
} from "@/lib/catalog-query";

const payload = catalogPayloadSchema.parse(
  JSON.parse(readFileSync(path.resolve(process.cwd(), "data", "products.json"), "utf8")),
);
const products = payload.products.filter((product) => product.status === "published");

describe("katalog sözleşmesi", () => {
  it("Excel geçişi sonrası 202 yayımlanmış ürün ailesini doğrular", () => {
    expect(products).toHaveLength(202);
    expect(products.filter((product) => product.category === "Kahve Makineleri").length).toBeGreaterThan(0);
  });

  it("Türkçe ve model kodu aramasını normalize eder", () => {
    expect(normalizeSearch("ŞURUP İçİ")).toBe("surup ici");
    const result = queryCatalog(products, { q: products[0].variants[0].name, limit: 10 });
    expect(result.total).toBeGreaterThan(0);
  });

  it("marka, kategori ve cursor sayfalamasını uygular", () => {
    const brand = products[0].brand;
    const first = queryCatalog(products, { brand, limit: 1 });
    expect(first.items).toHaveLength(1);
    if (first.nextCursor) {
      const second = queryCatalog(products, { brand, limit: 1, cursor: first.nextCursor });
      expect(second.items[0]?.id).not.toBe(first.items[0].id);
    }
    expect(decodeCursor(encodeCursor(24))).toBe(24);
  });

  it("asset yollarını güvenli mutlak URL yoluna çevirir", () => {
    expect(publicAssetPath("assets/products/a/b/image-01.webp")).toBe("/assets/products/a/b/image-01.webp");
    expect(publicAssetPath("/media/products/a.webp")).toBe("/media/products/a.webp");
  });
});

describe("teklif mesajı", () => {
  it("ürün, varyant, adet ve temiz URL içerir; fiyat içermez", () => {
    const message = buildQuoteMessage([
      {
        brand: "Kimbo",
        name: "Espresso",
        variantName: "1 kg",
        variantCode: "K-1",
        quantity: 2,
        slug: "kimbo-espresso",
      },
    ], "https://karahanligida.com");
    expect(message).toContain("Kimbo — Espresso");
    expect(message).toContain("Varyant / Model: 1 kg");
    expect(message).toContain("Adet: 2");
    expect(message).toContain("https://karahanligida.com/urunler/kimbo-espresso");
    expect(message).not.toMatch(/fiyat|toplam|₺/i);
  });
});
