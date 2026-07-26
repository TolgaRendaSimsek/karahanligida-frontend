import type { ProductFamily } from "./catalog-schema";

export type CatalogQuery = {
  q?: string;
  brand?: string;
  category?: string;
  ids?: string[];
  cursor?: string;
  limit?: number;
};

export function normalizeSearch(value: string): string {
  return value
    .toLocaleLowerCase("tr-TR")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/ı/g, "i");
}

function searchText(product: ProductFamily): string {
  return normalizeSearch([
    product.name,
    product.brand,
    product.category,
    product.subcategory,
    product.summary,
    ...product.variants.flatMap((variant) => [
      variant.name,
      variant.code,
      ...Object.values(variant.attributes).map(String),
    ]),
  ].join(" "));
}

export function encodeCursor(offset: number): string {
  return Buffer.from(String(offset)).toString("base64url");
}

export function decodeCursor(cursor?: string): number {
  if (!cursor) return 0;
  const value = Number(Buffer.from(cursor, "base64url").toString("utf8"));
  return Number.isInteger(value) && value >= 0 ? value : 0;
}

export function queryCatalog(products: ProductFamily[], query: CatalogQuery) {
  const needle = normalizeSearch(query.q?.trim() || "");
  const ids = new Set((query.ids || []).slice(0, 100));
  const filtered = products.filter((product) => {
    if (ids.size && !ids.has(product.id)) return false;
    if (query.brand && product.brand !== query.brand) return false;
    if (query.category && product.category !== query.category) return false;
    return !needle || searchText(product).includes(needle);
  });
  const offset = decodeCursor(query.cursor);
  const limit = Math.min(48, Math.max(1, query.limit || 24));
  const items = filtered.slice(offset, offset + limit);
  const nextOffset = offset + items.length;
  return {
    items,
    total: filtered.length,
    nextCursor: nextOffset < filtered.length ? encodeCursor(nextOffset) : null,
  };
}

export function buildQuoteMessage(
  items: Array<{
    brand: string;
    name: string;
    variantName: string;
    variantCode?: string;
    quantity: number;
    slug: string;
  }>,
  origin: string,
): string {
  const lines = ["Merhaba, aşağıdaki ürünler için teklif rica ediyorum:", ""];
  items.forEach((item, index) => {
    lines.push(`${index + 1}. ${item.brand} — ${item.name}`);
    lines.push(`   Varyant / Model: ${item.variantName}`);
    if (item.variantCode) lines.push(`   Ürün kodu: ${item.variantCode}`);
    lines.push(`   Adet: ${item.quantity}`);
    lines.push(`   Ürün sayfası: ${origin}/urunler/${item.slug}`);
    lines.push("");
  });
  lines.push("Uygunluk ve teslimat bilgilerini paylaşabilir misiniz?");
  return lines.join("\n");
}
