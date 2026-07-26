import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "İletişim",
  description: "Karahanlı Gıda ürün, teklif ve profesyonel HORECA çözümleri için iletişim.",
  alternates: { canonical: "/iletisim" },
};

export default async function ContactPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const whatsappUnavailable = params.durum === "whatsapp-yapilandirilmadi";
  return (
    <main>
      <section className="page-hero compact">
        <div className="container"><span className="eyebrow light">BİZE ULAŞIN</span><h1>İşletmeniz için birlikte çalışalım.</h1><p>Ürün seçimi, teklif ve teslimat bilgileri için ekibimizle iletişime geçin.</p></div>
      </section>
      {whatsappUnavailable && (
        <div className="container contact-notice" role="status">
          WhatsApp teklif hattı henüz yapılandırılmadı. Teklifiniz için e-posta yoluyla bize ulaşabilirsiniz.
        </div>
      )}
      <section className="container contact-grid">
        <article className="contact-card featured">
          <span>TEKLİF LİSTESİ</span>
          <h2>Birden fazla ürün mü seçtiniz?</h2>
          <p>Ürünleri teklif sepetinize ekleyin; varyant, model ve adet bilgilerini tek mesajla iletin.</p>
          <Link href="/urunler" className="button light">Kataloğa git</Link>
        </article>
        <article className="contact-card">
          <span>E-POSTA</span>
          <h2>ozkanguden@karahanligida.com</h2>
          <p>Ürün ve iş ortaklığı talepleriniz için doğrudan e-posta gönderebilirsiniz.</p>
          <a className="button secondary" href="mailto:ozkanguden@karahanligida.com">E-posta gönder</a>
        </article>
        <article className="contact-card">
          <span>KONUM</span>
          <h2>Adana, Türkiye</h2>
          <p>Profesyonel HORECA işletmelerine ürün ve çözüm desteği sağlıyoruz.</p>
        </article>
      </section>
    </main>
  );
}
