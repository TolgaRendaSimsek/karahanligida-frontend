import type { Metadata } from "next";
import { FavoritesClient } from "@/components/favorites-client";

export const metadata: Metadata = {
  title: "Favorilerim",
  robots: { index: false, follow: true },
};

export default function FavoritesPage() {
  return (
    <main>
      <section className="page-hero compact">
        <div className="container"><span className="eyebrow light">SEÇTİKLERİNİZ</span><h1>Favori ürünleriniz</h1><p>İlgilendiğiniz ürünleri tek yerde inceleyin ve teklif listenize ekleyin.</p></div>
      </section>
      <section className="container favorites-page"><FavoritesClient /></section>
    </main>
  );
}
