# Karahanlı Gıda: Firebase, Next.js ve Linux İşletim Rehberi

Firebase Spark planı yalnızca Email/Password Authentication ve Firestore yönetim verisi için kullanılır. Firebase Storage, Hosting ve Functions kullanılmaz. Ziyaretçi trafiği Firestore'a gitmez.

## Mimari

```text
Ziyaretçi -> Caddy -> Next.js (127.0.0.1:3000)
                         |
                         +-> /data/products.json snapshot

Admin -> Firebase Auth -> api.karahanligida.com -> admin-api (127.0.0.1:3100)
                                                   |
                                                   +-> Firestore
                                                   +-> Linux medya ve snapshot diski
```

Next.js katalog dosyasını `CATALOG_PATH` üzerinden okur, Zod ile doğrular ve dosyanın değiştirilme zamanı değişince belleğini yeniler. Hatalı bir snapshot yazılırsa son geçerli katalog bellekte kalır. Servis geçerli katalog olmadan hazır sayılmaz.

## Sunucu dizinleri

Önerilen yerleşim:

```text
/srv/karahanli/app/current       Git çalışma kopyası
/srv/karahanli/data/catalog      canlı products.json ve son 30 snapshot
/srv/karahanli/data/media        yönetim panelinden yüklenen görseller
/srv/karahanli/secrets           Firebase servis hesabı
/srv/karahanli/.env              çalışma zamanı ayarları
```

Gerçek kurulum başka bir kök kullanıyorsa `KARAHANLI_BASE_DIR` ile değiştirilir. Veri, medya, secret ve `.env` Git'e eklenmez.

## Firebase kurulumu

1. Firebase Console'da Spark planında bir proje oluşturun.
2. Authentication > Sign-in method altında Email/Password yöntemini açın.
3. Firestore Standard veritabanını uygun Avrupa bölgesinde oluşturun.
4. Web App config değerlerini sunucudaki `.env` dosyasına yazın:

```dotenv
FIREBASE_WEB_API_KEY=
FIREBASE_AUTH_DOMAIN=
FIREBASE_PROJECT_ID=
FIREBASE_WEB_APP_ID=
```

Bu web değerleri tarayıcıda görünür ve servis hesabı sırrı değildir; yine de ortama özel ayar olarak Git dışında tutulur.

5. Project Settings > Service accounts üzerinden admin API için JSON anahtarını indirin ve yalnızca sunucuda `/srv/karahanli/secrets/firebase-service-account.json` olarak, `chmod 600` ile saklayın.
6. Admin kullanıcılarını Authentication ekranında oluşturun ve `firebase/set-admin-claim.mjs` ile `admin: true` custom claim verin.
7. `firestore.rules` ve `firestore.indexes.json` dosyalarını Firebase CLI ile yayınlayın.

Firestore istemci kuralları doğrudan katalog okuma/yazmasını kapatır. Yetkili yazma işlemleri, ID token'ı doğrulayan admin API üzerinden geçer.

## Çalışma zamanı ayarları

Sunucu `.env` örneği:

```dotenv
KARAHANLI_BASE_DIR=/srv/karahanli
KARAHANLI_SECRET_GID=3100
CATALOG_PATH=/srv/karahanli/data/catalog/products.json
SITE_URL=https://karahanligida.com
ADMIN_API_ORIGIN=https://api.karahanligida.com
WHATSAPP_NUMBER=
FIREBASE_WEB_API_KEY=
FIREBASE_AUTH_DOMAIN=
FIREBASE_PROJECT_ID=
FIREBASE_WEB_APP_ID=
FIREBASE_SERVICE_ACCOUNT_FILE=/srv/karahanli/secrets/firebase-service-account.json
```

WhatsApp numarası ülke koduyla ve yalnızca rakam olarak yazılır. Fiyat, ödeme veya müşteri bilgisi Firestore'a kaydedilmez.

## Docker ve Caddy

İlk hazırlık:

```bash
KARAHANLI_BASE_DIR=/srv/karahanli sh deploy/linux/prepare.sh
docker compose --env-file /srv/karahanli/.env build web
docker compose --env-file /srv/karahanli/.env up -d web
curl --fail http://127.0.0.1:3000/api/health
```

Firebase servis hesabı henüz yoksa yalnızca `web` servisi başlatılır. Admin API hazır olduğunda:

```bash
docker compose --profile admin --env-file /srv/karahanli/.env build admin-api
docker compose --profile admin --env-file /srv/karahanli/.env up -d admin-api
curl -i http://127.0.0.1:3100/health
```

Caddy yönlendirmeleri:

- `api.karahanligida.com/api/admin/*` -> `127.0.0.1:3100`
- `/media/*` -> kalıcı medya dizini
- `/assets/*` -> ürün varlıkları
- diğer bütün yollar -> `127.0.0.1:3000`

Public `/api/catalog` ve `/api/health` rotaları Next.js ile birlikte
`karahanligida.com` üzerinde kalır. `127.0.0.1` adresleri yalnız Linux
sunucunun kendi içindeki Caddy-Docker bağlantılarıdır ve ziyaretçiye gönderilmez.

`deploy/linux/Caddyfile.example` örneği kullanılmadan önce gerçek dizinlerle uyarlanmalı, `caddy validate` çalıştırılmalı ve mevcut Caddy dosyası yedeklenmelidir.

## Yayınlama ve geri alma

Admin panelindeki “Yayınla” işlemi Firestore belgesini günceller, yeni `products.json` dosyasını geçici konumda doğrular ve atomik olarak canlı konuma taşır. Artık ürün başına HTML üretmez. Son 30 snapshot korunur.

Next.js imajı güncellenirken önce localhost healthcheck yapılır. Sonra Caddy trafiği yeni servise aktarılır. Smoke test başarısız olursa Caddy önceki yapılandırmasına döndürülür; katalog ve medya volume'larına dokunulmaz.

Yedek:

```bash
KARAHANLI_BASE_DIR=/srv/karahanli sh deploy/linux/backup.sh
```

Container yeniden oluşturulsa bile `data/catalog`, `data/media`, `secrets` ve `.env` bind mount/disk üzerinde kalır.
