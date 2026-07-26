import "server-only";

import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { catalogPayloadSchema, type CatalogPayload, type ProductFamily } from "./catalog-schema";

type RepositoryCache = {
  mtimeMs: number;
  payload: CatalogPayload;
};

const globalCache = globalThis as typeof globalThis & {
  __karahanliCatalogCache?: RepositoryCache;
};

export function catalogPath(): string {
  return process.env.CATALOG_PATH || path.join(process.cwd(), "data", "products.json");
}

export async function readCatalog(): Promise<CatalogPayload> {
  const filePath = catalogPath();
  try {
    const fileStat = await stat(filePath);
    if (globalCache.__karahanliCatalogCache?.mtimeMs === fileStat.mtimeMs) {
      return globalCache.__karahanliCatalogCache.payload;
    }
    const parsed = JSON.parse(await readFile(filePath, "utf8"));
    const payload = catalogPayloadSchema.parse(parsed);
    globalCache.__karahanliCatalogCache = { mtimeMs: fileStat.mtimeMs, payload };
    return payload;
  } catch (error) {
    if (globalCache.__karahanliCatalogCache) {
      console.error("Katalog yenilenemedi; son geçerli snapshot kullanılıyor.", error);
      return globalCache.__karahanliCatalogCache.payload;
    }
    throw error;
  }
}

export async function publishedProducts(): Promise<ProductFamily[]> {
  const payload = await readCatalog();
  return payload.products.filter((product) => product.status === "published");
}

export async function productBySlug(slug: string): Promise<ProductFamily | undefined> {
  return (await publishedProducts()).find((product) => product.slug === slug);
}

export async function catalogFacets() {
  const products = await publishedProducts();
  return {
    brands: [...new Set(products.map((product) => product.brand))].sort((a, b) =>
      a.localeCompare(b, "tr"),
    ),
    categories: [...new Set(products.map((product) => product.category))].sort((a, b) =>
      a.localeCompare(b, "tr"),
    ),
  };
}
