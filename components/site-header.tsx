"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useState } from "react";
import { useStore } from "./store-provider";

const navigation = [
  { href: "/urunler", label: "Tüm Ürünler" },
  { href: "/urunler?category=Kahve", label: "Kahve" },
  { href: "/urunler?category=Çay", label: "Çay" },
  { href: "/urunler?category=Şurup ve Püreler", label: "Şurup & Püre" },
  { href: "/urunler?category=Endüstriyel Mutfak Ekipmanları", label: "Ekipman" },
  { href: "/#markalar", label: "Markalar" },
];

export function SiteHeader() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { favorites, cart, setCartOpen } = useStore();
  const [menuOpen, setMenuOpen] = useState(false);
  const [query, setQuery] = useState(searchParams.get("q") || "");

  function submitSearch(event: FormEvent) {
    event.preventDefault();
    const value = query.trim();
    router.push(value ? `/urunler?q=${encodeURIComponent(value)}` : "/urunler");
    setMenuOpen(false);
  }

  return (
    <>
      <div className="announcement">
        <span>Karahanlı Gıda profesyonel ürün kataloğu</span>
        <Link href="/urunler">230 ürün ailesini keşfedin <span aria-hidden>→</span></Link>
      </div>
      <header className="site-header">
        <div className="header-main container">
          <button
            type="button"
            className="mobile-menu-button"
            aria-label="Menüyü aç"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
          >
            <span />
            <span />
            <span />
          </button>
          <Link className="brand" href="/" aria-label="Karahanlı Gıda ana sayfa">
            <Image src="/logo.png" width={58} height={58} alt="Karahanlı Gıda" priority />
            <span>
              <strong>KARAHANLI GIDA</strong>
              <small>HORECA DAĞITIM</small>
            </span>
          </Link>
          <form className="header-search" role="search" onSubmit={submitSearch}>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Ürün, marka, varyant veya model ara"
              aria-label="Katalogda ara"
            />
            <button type="submit" aria-label="Ara">⌕</button>
          </form>
          <div className="header-actions">
            <Link className="header-action contact-action" href="/iletisim">
              <span aria-hidden>↗</span><small>İletişim</small>
            </Link>
            <Link
              className={`header-action${pathname === "/favoriler" ? " active" : ""}`}
              href="/favoriler"
            >
              <span aria-hidden>♡</span><small>Favoriler</small>
              {favorites.length > 0 && <b>{favorites.length}</b>}
            </Link>
            <button className="header-action" type="button" onClick={() => setCartOpen(true)}>
              <span aria-hidden>▱</span><small>Teklif Sepeti</small>
              {cart.length > 0 && <b>{cart.reduce((sum, item) => sum + item.quantity, 0)}</b>}
            </button>
          </div>
        </div>
        <nav className={`category-nav${menuOpen ? " open" : ""}`} aria-label="Ana menü">
          <div className="container nav-inner">
            {navigation.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={pathname === item.href ? "active" : undefined}
                onClick={() => setMenuOpen(false)}
              >
                {item.label}
              </Link>
            ))}
            <Link className="nav-contact" href="/iletisim" onClick={() => setMenuOpen(false)}>
              Teklif için iletişime geçin
            </Link>
          </div>
        </nav>
      </header>
    </>
  );
}
