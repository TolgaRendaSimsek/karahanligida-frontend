# Medya denetimi ve şeffaf ürün görselleri

Ürün görselleri public katalogda `/media/products/<family-id>/...` yolunu kullanır. Linux'ta bu yol Caddy tarafından `/srv/karahanli/data/media` dizininden, Next.js'in lokal geliştirme ortamında ise `data/media` dizininden okunur. `data/media`, servis hesabı ve yedekler git'e alınmaz.

## Güvenli arka plan temizleme

Önce yalnızca rapor üretmek için:

```bash
node tools/prepare_transparent_product_images.mjs --dry-run
```

Yüksek güvenli kenar-beyaz alanlarını şeffaf WebP'ye dönüştürüp orijinalleri yedeklemek için:

```bash
node tools/prepare_transparent_product_images.mjs --apply
```

Varsayılan eşik `0.85`'tir. Eşik altındaki veya neredeyse tamamen şeffaf/kapalı sonuçlar `review` olarak bırakılır. Çıktı ve geri alma dosyaları `data/backups/` altındadır. Bu işlem ürünün içindeki beyaz alanları silmez; yalnız kenara bağlı beyaz bölgeyi işler.

## Medya mutabakatı

```bash
node tools/audit_media.mjs --output=data/backups/media-audit.json
```

Admin paneli aynı raporu `GET /api/admin/media/audit` üzerinden gösterir. Denetim tam boy/küçük WebP dosyalarını, alfa kanalını, hash'leri ve sahipsiz medya dosyalarını bildirir.

Yeni admin yüklemeleri de aynı güvenli işleme tabi tutulur. Belirsiz dosya değiştirilmez ve kaynak bilgisinde `backgroundRemoval: "review"` olarak işaretlenir.
