"use client";

import Image from "next/image";
import Link from "next/link";
import { publicAssetPath } from "@/lib/catalog-schema";
import { useStore } from "./store-provider";

export function QuoteDrawer() {
  const {
    cart,
    cartOpen,
    setCartOpen,
    updateQuantity,
    removeFromCart,
    requestQuote,
  } = useStore();

  return (
    <>
      <div
        className={`drawer-overlay${cartOpen ? " visible" : ""}`}
        onClick={() => setCartOpen(false)}
        aria-hidden
      />
      <aside
        className={`quote-drawer${cartOpen ? " open" : ""}`}
        aria-hidden={!cartOpen}
        inert={!cartOpen}
      >
        <div className="drawer-header">
          <div><span>TEKLİF LİSTENİZ</span><h2>Teklif Sepeti</h2></div>
          <button type="button" onClick={() => setCartOpen(false)} aria-label="Sepeti kapat">×</button>
        </div>
        <div className="drawer-content">
          {!cart.length ? (
            <div className="empty-state">
              <span className="empty-icon">▱</span>
              <h3>Sepetiniz henüz boş</h3>
              <p>İlgilendiğiniz ürün ve varyantları ekleyerek toplu teklif isteyebilirsiniz.</p>
              <Link className="button primary" href="/urunler" onClick={() => setCartOpen(false)}>
                Ürünleri incele
              </Link>
            </div>
          ) : cart.map((item) => (
            <article className="drawer-item" key={item.key}>
              <div className="drawer-item-image">
                {item.image && (
                  <Image src={publicAssetPath(item.image)} fill sizes="80px" alt="" />
                )}
              </div>
              <div className="drawer-item-copy">
                <span>{item.brand}</span>
                <Link href={`/urunler/${item.slug}`} onClick={() => setCartOpen(false)}>
                  {item.name}
                </Link>
                <small>{item.variantName}{item.variantCode ? ` · ${item.variantCode}` : ""}</small>
                <div className="quantity-control">
                  <button type="button" onClick={() => updateQuantity(item.key, item.quantity - 1)} aria-label="Azalt">−</button>
                  <b>{item.quantity}</b>
                  <button type="button" onClick={() => updateQuantity(item.key, item.quantity + 1)} aria-label="Artır">+</button>
                  <button type="button" className="remove" onClick={() => removeFromCart(item.key)}>Kaldır</button>
                </div>
              </div>
            </article>
          ))}
        </div>
        {cart.length > 0 && (
          <div className="drawer-footer">
            <p>{cart.length} ürün seçimi · Fiyatlar teklif aşamasında paylaşılır.</p>
            <button type="button" className="button primary full" onClick={requestQuote}>
              WhatsApp&apos;tan Teklif İste
            </button>
          </div>
        )}
      </aside>
    </>
  );
}
