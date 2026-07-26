# Karahanlı Gıda

Next.js App Router ile çalışan, fiyat göstermeyen HORECA ürün kataloğu ve Firebase destekli katalog yönetim sistemi.

## Yerel geliştirme

Node.js 22 ve pnpm 11 gereklidir:

```bash
pnpm install
pnpm dev
```

Canlı site `https://karahanligida.com` adresinde çalışır. Docker servisleri
yalnızca Linux sunucuda Caddy arkasındaki loopback portlarına bağlanır.

- Ana sayfa: `/`
- Ürün kataloğu: `/urunler`
- Ürün detayı: `/urunler/<slug>`
- Favoriler: `/favoriler`
- İletişim: `/iletisim`
- Yönetim: `/admin`

Ürünler varsayılan olarak `data/products.json` dosyasından okunur. Üretimde `CATALOG_PATH` Linux üzerindeki kalıcı snapshot dosyasını gösterir.

## Yapı

- Next.js web/SSR servisi: `127.0.0.1:3000`
- Firebase admin API: `127.0.0.1:3100`
- Caddy: HTTPS, güvenlik başlıkları, `/media`, `/assets` ve reverse proxy
- Firestore: yalnızca admin içerik yönetimi
- Linux diski: katalog snapshot’ları ve yüklenen WebP görseller

Ziyaretçi sayfaları Firestore’a doğrudan bağlanmaz. Admin yayınlama işlemi atomik `products.json` snapshot’ı oluşturur; Next.js dosya değişikliğini otomatik algılar.

## Ortam değişkenleri

`.env.example` dosyasını Git dışında tutulan `.env` dosyasına kopyalayın. Firebase servis hesabını yalnızca Docker secret olarak bağlayın.

WhatsApp numarası ülke koduyla ve yalnızca rakamlardan oluşmalıdır:

```text
WHATSAPP_NUMBER=905xxxxxxxxx
```

## Doğrulama

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm test:e2e
python tools/validate_catalog.py
node tools/validate_next_routes.mjs https://karahanligida.com
pnpm --dir admin-api test
```

## Linux yayını

Kurulum, Firebase ve Caddy adımları için `docs/FIREBASE_TR.md` dosyasına bakın. Next.js üretimde standalone Docker imajı olarak çalışır; Caddy kaynak kodları doğrudan yayınlamaz.
