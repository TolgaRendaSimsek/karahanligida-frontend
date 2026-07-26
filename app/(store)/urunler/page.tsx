import type { Metadata } from "next";
import { CatalogBrowser } from "@/components/catalog-browser";
import { catalogFacets, publishedProducts } from "@/lib/catalog-repository";
import { queryCatalog } from "@/lib/catalog-query";
import { toCatalogCard } from "@/lib/catalog-schema";

export const metadata: Metadata = {
  title: "Ürün Kataloğu",
  description: "Karahanlı Gıda kahve, çay, içecek ve profesyonel mutfak ekipmanları kataloğu.",
  alternates: { canonical: "/urunler" },
};

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q : "";
  const brand = typeof params.brand === "string" ? params.brand : "";
  const category = typeof params.category === "string" ? params.category : "";
  const products = await publishedProducts();
  const facets = await catalogFacets();
  const queried = queryCatalog(products, { q, brand, category, limit: 24 });
  const initial = { ...queried, items: queried.items.map(toCatalogCard) };

  return (
    <main>
      <section className="page-hero">
        <div className="container">
          <span className="eyebrow light">7 MARKA · {products.length} ÜRÜN AİLESİ</span>
          <h1>Profesyonel ürün kataloğu</h1>
          <p>Kahve ve içecek ürünlerinden endüstriyel mutfak ekipmanlarına kadar tüm çözümleri inceleyin.</p>
        </div>
      </section>
      <CatalogBrowser
        key={`${q}|${brand}|${category}`}
        initial={initial}
        brands={facets.brands}
        categories={facets.categories}
        initialQuery={{ q, brand, category }}
      />
    </main>
  );
}
