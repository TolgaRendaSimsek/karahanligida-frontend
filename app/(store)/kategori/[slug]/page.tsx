import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CatalogBrowser } from "@/components/catalog-browser";
import { catalogFacets, publishedProducts } from "@/lib/catalog-repository";
import { queryCatalog } from "@/lib/catalog-query";
import { toCatalogCard } from "@/lib/catalog-schema";
import { taxonomyBySlug } from "@/lib/catalog-taxonomy";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const category = taxonomyBySlug(slug);
  if (!category) return { title: "Kategori bulunamadı" };
  return {
    title: `${category.name} | Karahanlı Gıda`,
    description: `${category.name} kategorisindeki profesyonel ürünleri inceleyin.`,
    alternates: { canonical: `/kategori/${category.slug}` },
  };
}

export default async function CategoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const category = taxonomyBySlug(slug);
  if (!category) notFound();
  const paramsValue = await searchParams;
  const q = typeof paramsValue.q === "string" ? paramsValue.q : "";
  const brand = typeof paramsValue.brand === "string" ? paramsValue.brand : "";
  const subcategory = typeof paramsValue.subcategory === "string" ? paramsValue.subcategory : "";
  const products = await publishedProducts();
  const facets = await catalogFacets();
  const queried = queryCatalog(products, { q, brand, category: category.name, subcategory, limit: 24 });
  return (
    <main>
      <section className="page-hero category-hero">
        <div className="container">
          <span className="eyebrow light">KARAHANLI GIDA KATALOĞU</span>
          <h1>{category.name}</h1>
          <p>{category.name} kategorisindeki ürün ve çözümlerimizi işletmeniz için keşfedin.</p>
        </div>
      </section>
      <CatalogBrowser
        key={`${slug}|${q}|${brand}|${subcategory}`}
        initial={{ ...queried, items: queried.items.map(toCatalogCard) }}
        brands={facets.brands}
        categories={facets.categories}
        initialQuery={{ q, brand, category: category.name, subcategory }}
        fixedCategory={category.name}
        subcategories={category.subcategories}
      />
    </main>
  );
}
