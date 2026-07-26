# Karahanlı Gıda Katalog ve Teklif Sitesi

Statik HTML/CSS/JavaScript ile çalışan, fiyat göstermeyen ürün kataloğu, çoklu ürün galerileri, WhatsApp teklif sepeti ve Firebase destekli yönetim sistemi.

## Yerel çalıştırma

Dosyalar `fetch()` kullandığı için projeyi doğrudan dosya olarak açmak yerine yerel bir web sunucusuyla başlatın:

```powershell
python -m http.server 4173 --bind 127.0.0.1
```

Ardından `http://127.0.0.1:4173` adresini açın.

- Ana sayfa: `index.html`
- Tüm katalog: `products.html`
- Ürün detayları: `urunler/<slug>.html`
- Firebase admin paneli: `admin.html`
- Ana ürün verisi: `data/products.json`

## Katalog verisini yeniden üretme

PDF kataloglar frontend deposuna kopyalanmaz. Kaynak dosyaların projenin üst klasöründeki `Ürünler` dizininde bulunması gerekir.

```powershell
python tools/build_catalog.py --clean
node tools/sanitize_public_catalog.mjs
node tools/generate_product_pages.mjs
python tools/validate_catalog.py
node tools/test_quote_message.mjs
```

İlk komut PDF içindeki ürün görsellerini ayrı tam/küçük WebP galerileri olarak ayıklar, aile/varyant verisini üretir ve kaynak manifestini günceller. İkinci komut paylaşılabilir ürün detay sayfalarını oluşturur.

## WhatsApp ayarı

İşletme numarasını `config.js` içindeki `whatsappNumber` alanına ülke koduyla ve yalnızca rakam kullanarak yazın. Canlı alan adı belli olduğunda `siteUrl` alanını da doldurun. Mesaj ürün ailesi, varyant/model, ürün kodu, adet ve detay sayfası bağlantısını içerir.

## Admin, Firebase ve Linux

Firestore ürün içeriklerinin ana kaynağıdır; Firebase Authentication birden fazla admin hesabını doğrular. Görseller Firebase Storage yerine Linux diskine yüklenir. Docker içindeki admin API her yayında statik `products.json` snapshot'ını ve ürün sayfasını yeniler.

Caddy doğrudan Git deposunu sunmaz. `deploy/linux/build-public.sh` yalnızca gerekli HTML, CSS, JavaScript, katalog ve görsellerden ayrı bir `public/current` sürümü oluşturur.

Kurulum sırası, Docker Compose, Caddy yönlendirmeleri, servis hesabı ve admin yetkileri için [Firebase/Linux rehberine](docs/FIREBASE_TR.md) bakın.

Firebase projesi oluşturulmamış, gerçek servis hesabı eklenmemiş ve sunucuya yayın yapılmamıştır.
