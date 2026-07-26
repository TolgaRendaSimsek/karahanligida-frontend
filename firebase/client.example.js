// Ziyaretçi uygulaması Firestore'u doğrudan okumaz. Firestore ana veri
// kaynağıdır; Linux admin API her yayında bu statik snapshot'ı yeniler.
export async function fetchPublishedFamilies() {
  const response = await fetch("/data/products.json", { cache: "no-cache" });
  if (!response.ok) throw new Error("Ürün kataloğu yüklenemedi.");
  const payload = await response.json();
  return payload.products.filter((product) => product.status === "published");
}
