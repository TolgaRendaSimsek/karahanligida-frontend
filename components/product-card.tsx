"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { publicAssetPath, type CatalogCard } from "@/lib/catalog-schema";
import { useStore } from "./store-provider";

export function ProductCard({ product }: { product: CatalogCard }) {
  const [imageIndex, setImageIndex] = useState(0);
  const { favorites, toggleFavorite, addToCart } = useStore();
  const images = product.images;
  const image = images[imageIndex] || images[0];
  const favorite = favorites.includes(product.id);

  function moveImage(direction: number) {
    setImageIndex((current) => (current + direction + images.length) % images.length);
  }

  return (
    <article className="product-card">
      <div className="product-card-media">
        <Link href={`/urunler/${product.slug}`} aria-label={`${product.name} detayını aç`}>
          <Image
            src={publicAssetPath(image.thumbnailSrc || image.src)}
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1100px) 50vw, 25vw"
            alt={image.alt || `${product.brand} ${product.name}`}
          />
        </Link>
        <span className="brand-badge">{product.brand}</span>
        <button
          type="button"
          className={`favorite-button${favorite ? " selected" : ""}`}
          onClick={() => toggleFavorite(product.id)}
          aria-label={favorite ? "Favorilerden çıkar" : "Favorilere ekle"}
          aria-pressed={favorite}
        >
          {favorite ? "♥" : "♡"}
        </button>
        {images.length > 1 && (
          <>
            <button type="button" className="gallery-arrow previous" onClick={() => moveImage(-1)} aria-label="Önceki görsel">‹</button>
            <button type="button" className="gallery-arrow next" onClick={() => moveImage(1)} aria-label="Sonraki görsel">›</button>
            <span className="gallery-count">{imageIndex + 1}/{images.length}</span>
          </>
        )}
      </div>
      <div className="product-card-copy">
        <span className="product-category">{product.category}</span>
        <Link href={`/urunler/${product.slug}`}><h3>{product.name}</h3></Link>
        <p>{product.summary}</p>
        <div className="card-meta">
          <span>{product.variantCount} varyant / model</span>
          <span>Fiyat için teklif alın</span>
        </div>
        <div className="card-actions">
          <Link className="button secondary" href={`/urunler/${product.slug}`}>İncele</Link>
          <button className="button primary" type="button" onClick={() => addToCart(product, product.firstVariant)}>
            Teklife Ekle
          </button>
        </div>
      </div>
    </article>
  );
}
