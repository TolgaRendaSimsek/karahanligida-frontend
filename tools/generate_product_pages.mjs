import { readFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const toolDir = dirname(fileURLToPath(import.meta.url));
const root = join(toolDir, "..");
const payload = JSON.parse(await readFile(join(root, "data", "products.json"), "utf8"));
const target = join(root, "urunler");
await mkdir(target, { recursive: true });

const escape = (value) =>
  String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]);

for (const product of payload.products) {
  const imageUrl = product.images[0].src.startsWith("/")
    ? product.images[0].src
    : `../${product.images[0].src}`;
  const html = `<!doctype html>
<html lang="tr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="description" content="${escape(product.summary)}">
  <meta property="og:title" content="${escape(product.name)} | ${escape(product.brand)}">
  <meta property="og:description" content="${escape(product.summary)}">
  <meta property="og:image" content="${escape(imageUrl)}">
  <title>${escape(product.name)} | ${escape(product.brand)} | Karahanlı Gıda</title>
  <link rel="icon" type="image/png" href="../logo.png">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Playfair+Display:wght@600;700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="../styles.css">
  <link rel="stylesheet" href="../catalog.css?v=20260726">
  <link rel="stylesheet" href="../quote-cart.css?v=20260726">
</head>
<body data-product-id="${escape(product.id)}" data-product-slug="${escape(product.slug)}">
  <div class="announcement">Karahanlı Gıda profesyonel ürün kataloğu · Fiyat bilgisi için teklif isteyin</div>
  <header class="site-header">
    <div class="header-main container">
      <a class="brand" href="../index.html"><img src="../logo.png" alt="Karahanlı Gıda" class="brand-logo"><span class="brand-copy"><strong>KARAHANLI GIDA</strong><small>HORECA DAĞITIM</small></span></a>
      <form class="search" action="../products.html"><input name="q" type="search" placeholder="Ürün, model kodu veya marka ara"><button type="submit">⌕</button></form>
      <div class="header-actions"><a class="action-link" href="../favorites.html"><span>♡</span><small>Favoriler</small></a><button class="action-link cart-button" id="cartBtn" type="button"><span>▱</span><small>Teklif Sepeti</small><b id="cartCount">0</b></button></div>
    </div>
    <nav class="simple-nav"><div class="container"><a href="../index.html">Ana Sayfa</a><a href="../products.html">Tüm Ürünler</a><a href="../products.html?brand=${encodeURIComponent(product.brand)}">${escape(product.brand)}</a><a href="../products.html?category=${encodeURIComponent(product.category)}">${escape(product.category)}</a></div></nav>
  </header>
  <main class="detail-main container" id="productDetail"><p class="loading-state">Ürün bilgileri yükleniyor…</p></main>
  <footer class="site-footer"><div class="container footer-bottom"><span>© 2026 Karahanlı Gıda.</span><a href="../products.html">Ürün kataloğu</a></div></footer>
  <aside class="cart-drawer" id="cartDrawer" aria-hidden="true" aria-label="Teklif sepeti">
    <div class="drawer-head"><h3>Teklif Sepeti</h3><button id="closeCart" aria-label="Kapat">×</button></div>
    <div class="drawer-body" id="cartItems"></div>
    <div class="drawer-footer"><span class="quote-summary" id="quoteSummary"></span><button class="btn btn-primary full" id="checkoutBtn">WhatsApp'tan Teklif İste</button></div>
  </aside>
  <div class="overlay" id="overlay"></div>
  <div class="toast" id="toast"></div>
  <script src="../config.js?v=20260726"></script>
  <script src="../quote-message.js?v=20260726"></script>
  <script src="../catalog-core.js?v=20260726"></script>
  <script src="../quote-cart.js?v=20260726"></script>
  <script src="../product-detail.js?v=20260726"></script>
</body>
</html>
`;
  await writeFile(join(target, `${product.slug}.html`), html, "utf8");
}

console.log(`${payload.products.length} ürün detay sayfası oluşturuldu.`);
