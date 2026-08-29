const REQUIRED_FIELDS = [
  "id",
  "slug",
  "brand",
  "name",
  "category",
  "subcategory",
  "summary",
  "description",
  "features",
  "specifications",
  "images",
  "variants",
  "source",
  "featured",
  "status",
];

const FORBIDDEN_KEYS = new Set([
  "price",
  "unitPrice",
  "subtotal",
  "total",
  "payment",
  "customer",
  "customerPhone",
  "whatsappMessage",
]);

/**
 * Keep commercial terms out of public catalog copy.  The source PDFs contain
 * occasional price-list boilerplate (and machine capacity labels using the
 * word "stok").  Product records must remain quote-only, so normalize those
 * phrases before returning a public record or creating a snapshot.
 */
export function sanitizeCommercialText(value) {
  return String(value ?? "")
    .replace(/f[ıiİI]yata?\s+dahildir/giu, "kapsama dahildir")
    .replace(/f[ıiİI]yat[ıiİI]?/giu, "")
    .replace(/stok\s+kahve\s+kapasitesi/giu, "kahve kapasitesi")
    .replace(/stok/giu, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export function slugify(value) {
  return String(value ?? "")
    .toLocaleLowerCase("tr-TR")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/ı/g, "i")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 96);
}

function findForbiddenKey(value, path = "product") {
  if (!value || typeof value !== "object") return null;
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_KEYS.has(key)) return `${path}.${key}`;
    const nested = findForbiddenKey(child, `${path}.${key}`);
    if (nested) return nested;
  }
  return null;
}

export function validateProduct(input) {
  const errors = [];
  const rawProduct = structuredClone(input ?? {});
  for (const field of REQUIRED_FIELDS) {
    if (!(field in rawProduct)) errors.push(`Eksik alan: ${field}`);
  }
  const product = Object.fromEntries(
    REQUIRED_FIELDS.filter((field) => field in rawProduct).map((field) => [field, rawProduct[field]]),
  );
  if (!/^family-[a-z0-9-]{3,80}$/.test(product.id ?? "")) errors.push("Geçersiz ürün kimliği.");
  if (slugify(product.slug) !== product.slug) errors.push("Geçersiz ürün slug değeri.");
  for (const field of ["brand", "name", "category", "summary", "description"]) {
    if (!String(product[field] ?? "").trim()) errors.push(`${field} boş bırakılamaz.`);
  }
  if (!Array.isArray(product.variants) || product.variants.length === 0) {
    errors.push("En az bir varyant/model gereklidir.");
  }
  if (!Array.isArray(product.images)) errors.push("Görseller dizisi geçersiz.");
  if (Array.isArray(product.images) && product.images.length === 0
    && !["research-needed", "missing"].includes(rawProduct.imageStatus)) {
    errors.push("En az bir ürün görseli gereklidir veya imageStatus research-needed/missing olmalıdır.");
  }
  const forbidden = findForbiddenKey(rawProduct);
  if (forbidden) errors.push(`Yasaklı veri alanı: ${forbidden}`);

  const variantIds = new Set();
  for (const variant of product.variants ?? []) {
    if (!variant.id || variantIds.has(variant.id)) errors.push("Varyant kimlikleri benzersiz olmalıdır.");
    variantIds.add(variant.id);
  }
  const imageIds = new Set();
  for (const [index, image] of (product.images ?? []).entries()) {
    if (!image.id || imageIds.has(image.id)) errors.push("Görsel kimlikleri benzersiz olmalıdır.");
    imageIds.add(image.id);
    if (!image.src || !image.thumbnailSrc) errors.push(`${image.id || "Görsel"} dosya yolları eksik.`);
    image.order = index + 1;
    image.variantIds = Array.isArray(image.variantIds)
      ? image.variantIds.filter((id) => variantIds.has(id))
      : [];
  }
  for (const variant of product.variants ?? []) {
    if (variant.imageId && !imageIds.has(variant.imageId)) {
      errors.push(`${variant.id}: eşleşen görsel bulunamadı.`);
    }
  }
  if (errors.length) {
    const error = new Error(errors.join(" "));
    error.status = 422;
    throw error;
  }
  product.status = product.status === "archived" ? "archived" : "published";
  return product;
}

