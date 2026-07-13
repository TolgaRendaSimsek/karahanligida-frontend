# Karahanlı Gıda Frontend + Admin Panel

## Çalıştırma
Klasörü VS Code ile açın ve `index.html` dosyasını **Live Server** ile başlatın.

- Mağaza: `index.html`
- Yönetim paneli: `admin.html`
- Mağazadaki **Hesabım** düğmesi de admin paneline gider.

## Admin paneli özellikleri
- Ürün ekleme
- Ürün düzenleme
- Ürün silme
- Marka, kategori, fiyat, eski fiyat, stok, rozet, renk ve görsel URL'si yönetimi
- Arama ve kategori filtresi
- JSON yedek indirme / yükleme
- Varsayılan ürünlere dönme

## Veri saklama
Bu sürüm backend içermez. Ürünler tarayıcının `localStorage` alanında tutulur. Bu nedenle veriler yalnızca aynı tarayıcı ve cihazda kalır. Gerçek bir yayın ortamında kullanıcı girişi, veritabanı, görsel yükleme ve güvenli API için backend gerekir.
