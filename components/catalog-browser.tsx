"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { ProductFamily } from "@/lib/catalog-schema";
import { ProductCard } from "./product-card";

type CatalogResponse = {
  items: ProductFamily[];
  total: number;
  nextCursor: string | null;
};

export function CatalogBrowser({
  initial,
  brands,
  categories,
  initialQuery,
}: {
  initial: CatalogResponse;
  brands: string[];
  categories: string[];
  initialQuery: { q: string; brand: string; category: string };
}) {
  const router = useRouter();
  const pathname = usePathname();
  const firstRender = useRef(true);
  const [q, setQ] = useState(initialQuery.q);
  const [brand, setBrand] = useState(initialQuery.brand);
  const [category, setCategory] = useState(initialQuery.category);
  const [result, setResult] = useState(initial);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    const timer = window.setTimeout(async () => {
      setLoading(true);
      const params = new URLSearchParams();
      if (q.trim()) params.set("q", q.trim());
      if (brand) params.set("brand", brand);
      if (category) params.set("category", category);
      router.replace(`${pathname}${params.size ? `?${params}` : ""}`, { scroll: false });
      const response = await fetch(`/api/catalog?${params}`);
      if (response.ok) setResult(await response.json());
      setLoading(false);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [q, brand, category, pathname, router]);

  async function loadMore() {
    if (!result.nextCursor) return;
    setLoading(true);
    const params = new URLSearchParams({ cursor: result.nextCursor });
    if (q.trim()) params.set("q", q.trim());
    if (brand) params.set("brand", brand);
    if (category) params.set("category", category);
    const response = await fetch(`/api/catalog?${params}`);
    if (response.ok) {
      const next: CatalogResponse = await response.json();
      setResult((current) => ({
        items: [...current.items, ...next.items],
        total: next.total,
        nextCursor: next.nextCursor,
      }));
    }
    setLoading(false);
  }

  function clear() {
    setQ("");
    setBrand("");
    setCategory("");
  }

  return (
    <section className="catalog-shell container">
      <div className="catalog-toolbar">
        <label className="catalog-search">
          <span>Arama</span>
          <input value={q} onChange={(event) => setQ(event.target.value)} placeholder="Ürün, marka, model veya varyant ara" />
        </label>
        <label>
          <span>Marka</span>
          <select value={brand} onChange={(event) => setBrand(event.target.value)}>
            <option value="">Tüm markalar</option>
            {brands.map((item) => <option key={item}>{item}</option>)}
          </select>
        </label>
        <label>
          <span>Kategori</span>
          <select value={category} onChange={(event) => setCategory(event.target.value)}>
            <option value="">Tüm kategoriler</option>
            {categories.map((item) => <option key={item}>{item}</option>)}
          </select>
        </label>
      </div>
      <div className="catalog-summary">
        <p><strong>{result.total}</strong> ürün ailesi bulundu</p>
        {(q || brand || category) && <button type="button" onClick={clear}>Filtreleri temizle</button>}
      </div>
      {result.items.length ? (
        <div className={`product-grid${loading ? " loading" : ""}`}>
          {result.items.map((product) => <ProductCard product={product} key={product.id} />)}
        </div>
      ) : (
        <div className="empty-state catalog-empty">
          <h2>Aramanızla eşleşen ürün bulunamadı</h2>
          <p>Filtreleri temizleyerek tüm kataloğu yeniden görüntüleyebilirsiniz.</p>
          <button className="button primary" onClick={clear}>Tüm ürünleri göster</button>
        </div>
      )}
      {result.nextCursor && (
        <div className="load-more">
          <button className="button secondary" disabled={loading} onClick={loadMore}>
            {loading ? "Yükleniyor…" : "Daha fazla göster"}
          </button>
        </div>
      )}
    </section>
  );
}