export function publicProduct(product) {
  const publicRecord = (value) =>
    Object.fromEntries(
      Object.entries(value ?? {}).filter(([, item]) =>
        ["string", "number", "boolean"].includes(typeof item)),
    );
  return {
    id: String(product.id ?? ""),
    slug: String(product.slug ?? ""),
    brand: String(product.brand ?? ""),
    name: sanitizeCommercialText(product.name),
    category: String(product.category ?? ""),
    subcategory: String(product.subcategory ?? ""),
    summary: sanitizeCommercialText(product.summary),
    description: sanitizeCommercialText(product.description),
    features: Array.isArray(product.features) ? product.features.map(sanitizeCommercialText).filter(Boolean) : [],
    specifications: Object.fromEntries(
      Object.entries(publicRecord(product.specifications)).map(([key, value]) => [sanitizeCommercialText(key), sanitizeCommercialText(value)]),
    ),
    images: Array.isArray(product.images)
      ? product.images.map((image, index) => ({
          id: String(image.id ?? ""),
          src: String(image.src ?? ""),
          thumbnailSrc: String(image.thumbnailSrc ?? ""),
          alt: String(image.alt ?? ""),
          order: Number(image.order ?? index + 1),
          variantIds: Array.isArray(image.variantIds) ? image.variantIds.map(String) : [],
        }))
      : [],
    variants: Array.isArray(product.variants)
      ? product.variants.map((variant) => ({
          id: String(variant.id ?? ""),
          name: String(variant.name ?? ""),
          code: String(variant.code ?? ""),
          attributes: publicRecord(variant.attributes),
          ...(variant.imageId ? { imageId: String(variant.imageId) } : {}),
        }))
      : [],
    source: {
      catalog: sanitizeCommercialText(product.source?.catalog ?? "Karahanlı Gıda kataloğu") || "Karahanlı Gıda kataloğu",
      pages: Array.isArray(product.source?.pages)
        ? product.source.pages.filter(Number.isFinite).map(Number)
        : [],
    },
    featured: Boolean(product.featured),
    status: product.status === "archived" ? "archived" : "published",
    ...(product.imageStatus ? { imageStatus: String(product.imageStatus) } : {}),
  };
}

// Excel aktarımında kaynağı veya görseli henüz doğrulanmamış kayıtlar taslak
// olarak saklanabilir. Yayınlama aşamasında validateProduct ile tam sözleşme
// kontrolü yine zorunludur.
export function validateDraft(input) {
  const raw = structuredClone(input ?? {});
  const forbidden = findForbiddenKey(raw);
  if (forbidden) {
    const error = new Error(`Yasaklı veri alanı: ${forbidden}`);
    error.status = 422;
    throw error;
  }
  const errors = [];
  for (const field of ["id", "slug", "brand", "name", "category", "summary", "description"]) {
    if (!(field in raw) || !String(raw[field] ?? "").trim()) errors.push(`${field} boş bırakılamaz.`);
  }
  if (!/^family-[a-z0-9-]{3,80}$/.test(raw.id ?? "")) errors.push("Geçersiz ürün kimliği.");
  if (slugify(raw.slug) !== raw.slug) errors.push("Geçersiz ürün slug değeri.");
  if (errors.length) {
    const error = new Error(errors.join(" "));
    error.status = 422;
    throw error;
  }
  return {
    ...raw,
    subcategory: String(raw.subcategory ?? ""),
    features: Array.isArray(raw.features) ? raw.features.map(String) : [],
    specifications: raw.specifications && typeof raw.specifications === "object" ? raw.specifications : {},
    images: Array.isArray(raw.images) ? raw.images : [],
    variants: Array.isArray(raw.variants) ? raw.variants : [],
    source: raw.source && typeof raw.source === "object" ? raw.source : { catalog: "Admin paneli", pages: [] },
    featured: Boolean(raw.featured),
    status: "draft",
  };
}
