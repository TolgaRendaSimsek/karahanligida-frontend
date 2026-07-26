"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { CatalogCard } from "@/lib/catalog-schema";
import { useStore } from "./store-provider";
import { ProductCard } from "./product-card";

export function FavoritesClient() {
  const { favorites, ready } = useStore();
  const [products, setProducts] = useState<CatalogCard[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!ready) return;
    if (!favorites.length) {
      setProducts([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    fetch(`/api/catalog?ids=${encodeURIComponent(favorites.join(","))}&limit=48`)
      .then((response) => response.json())
      .then((payload) => setProducts(payload.items || []))
      .finally(() => setLoading(false));
  }, [favorites, ready]);

  if (loading) return <div className="page-state">Favorileriniz yükleniyor…</div>;
  if (!products.length) {
    return (
      <div className="empty-state page-empty">
        <span className="empty-icon">♡</span>
        <h2>Henüz favori ürününüz yok</h2>
        <p>Ürün kartlarındaki kalp simgesini kullanarak listenizi oluşturabilirsiniz.</p>
        <Link className="button primary" href="/urunler">Kataloğu incele</Link>
      </div>
    );
  }
  return <div className="product-grid">{products.map((product) => <ProductCard key={product.id} product={product} />)}</div>;
}
