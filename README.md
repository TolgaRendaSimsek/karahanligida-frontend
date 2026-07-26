# Karahanlı Gıda Katalog ve Teklif Sitesi

Statik HTML/CSS/JavaScript ile çalışan, fiyat göstermeyen ürün kataloğu ve WhatsApp teklif sepeti.

## Yerel çalıştırma

Dosyalar `fetch()` kullandığı için projeyi doğrudan dosya olarak açmak yerine yerel bir web sunucusuyla başlatın:

```powershell
python -m http.server 4173 --bind 127.0.0.1
```

Ardından `http://127.0.0.1:4173` adresini açın.

- Ana sayfa: `index.html`
- Tüm katalog: `products.html`
- Ürün detayları: `urunler/<slug>.html`
- Yerel katalog düzenleyici: `admin.html`
- Ana ürün verisi: `data/products.json`

## Katalog verisini yeniden üretme

PDF kataloglar frontend deposuna kopyalanmaz. Kaynak dosyaların projenin üst klasöründeki `Ürünler` dizininde bulunması gerekir.

```powershell
python tools/build_catalog.py --clean
node tools/generate_product_pages.mjs
python tools/validate_catalog.py
node tools/test_quote_message.mjs
```

İlk komut PDF içindeki ürün görsellerini WebP olarak ayıklar, aile/varyant verisini üretir ve kaynak manifestini günceller. İkinci komut paylaşılabilir ürün detay sayfalarını oluşturur.

## WhatsApp ayarı

İşletme numarasını `config.js` içindeki `whatsappNumber` alanına ülke koduyla ve yalnızca rakam kullanarak yazın. Canlı alan adı belli olduğunda `siteUrl` alanını da doldurun. Mesaj ürün ailesi, varyant/model, ürün kodu, adet ve detay sayfası bağlantısını içerir.

## Admin ve Firebase

Admin paneli şu aşamada tarayıcıdaki yerel taslak üzerinde çalışır ve katalog JSON dosyasını içe/dışa aktarır. Canlı Firebase geçişi için Firestore, Storage ve Authentication hazırlıkları `firebase/` dizinindedir. Kurulum sırası ve güvenlik notları için [Firebase rehberine](docs/FIREBASE_TR.md) bakın.

Hiçbir Firebase projesi bağlanmamış ve yayınlama yapılmamıştır.
