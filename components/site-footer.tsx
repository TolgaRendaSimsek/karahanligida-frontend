import Image from "next/image";
import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="container footer-grid">
        <div className="footer-brand">
          <Image src="/logo.png" width={58} height={58} alt="" />
          <div><strong>KARAHANLI GIDA</strong><span>Profesyonel HORECA çözümleri</span></div>
        </div>
        <div>
          <h3>Katalog</h3>
          <Link href="/urunler">Tüm ürünler</Link>
          <Link href="/favoriler">Favoriler</Link>
          <Link href="/urunler?category=Kahve">Kahve</Link>
          <Link href="/urunler?category=Kahve Makineleri">Kahve makineleri</Link>
        </div>
        <div>
          <h3>Kurumsal</h3>
          <Link href="/#hakkimizda">Hakkımızda</Link>
          <Link href="/#markalar">Markalar</Link>
          <Link href="/iletisim">İletişim</Link>
        </div>
        <div>
          <h3>İletişim</h3>
          <a href="mailto:ozkanguden@karahanligida.com">ozkanguden@karahanligida.com</a>
          <span>Adana, Türkiye</span>
        </div>
      </div>
      <div className="container footer-bottom">
        <span>© 2026 Karahanlı Gıda. Tüm hakları saklıdır.</span>
        <span>Fiyat bilgisi için teklif isteyin.</span>
      </div>
    </footer>
  );
}
