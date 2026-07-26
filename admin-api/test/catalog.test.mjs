import test from "node:test";
import assert from "node:assert/strict";
import { publicProduct, slugify, validateProduct } from "../src/catalog.mjs";

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
  const validated = validateProduct({ ...product, apiToken: "secret", internalNotes: "özel" });
  assert.equal(validated.images[0].order, 1);
  assert.equal(validated.apiToken, undefined);
  assert.equal(validated.internalNotes, undefined);
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

test("halka açık ürünü yalnızca izin verilen alanlardan üretir", () => {
  const value = structuredClone(product);
  value.apiToken = "secret";
  value.internalNotes = "yalnızca admin";
  value.images[0].internalPath = "/srv/private";
  value.images[0].source.originalName = "calisan-adi-musteri.png";
  value.source.originalImages = [{ pdfObject: "internal.png" }];
  value.variants[0].internalCost = 42;
  const published = publicProduct(value);
  assert.equal(published.apiToken, undefined);
  assert.equal(published.internalNotes, undefined);
  assert.equal(published.images[0].source, undefined);
  assert.equal(published.images[0].internalPath, undefined);
  assert.equal(published.source.originalImages, undefined);
  assert.equal(published.variants[0].internalCost, undefined);
});
