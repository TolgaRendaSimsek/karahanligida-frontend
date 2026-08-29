import { z } from "zod";

const primitive = z.union([z.string(), z.number(), z.boolean()]);

export const productImageSchema = z.object({
  id: z.string().min(1),
  src: z.string().min(1),
  thumbnailSrc: z.string().min(1),
  alt: z.string(),
  order: z.number(),
  variantIds: z.array(z.string()),
}).strict();

export const productVariantSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  code: z.string(),
  attributes: z.record(z.string(), primitive),
  imageId: z.string().optional(),
}).strict();

export const productFamilySchema = z.object({
  id: z.string().regex(/^family-[a-z0-9-]+$/),
  slug: z.string().regex(/^[a-z0-9-]+$/),
  brand: z.string().min(1),
  name: z.string().min(1),
  category: z.string().min(1),
  subcategory: z.string(),
  summary: z.string().min(1),
  description: z.string().min(1),
  features: z.array(z.string()),
  specifications: z.record(z.string(), primitive),
  // A verified image is preferred, but Excel products may be published while
  // their official image is still being researched. The UI renders a neutral
  // placeholder for these records instead of a broken image.
  images: z.array(productImageSchema),
  variants: z.array(productVariantSchema).min(1),
  source: z.object({
    catalog: z.string(),
    pages: z.array(z.number()),
  }).strict(),
  featured: z.boolean(),
  status: z.enum(["published", "archived"]),
  imageStatus: z.enum(["verified", "research-needed", "missing"]).optional(),
}).strict();

export const catalogPayloadSchema = z.object({
  schemaVersion: z.number(),
  generatedAt: z.string().optional(),
  generatedFrom: z.string().optional(),
  security: z.unknown().optional(),
  products: z.array(productFamilySchema),
}).passthrough();

export type ProductImage = z.infer<typeof productImageSchema>;
export type ProductVariant = z.infer<typeof productVariantSchema>;
export type ProductFamily = z.infer<typeof productFamilySchema>;
export type CatalogPayload = z.infer<typeof catalogPayloadSchema>;

export type CatalogCard = Pick<
  ProductFamily,
  "id" | "slug" | "brand" | "name" | "category" | "subcategory" | "summary" | "images"
> & {
  variantCount: number;
  firstVariant: ProductVariant;
};

export function toCatalogCard(product: ProductFamily): CatalogCard {
  return {
    id: product.id,
    slug: product.slug,
    brand: product.brand,
    name: product.name,
    category: product.category,
    subcategory: product.subcategory,
    summary: product.summary,
    images: product.images,
    variantCount: product.variants.length,
    firstVariant: product.variants[0],
  };
}

export function publicAssetPath(path: string): string {
  if (!path || /^https?:\/\//.test(path) || path.startsWith("/")) return path;
  return `/${path}`;
}
