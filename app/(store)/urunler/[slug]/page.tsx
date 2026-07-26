import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { ProductDetailClient } from "@/components/product-detail-client";
import { productBySlug, publishedProducts } from "@/lib/catalog-repository";
import { publicAssetPath } from "@/lib/catalog-schema";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const product = await productBySlug(slug);
  if (!product) return { title: "Ürün bulunamadı" };
  const image = publicAssetPath(product.images[0]?.src || "/logo.png");
  return {
    title: `${product.name} | ${product.brand}`,
    description: product.summary,
    alternates: { canonical: `/urunler/${product.slug}` },
    openGraph: {
      title: `${product.name} | ${product.brand}`,
      description: product.summary,
      images: [{ url: image }],
      type: "website",
    },
  };
}

export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const product = await productBySlug(slug);
  if (!product) notFound();
  const allProducts = await publishedProducts();
  const related = allProducts
    .filter((item) => item.id !== product.id && item.category === product.category)
    .slice(0, 4);
  const nonce = (await headers()).get("x-nonce") || undefined;
  const schema = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    description: product.summary,
    image: product.images.map((image) =>
      new URL(publicAssetPath(image.src), process.env.SITE_URL || "https://karahanligida.com").href,
    ),
    brand: { "@type": "Brand", name: product.brand },
    category: product.category,
    sku: product.variants.map((variant) => variant.code).find(Boolean) || product.id,
  };
  return (
    <>
      <script
        nonce={nonce}
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(schema).replace(/</g, "\\u003c") }}
      />
      <ProductDetailClient product={product} related={related} />
    </>
  );
}
