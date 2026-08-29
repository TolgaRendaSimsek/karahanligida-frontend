import Image from "next/image";
import Link from "next/link";
import { ProductCard } from "@/components/product-card";
import { publishedProducts } from "@/lib/catalog-repository";
import { publicAssetPath, toCatalogCard } from "@/lib/catalog-schema";

export default async function HomePage() {
  const products = await publishedProducts();
  const featured = products.filter((product) => product.featured).slice(0, 4);
  const brands = [...new Set(products.map((product) => product.brand))];
  const heroCoffee = products.find((product) => product.slug === "kimbo-horeca-cekirdek-kahveler")
    ?? products.find((product) => product.category === "Kahve");
  const accentCoffee = products.find((product) => product.slug === "kimbo-retail-cekirdek-kahveler")
    ?? products.find((product) => product.category === "Kahve" && product.id !== heroCoffee?.id);

  return (
    <main>
      <section className="hero">
        <div className="container hero-grid">
          <div className="hero-copy">
            <span className="eyebrow light">PROFESYONEL HORECA DAĞITIM</span>
            <h1>İşletmenizin lezzet ve ekipman partneri.</h1>
            <p>
              Seçkin kahve, içecek ve profesyonel mutfak markalarını doğru ürün,
              güvenilir tedarik ve uzmanlıkla buluşturuyoruz.
            </p>
            <div className="hero-actions">
              <Link className="button light" href="/urunler">Ürün kataloğunu keşfet</Link>
              <Link className="text-button light" href="/iletisim">Teklif için iletişime geç →</Link>
            </div>
            <div className="hero-stats">
              <div><strong>{products.length}</strong><span>Ürün ailesi</span></div>
              <div><strong>{brands.length}</strong><span>Seçkin marka</span></div>
              <div><strong>HORECA</strong><span>Uzmanlığı</span></div>
            </div>
          </div>
          <div className="hero-visual">
            {heroCoffee && <Link className="hero-image-card main" href={`/urunler/${heroCoffee.slug}`} aria-label={`${heroCoffee.name} ürününü incele`}>
              {heroCoffee.images[0] ? <Image
                src={publicAssetPath(heroCoffee.images[0].src)}
                fill
                priority
                sizes="(max-width: 900px) 90vw, 42vw"
                alt={heroCoffee.images[0].alt || `Kimbo ${heroCoffee.name}`}
              /> : <span className="product-image-placeholder"><span>Görsel doğrulanıyor</span></span>}
            </Link>}
            {accentCoffee && <Link className="hero-image-card accent" href={`/urunler/${accentCoffee.slug}`} aria-label={`${accentCoffee.name} ürününü incele`}>
              {accentCoffee.images[0] ? <Image
                src={publicAssetPath(accentCoffee.images[0].src)}
                fill
                sizes="220px"
                alt={accentCoffee.images[0].alt || `Kimbo ${accentCoffee.name}`}
              /> : <span className="product-image-placeholder"><span>Görsel doğrulanıyor</span></span>}
            </Link>}
            <div className="hero-note"><span>7 katalog</span><strong>Tek bir profesyonel çözüm ortağı</strong></div>
          </div>
        </div>
      </section>

      <section className="trust-bar">
        <div className="container">
          <span>✓ Doğrulanmış ürün kataloğu</span>
          <span>✓ İşletmenize özel teklif</span>
          <span>✓ Marka ve model danışmanlığı</span>
          <span>✓ Profesyonel tedarik desteği</span>
        </div>
      </section>

      <section className="home-products container" id="urunler">
        <div className="section-heading">
          <div><span className="eyebrow">ÖNE ÇIKAN ÜRÜNLER</span><h2>Profesyonellerin seçimi</h2></div>
          <Link href="/urunler">Tüm kataloğu gör →</Link>
        </div>
        <div className="product-grid">
          {featured.map((product) => <ProductCard product={toCatalogCard(product)} key={product.id} />)}
        </div>
      </section>

      <section className="brand-section" id="markalar">
        <div className="container">
          <div className="section-heading centered">
            <div><span className="eyebrow">MARKALARIMIZ</span><h2>Güvenilir global ve yerel markalar</h2></div>
          </div>
          <div className="brand-cloud">
            {brands.map((brand) => <Link href={`/urunler?brand=${encodeURIComponent(brand)}`} key={brand}>{brand}</Link>)}
          </div>
        </div>
      </section>

      <section className="story-section container" id="hakkimizda">
        <div className="story-visual">
          <div className="story-mark">KG</div>
          <p>Adana&apos;dan Türkiye&apos;nin profesyonel mutfaklarına.</p>
        </div>
        <div className="story-copy">
          <span className="eyebrow">KARAHANLI GIDA</span>
          <h2>Üründen fazlası: doğru çözüm, güçlü iş ortaklığı.</h2>
          <p>
            HORECA işletmelerinin değişen ihtiyaçlarını anlayarak kahveden içecek
            bileşenlerine, profesyonel ekipmandan satış sonrası desteğe kadar
            bütünlüklü çözümler sunuyoruz.
          </p>
          <Link className="button secondary" href="/iletisim">Bizimle iletişime geçin</Link>
        </div>
      </section>

      <section className="cta-section">
        <div className="container">
          <div><span className="eyebrow light">İŞLETMENİZ İÇİN</span><h2>Doğru ürünleri birlikte seçelim.</h2></div>
          <Link className="button light" href="/urunler">Kataloğu incele</Link>
        </div>
      </section>
    </main>
  );
}
