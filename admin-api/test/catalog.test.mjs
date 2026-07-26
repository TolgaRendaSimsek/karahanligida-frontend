import test from "node:test";
import assert from "node:assert/strict";
import { slugify, validateProduct } from "../src/catalog.mjs";

const product = {
  id: "family-test-product",
  slug: "test-urun",
  brand: "Karahanlı",
  name: "Test Ürün",
  category: "Kahve",
  subcategory: "Çekirdek",
  summary: "Test özeti",
  description: "Test açıklaması",
  features: [],
  specifications: {},
  images: [{
    id: "image-01",
    src: "/media/products/family-test-product/a-full.webp",
    thumbnailSrc: "/media/products/family-test-product/a-thumb.webp",
    alt: "Test",
    order: 1,
    variantIds: ["variant-1"],
    source: { type: "admin-upload" },
  }],
  variants: [{ id: "variant-1", name: "Standart", code: "STD", attributes: {}, imageId: "image-01" }],
  source: { type: "admin" },
  featured: false,
  status: "published",
};

test("Türkçe metni güvenli slug değerine çevirir", () => {
  assert.equal(slugify("Özel Çilek Şurubu"), "ozel-cilek-surubu");
});

test("geçerli ürünü normalize eder", () => {
  const validated = validateProduct(product);
  assert.equal(validated.images[0].order, 1);
});

test("fiyat ve müşteri verisini reddeder", () => {
  assert.throws(() => validateProduct({ ...product, price: 99 }), /Yasaklı veri alanı/);
  assert.throws(() => validateProduct({ ...product, customer: { phone: "1" } }), /Yasaklı veri alanı/);
});

test("geçersiz varyant görsel eşleşmesini reddeder", () => {
  const invalid = structuredClone(product);
  invalid.variants[0].imageId = "missing";
  assert.throws(() => validateProduct(invalid), /eşleşen görsel bulunamadı/);
});
