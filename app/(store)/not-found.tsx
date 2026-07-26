import Link from "next/link";

export default function NotFound() {
  return (
    <main className="not-found container">
      <span>404</span><h1>Aradığınız sayfa bulunamadı.</h1>
      <p>Ürün kaldırılmış veya adres değiştirilmiş olabilir.</p>
      <Link className="button primary" href="/urunler">Ürün kataloğuna dön</Link>
    </main>
  );
}
