"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { buildQuoteMessage } from "@/lib/catalog-query";
import type { ProductFamily, ProductVariant } from "@/lib/catalog-schema";

const FAVORITES_KEY = "karahanliFavoritesV2";
const QUOTE_KEY = "karahanliQuoteCartV2";

export type QuoteItem = {
  key: string;
  productId: string;
  slug: string;
  brand: string;
  name: string;
  variantId: string;
  variantName: string;
  variantCode: string;
  image: string;
  quantity: number;
};

type StoreValue = {
  ready: boolean;
  favorites: string[];
  cart: QuoteItem[];
  cartOpen: boolean;
  setCartOpen: (open: boolean) => void;
  toggleFavorite: (id: string) => void;
  addToCart: (
    product: Pick<ProductFamily, "id" | "slug" | "brand" | "name" | "images">,
    variant: ProductVariant,
    quantity?: number,
  ) => void;
  updateQuantity: (key: string, quantity: number) => void;
  removeFromCart: (key: string) => void;
  requestQuote: () => void;
};

const StoreContext = createContext<StoreValue | null>(null);

function readArray<T>(key: string): T[] {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

export function StoreProvider({
  children,
  siteUrl,
  whatsappNumber,
}: {
  children: React.ReactNode;
  siteUrl: string;
  whatsappNumber: string;
}) {
  const [ready, setReady] = useState(false);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [cart, setCart] = useState<QuoteItem[]>([]);
  const [cartOpen, setCartOpen] = useState(false);

  useEffect(() => {
    setFavorites(readArray<string>(FAVORITES_KEY).filter((value) => typeof value === "string"));
    setCart(readArray<QuoteItem>(QUOTE_KEY));
    localStorage.removeItem("karahanliUser");
    setReady(true);
  }, []);

  useEffect(() => {
    if (ready) localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites));
  }, [favorites, ready]);

  useEffect(() => {
    if (ready) localStorage.setItem(QUOTE_KEY, JSON.stringify(cart));
  }, [cart, ready]);

  const toggleFavorite = useCallback((id: string) => {
    setFavorites((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
  }, []);

  const addToCart = useCallback(
    (
      product: Pick<ProductFamily, "id" | "slug" | "brand" | "name" | "images">,
      variant: ProductVariant,
      quantity = 1,
    ) => {
      const key = `${product.id}:${variant.id}`;
      setCart((current) => {
        const existing = current.find((item) => item.key === key);
        if (existing) {
          return current.map((item) =>
            item.key === key
              ? { ...item, quantity: item.quantity + Math.max(1, quantity) }
              : item,
          );
        }
        return [
          ...current,
          {
            key,
            productId: product.id,
            slug: product.slug,
            brand: product.brand,
            name: product.name,
            variantId: variant.id,
            variantName: variant.name,
            variantCode: variant.code,
            image: product.images[0]?.thumbnailSrc || product.images[0]?.src || "",
            quantity: Math.max(1, quantity),
          },
        ];
      });
      setCartOpen(true);
    },
    [],
  );

  const updateQuantity = useCallback((key: string, quantity: number) => {
    setCart((current) =>
      quantity <= 0
        ? current.filter((item) => item.key !== key)
        : current.map((item) => (item.key === key ? { ...item, quantity } : item)),
    );
  }, []);

  const removeFromCart = useCallback((key: string) => {
    setCart((current) => current.filter((item) => item.key !== key));
  }, []);

  const requestQuote = useCallback(() => {
    if (!cart.length) return;
    const message = buildQuoteMessage(cart, siteUrl || window.location.origin);
    const number = whatsappNumber.replace(/\D/g, "");
    window.open(`https://wa.me/${number}?text=${encodeURIComponent(message)}`, "_blank", "noopener,noreferrer");
  }, [cart, siteUrl, whatsappNumber]);

  const value = useMemo(
    () => ({
      ready,
      favorites,
      cart,
      cartOpen,
      setCartOpen,
      toggleFavorite,
      addToCart,
      updateQuantity,
      removeFromCart,
      requestQuote,
    }),
    [
      ready,
      favorites,
      cart,
      cartOpen,
      toggleFavorite,
      addToCart,
      updateQuantity,
      removeFromCart,
      requestQuote,
    ],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const value = useContext(StoreContext);
  if (!value) throw new Error("useStore, StoreProvider içinde kullanılmalıdır.");
  return value;
}
