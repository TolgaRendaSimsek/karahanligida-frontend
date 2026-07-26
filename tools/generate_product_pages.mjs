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
  const html = `<!doctype html>
<html lang="tr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="description" content="${escape(product.summary)}">
  <meta property="og:title" content="${escape(product.name)} | ${escape(product.brand)}">
  <meta property="og:description" content="${escape(product.summary)}">
  <meta property="og:image" content="../${escape(product.images[0].src)}">
  <title>${escape(product.name)} | ${escape(product.brand)} | Karahanlı Gıda</title>
  <link rel="icon" type="image/png" href="../logo.png">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Playfair+Display:wght@600;700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="../styles.css">
  <link rel="stylesheet" href="../catalog.css">
</head>
<body data-product-slug="${escape(product.slug)}">
  <div class="announcement">Karahanlı Gıda profesyonel ürün kataloğu · Fiyat bilgisi için teklif isteyin</div>
  <header class="site-header">
    <div class="header-main container">
      <a class="brand" href="../index.html"><img src="../logo.png" alt="Karahanlı Gıda" class="brand-logo"><span class="brand-copy"><strong>KARAHANLI GIDA</strong><small>HORECA DAĞITIM</small></span></a>
      <form class="search" action="../products.html"><input name="q" type="search" placeholder="Ürün, model kodu veya marka ara"><button type="submit">⌕</button></form>
      <div class="header-actions"><a class="action-link" href="../favorites.html"><span>♡</span><small>Favoriler</small></a><a class="action-link cart-button" href="../index.html#quote-cart"><span>▱</span><small>Teklif Sepeti</small></a></div>
    </div>
    <nav class="simple-nav"><div class="container"><a href="../index.html">Ana Sayfa</a><a href="../products.html">Tüm Ürünler</a><a href="../products.html?brand=${encodeURIComponent(product.brand)}">${escape(product.brand)}</a><a href="../products.html?category=${encodeURIComponent(product.category)}">${escape(product.category)}</a></div></nav>
  </header>
  <main class="detail-main container" id="productDetail"><p class="loading-state">Ürün bilgileri yükleniyor…</p></main>
  <footer class="site-footer"><div class="container footer-bottom"><span>© 2026 Karahanlı Gıda.</span><a href="../products.html">Ürün kataloğu</a></div></footer>
  <div class="toast" id="toast"></div>
  <script src="../catalog-core.js"></script>
  <script src="../product-detail.js"></script>
</body>
</html>
`;
  await writeFile(join(target, `${product.slug}.html`), html, "utf8");
}

console.log(`${payload.products.length} ürün detay sayfası oluşturuldu.`);
