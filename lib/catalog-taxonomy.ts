export type CatalogTaxonomyEntry = {
  name: string;
  slug: string;
  subcategories: string[];
};

export const CATALOG_TAXONOMY: CatalogTaxonomyEntry[] = [
  { name: "Kahve", slug: "kahve", subcategories: ["Çekirdek Kahve", "Filtre Kahve", "Kapsül Kahve", "Türk Kahvesi ve Yöresel"] },
  { name: "Çay", slug: "cay", subcategories: ["Siyah Çay", "Bitki Çayları"] },
  { name: "Şurup ve Püreler", slug: "surup-ve-pureler", subcategories: ["Kokteyl Şurupları", "Meyve Püreleri"] },
  { name: "Soslar", slug: "soslar", subcategories: ["Profesyonel Soslar", "Topping ve Dekor Sosları"] },
  { name: "Gıda Ürünleri", slug: "gida-urunleri", subcategories: ["Toz İçecekler", "Süt ve Krema", "Tatlı/Topping Ürünleri", "Diğer Gıda Ürünleri"] },
  { name: "Donuk Ürünler", slug: "donuk-urunler", subcategories: ["Donuk Meyveler", "Donuk İçecekler"] },
  { name: "Gıda Dışı Ürünler", slug: "gida-disi-urunler", subcategories: ["Bardak ve Kapak", "Pipet ve Karıştırıcı", "Servis Sarfı", "Temizlik Ürünleri", "Diğer Sarf Ürünleri"] },
  { name: "Kahve Makineleri", slug: "kahve-makineleri", subcategories: ["Espresso Kahve Makineleri", "Süper Otomatik Kahve Makineleri", "Filtre Kahve Makineleri", "Kahve Değirmenleri"] },
  { name: "Endüstriyel Mutfak Ekipmanları", slug: "endustriyel-mutfak-ekipmanlari", subcategories: [] },
];

export function taxonomyBySlug(slug: string) {
  return CATALOG_TAXONOMY.find((entry) => entry.slug === slug);
}

export function taxonomySlugForName(name: string) {
  return CATALOG_TAXONOMY.find((entry) => entry.name === name)?.slug;
}
