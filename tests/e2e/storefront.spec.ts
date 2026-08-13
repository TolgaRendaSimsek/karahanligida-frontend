import { expect, test } from "@playwright/test";

test("ortak header ve temiz katalog URL'si çalışır", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".site-header .brand")).toContainText("KARAHANLI GIDA");
  await page.goto("/products.html?q=Kimbo");
  await expect(page).toHaveURL(/\/urunler\?q=Kimbo$/);
  await expect(page.locator(".site-header .brand")).toContainText("KARAHANLI GIDA");
  await expect(page.locator(".catalog-summary")).toContainText("ürün ailesi bulundu");
});

test("ana sayfa hero alanı gerçek kahve ürünlerini gösterir", async ({ page }) => {
  await page.goto("/");

  const heroLinks = page.locator(".hero-image-card");
  await expect(heroLinks).toHaveCount(2);
  await expect(heroLinks.first()).toHaveAttribute("href", "/urunler/kimbo-horeca-cekirdek-kahveler");
  await expect(heroLinks.last()).toHaveAttribute("href", "/urunler/kimbo-retail-cekirdek-kahveler");
  await expect.poll(async () => heroLinks.locator("img").evaluateAll((images) => images.every((image) => {
    const element = image as HTMLImageElement;
    return element.complete && element.naturalWidth > 0;
  }))).toBe(true);
});

test("header kategori bağlantıları aynı katalog sayfasında state'i yeniler", async ({ page }, testInfo) => {
  await page.goto("/urunler?category=%C5%9Eurup%20ve%20P%C3%BCreler");
  await expect(page.getByRole("combobox", { name: "Kategori" })).toHaveValue("Şurup ve Püreler");
  await expect(page.locator(".catalog-summary")).toContainText("10 ürün ailesi");

  for (const [label, category, count] of [
    ["Çay", "Çay", 4],
    ["Kahve", "Kahve", 6],
    ["Ekipman", "Endüstriyel Mutfak Ekipmanları", 190],
  ] as const) {
    if (testInfo.project.name === "mobile") {
      await page.getByRole("button", { name: "Menüyü aç" }).click();
    }
    await page.getByRole("navigation", { name: "Ana menü" })
      .getByRole("link", { name: label, exact: true })
      .click();
    await expect(page).toHaveURL(new RegExp(`category=${encodeURIComponent(category)}`));
    await expect(page.getByRole("combobox", { name: "Kategori" })).toHaveValue(category);
    await expect(page.locator(".catalog-summary")).toContainText(`${count} ürün ailesi`);
  }
});

test("global arama eski kategori state'ini taşımaz", async ({ page }) => {
  await page.goto("/urunler?category=%C3%87ay");
  await page.getByRole("search").getByLabel("Katalogda ara").fill("Kimbo");
  await page.getByRole("search").getByRole("button", { name: "Ara" }).click();
  await expect(page).toHaveURL(/\/urunler\?q=Kimbo$/);
  await expect(page.getByRole("combobox", { name: "Kategori" })).toHaveValue("");
  await expect(page.locator(".product-card")).toHaveCount(6);
  await expect(page.locator(".product-card .brand-badge")).toHaveText(Array(6).fill("Kimbo"));
});

test("filtre temizleme, sayfalama ve kart galerisi çalışır", async ({ page }) => {
  await page.goto("/urunler?category=Kahve");
  await page.getByRole("button", { name: "Filtreleri temizle" }).click();
  await expect(page).toHaveURL(/\/urunler$/);
  await expect(page.locator(".product-card")).toHaveCount(24);

  const firstCard = page.locator(".product-card").first();
  const image = firstCard.locator(".product-card-media img");
  const source = await image.getAttribute("src");
  await firstCard.getByRole("button", { name: "Sonraki görsel" }).click();
  await expect(image).not.toHaveAttribute("src", source || "");

  await page.getByRole("button", { name: "Daha fazla göster" }).click();
  await expect(page.locator(".product-card")).toHaveCount(48);
});

test("ürün detayı temiz URL, galeri ve teklif sepeti sunar", async ({ page }) => {
  await page.goto("/urunler/favori-fresh-donuk-meyve-sulari-ve-limonatalar.html");
  await expect(page).toHaveURL(/\/urunler\/favori-fresh-donuk-meyve-sulari-ve-limonatalar$/);
  await expect(page.locator("h1")).toContainText("Donuk Meyve");
  await page.getByRole("button", { name: "Teklif Sepetine Ekle" }).click();
  await expect(page.locator(".quote-drawer")).toHaveClass(/open/);
  await expect(page.locator(".quote-drawer")).not.toContainText(/Ara Toplam|Birim Fiyat|₺/i);
});

test("ürün detayı ve benzer ürün kartları footer alanına taşmaz", async ({ page }) => {
  await page.goto("/urunler/kroom-206342-onu-acik-alt-dolap-icin-kapak-sayfa-136");

  const layout = await page.evaluate(() => {
    const related = document.querySelector<HTMLElement>(".related-section")!;
    const footer = document.querySelector<HTMLElement>(".site-footer")!;
    const gallery = document.querySelector<HTMLElement>(".detail-gallery")!;
    const cards = [...document.querySelectorAll<HTMLElement>(".related-card")];

    return {
      separateStickyScroll: getComputedStyle(gallery).position === "sticky",
      relatedBottom: related.getBoundingClientRect().bottom,
      footerTop: footer.getBoundingClientRect().top,
      cardsFit: cards.every((card) => {
        const cardRect = card.getBoundingClientRect();
        return [...card.children].every((child) => {
          const childRect = child.getBoundingClientRect();
          return childRect.left >= cardRect.left - 1 && childRect.right <= cardRect.right + 1
            && childRect.bottom <= cardRect.bottom + 1;
        });
      }),
    };
  });

  expect(layout.separateStickyScroll).toBe(false);
  expect(layout.cardsFit).toBe(true);
  expect(layout.footerTop).toBeGreaterThanOrEqual(layout.relatedBottom - 1);
});

test("favoriler mevcut localStorage anahtarını korur", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("karahanliFavoritesV2", JSON.stringify(["family-0001"]));
  });
  await page.goto("/favoriler");
  await expect(page.locator(".product-card")).toHaveCount(1);
  await expect(page.locator(".product-card")).toContainText("Donuk Meyve");
});

test("teklif sepeti sayfa yenilemesinde korunur ve fiyat içermez", async ({ page }) => {
  await page.goto("/urunler/favori-fresh-donuk-meyve-sulari-ve-limonatalar");
  await page.getByRole("button", { name: "Teklif Sepetine Ekle" }).click();
  await page.reload();
  await page.getByRole("button", { name: "Teklif sepetini aç" }).click();
  await expect(page.locator(".quote-drawer")).toContainText("Donuk Meyve");
  await expect(page.locator(".quote-drawer")).not.toContainText(/Ara Toplam|Birim Fiyat|₺/i);
});

test("mobil menü erişilebilir biçimde açılır", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "Yalnızca mobil projede çalışır.");
  await page.goto("/");
  const button = page.getByRole("button", { name: "Menüyü aç" });
  await button.click();
  await expect(button).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator(".category-nav")).toHaveClass(/open/);
});
