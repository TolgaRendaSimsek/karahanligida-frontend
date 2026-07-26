import { expect, test } from "@playwright/test";

test("ortak header ve temiz katalog URL'si çalışır", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".site-header .brand")).toContainText("KARAHANLI GIDA");
  await page.goto("/products.html?q=Kimbo");
  await expect(page).toHaveURL(/\/urunler\?q=Kimbo$/);
  await expect(page.locator(".site-header .brand")).toContainText("KARAHANLI GIDA");
  await expect(page.locator(".catalog-summary")).toContainText("ürün ailesi bulundu");
});

test("ürün detayı temiz URL, galeri ve teklif sepeti sunar", async ({ page }) => {
  await page.goto("/urunler/favori-fresh-donuk-meyve-sulari-ve-limonatalar.html");
  await expect(page).toHaveURL(/\/urunler\/favori-fresh-donuk-meyve-sulari-ve-limonatalar$/);
  await expect(page.locator("h1")).toContainText("Donuk Meyve");
  await page.getByRole("button", { name: "Teklif Sepetine Ekle" }).click();
  await expect(page.locator(".quote-drawer")).toHaveClass(/open/);
  await expect(page.locator(".quote-drawer")).not.toContainText(/Ara Toplam|Birim Fiyat|₺/i);
});

test("favoriler mevcut localStorage anahtarını korur", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("karahanliFavoritesV2", JSON.stringify(["family-0001"]));
  });
  await page.goto("/favoriler");
  await expect(page.locator(".product-card")).toHaveCount(1);
  await expect(page.locator(".product-card")).toContainText("Donuk Meyve");
});

test("mobil menü erişilebilir biçimde açılır", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "Yalnızca mobil projede çalışır.");
  await page.goto("/");
  const button = page.getByRole("button", { name: "Menüyü aç" });
  await button.click();
  await expect(button).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator(".category-nav")).toHaveClass(/open/);
});
