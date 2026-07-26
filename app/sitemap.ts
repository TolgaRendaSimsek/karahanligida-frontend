import type { MetadataRoute } from "next";
import { publishedProducts } from "@/lib/catalog-repository";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const origin = process.env.SITE_URL || "https://karahanligida.com";
  const products = await publishedProducts();
  return [
    { url: origin, changeFrequency: "weekly", priority: 1 },
    { url: `${origin}/urunler`, changeFrequency: "daily", priority: 0.9 },
    { url: `${origin}/iletisim`, changeFrequency: "monthly", priority: 0.6 },
    ...products.map((product) => ({
      url: `${origin}/urunler/${product.slug}`,
      changeFrequency: "weekly" as const,
      priority: 0.8,
    })),
  ];
}
