"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { publicAssetPath, type ProductFamily } from "@/lib/catalog-schema";
import { useStore } from "./store-provider";
import { taxonomySlugForName } from "@/lib/catalog-taxonomy";

export function ProductDetailClient({
  product,
  related,
}: {
  product: ProductFamily;
  related: ProductFamily[];
}) {
  const [imageIndex, setImageIndex] = useState(0);
  const [variantId, setVariantId] = useState(product.variants[0].id);
  const [quantity, setQuantity] = useState(1);
  const { favorites, toggleFavorite, addToCart } = useStore();
  const variant = product.variants.find((item) => item.id === variantId) || product.variants[0];
  const image = product.images[imageIndex] || product.images[0];

  useEffect(() => {
    if (!variant.imageId) return;
    const index = product.images.findIndex((item) => item.id === variant.imageId);
    if (index >= 0) setImageIndex(index);
  }, [variant, product.images]);

  const specifications = useMemo(() => Object.entries(product.specifications), [product.specifications]);

  function move(direction: number) {
    setImageIndex((current) => (current + direction + product.images.length) % product.images.length);
  }

  return (
    <>
      <main className="product-detail container">
        <nav className="breadcrumbs" aria-label="Sayfa yolu">
          <Link href="/">Ana Sayfa</Link><span>/</span>
          <Link href="/urunler">Ürünler</Link><span>/</span>
          <span>{product.name}</span>
        </nav>
        <div className="detail-layout">
          <section className="detail-gallery" aria-label="Ürün görselleri">
            <div className="detail-image">
              {image ? (
                <Image
                  src={publicAssetPath(image.src)}
                  fill
                  priority
                  sizes="(max-width: 900px) 100vw, 52vw"
                  alt={image.alt || `${product.brand} ${product.name}`}
                />
              ) : (
                <div className="detail-image-placeholder" role="img" aria-label="Görsel doğrulanıyor">
                  <span>Görsel doğrulanıyor</span>
                  <small>Ürün bilgileri yayınlandı; görsel kaynağı doğrulanıyor.</small>
                </div>
              )}
              {product.images.length > 1 && (
                <>
                  <button type="button" onClick={() => move(-1)} className="detail-arrow previous" aria-label="Önceki görsel">‹</button>
                  <button type="button" onClick={() => move(1)} className="detail-arrow next" aria-label="Sonraki görsel">›</button>
                </>
              )}
            </div>
            {product.images.length > 1 && (
              <div className="thumbnail-strip">
                {product.images.map((item, index) => (
                  <button
                    type="button"
                    key={item.id}
                    className={index === imageIndex ? "active" : undefined}
                    onClick={() => setImageIndex(index)}
                    aria-label={`${index + 1}. görseli göster`}
                  >
                    <Image src={publicAssetPath(item.thumbnailSrc)} fill sizes="82px" alt="" />
                  </button>
                ))}
              </div>
            )}
          </section>
          <section className="detail-copy">
            <span className="eyebrow">{product.brand} · {product.category}</span>
            <h1>{product.name}</h1>
            <p className="detail-lead">{product.summary}</p>
            <div className="availability-note">
              <span>✓</span>
              <p><strong>Profesyonel teklif alın</strong>Fiyat ve teslimat bilgisi seçiminize göre paylaşılır.</p>
            </div>
            <label className="variant-select">
              <span>Varyant / model seçin</span>
              <select value={variantId} onChange={(event) => setVariantId(event.target.value)}>
                {product.variants.map((item) => (
                  <option value={item.id} key={item.id}>
                    {item.name}{item.code ? ` · ${item.code}` : ""}
                  </option>
                ))}
              </select>
            </label>
            <div className="detail-actions">
              <div className="quantity-control large">
                <button type="button" onClick={() => setQuantity((value) => Math.max(1, value - 1))} aria-label="Adedi azalt">−</button>
                <b>{quantity}</b>
                <button type="button" onClick={() => setQuantity((value) => value + 1)} aria-label="Adedi artır">+</button>
              </div>
              <button type="button" className="button primary grow" onClick={() => addToCart(product, variant, quantity)}>
                Teklif Sepetine Ekle
              </button>
              <button
                type="button"
                className={`button icon${favorites.includes(product.id) ? " selected" : ""}`}
                onClick={() => toggleFavorite(product.id)}
                aria-label="Favorilere ekle"
              >
                {favorites.includes(product.id) ? "♥" : "♡"}
              </button>
            </div>
            <div className="detail-description">
              <h2>Ürün hakkında</h2>
              <p>{product.description}</p>
              {product.features.length > 0 && <ul>{product.features.map((item) => <li key={item}>{item}</li>)}</ul>}
            </div>
            {specifications.length > 0 && (
              <div className="specifications">
                <h2>Teknik bilgiler</h2>
                <dl>{specifications.map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{String(value)}</dd></div>)}</dl>
              </div>
            )}
          </section>
        </div>
      </main>
      {related.length > 0 && (
        <section className="related-section">
          <div className="container section-heading">
            <div><span className="eyebrow">BENZER ÜRÜNLER</span><h2>Aynı kategoriden seçenekler</h2></div>
            <Link href={taxonomySlugForName(product.category) ? `/kategori/${taxonomySlugForName(product.category)}` : `/urunler?category=${encodeURIComponent(product.category)}`}>Tümünü gör →</Link>
          </div>
          <div className="container product-grid compact">
            {related.map((item) => <RelatedCard product={item} key={item.id} />)}
          </div>
        </section>
      )}
    </>
  );
}

function RelatedCard({ product }: { product: ProductFamily }) {
  const image = product.images[0];
  return (
    <Link className="related-card" href={`/urunler/${product.slug}`}>
      <div>{image ? <Image src={publicAssetPath(image.thumbnailSrc)} fill sizes="240px" alt={image.alt} /> : <span className="product-image-placeholder"><span>Görsel doğrulanıyor</span></span>}</div>
      <span>{product.brand}</span>
      <strong>{product.name}</strong>
    </Link>
  );
}
