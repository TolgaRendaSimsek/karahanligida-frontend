# Karahanlı Gıda - Ücretsiz Firebase ve Linux Kurulum Rehberi

Bu mimaride Firebase Spark planı yalnızca Authentication ve Firestore için kullanılır. Ürün görselleri Firebase Storage'a gönderilmez; Caddy'nin sunduğu Linux diskinde tutulur. Ziyaretçiler Firestore'u doğrudan okumaz, admin API'nin ürettiği statik `products.json` dosyasını okur.

## Mimari

```text
Ziyaretçi -> Caddy -> statik site + products.json + /media
Admin -> Firebase Auth -> Caddy /api/admin -> Docker admin-api
admin-api -> Firestore + /srv/karahanli/data
```

Firestore koleksiyonları:

- `productFamilies`: yayımlanmış ürün aileleri
- `productDrafts`: admin taslakları
- `brands`, `categories`
- `auditLogs`: admin işlem kayıtları
- `catalogReleases`: yayın işlemlerinin durumu

Firestore istemci kuralları bütün doğrudan okuma ve yazmaları kapatır. Linux API, Firebase Admin SDK ile çalıştığı için bu kuralları kullanmaz.

## 1. Firebase projesini oluşturma

1. Firebase Console'dan yeni bir proje oluşturun. Blaze'e geçmeyin ve ödeme hesabı bağlamayın.
2. Project Settings > Your apps bölümünden Web App oluşturun.
3. Web App config değerlerini projenin `firebase-config.js` dosyasına yazın. Bu değerler web istemcisi tarafından görülür; servis hesabı anahtarı değildir.
4. Build > Authentication > Sign-in method bölümünden Email/Password girişini açın.
5. Build > Firestore Database bölümünden tek bir Standard veritabanı oluşturun. Avrupa bölgesi seçin.
6. Authentication > Users bölümünden admin hesaplarını oluşturun.

`firebase-config.js` örneği:

```js
window.KARAHANLI_FIREBASE_CONFIG = {
  apiKey: "firebase-web-api-key",
  authDomain: "proje-id.firebaseapp.com",
  projectId: "proje-id",
  appId: "firebase-web-app-id",
};
```

## 2. Firebase CLI ve ilk veriyi yükleme

Bilgisayarınızda Firebase CLI ile giriş yapın:

```bash
npm install -g firebase-tools
firebase login
cp .firebaserc.example .firebaserc
```

`.firebaserc` içindeki proje kimliğini Firebase Console'daki gerçek `projectId` ile değiştirin. Ardından kuralları yayınlayın:

```bash
firebase deploy --only firestore:rules,firestore:indexes
```

Project Settings > Service accounts bölümünden Linux API için yeni bir özel anahtar üretin. Bu JSON dosyasını Git deposuna koymayın.

Yerel seed işlemi için:

```bash
cd firebase
npm install
export FIREBASE_PROJECT_ID="gercek-proje-id"
export GOOGLE_APPLICATION_CREDENTIALS="/guvenli/yol/firebase-service-account.json"
npm run seed
```

Seed işlemi 230 ürün ailesini, marka ve kategorileri Firestore'a yazar. Tekrar çalıştırılabilir; mevcut belgeleri aynı kimlikle günceller.

## 3. Admin yetkileri

Authentication ekranında oluşturduğunuz her admin hesabına custom claim verin:

```bash
cd firebase
export FIREBASE_PROJECT_ID="gercek-proje-id"
export GOOGLE_APPLICATION_CREDENTIALS="/guvenli/yol/firebase-service-account.json"
npm run set-admin -- admin@alanadi.com
```

Kullanıcı claim verildikten sonra çıkış yapıp tekrar giriş yapmalıdır. Admin paneli hem Firebase ID tokenini hem `admin: true` claim'ini kontrol eder. Admin olmayan hesap API'den `403` alır.

## 4. Linux dizinleri ve ilk snapshot

Önerilen sunucu düzeni:

```text
/srv/karahanli/app/current             Git kaynak kodu; web üzerinden sunulmaz
/srv/karahanli/public/current          yalnızca yayımlanabilir frontend dosyaları
/srv/karahanli/data/media              admin görselleri
/srv/karahanli/data/catalog            products.json
/srv/karahanli/data/catalog/releases   son 30 başarılı katalog snapshot'ı
/srv/karahanli/data/generated/urunler  üretilen detay sayfaları
/srv/karahanli/secrets                 servis hesabı
/srv/karahanli/backups                 30 günlük yerel yedek
```

Projeyi `/srv/karahanli/app/current` altına aldıktan sonra:

```bash
cd /srv/karahanli/app/current
sudo sh deploy/linux/prepare.sh /srv/karahanli/app/current
sudo cp /guvenli/kaynak/firebase-service-account.json /srv/karahanli/secrets/
sudo chmod 600 /srv/karahanli/secrets/firebase-service-account.json
sudo cp .env.example /srv/karahanli/.env
sudo chmod 600 /srv/karahanli/.env
```

`/srv/karahanli/.env` içindeki `FIREBASE_PROJECT_ID`, `ADMIN_ORIGIN` ve servis hesabı yolunu gerçek değerlerle değiştirin. `.env`, servis hesabı, Git deposu ve API kaynak kodları hiçbir zaman Caddy web kökünde bulunmaz.

## 5. Docker admin API

```bash
cd /srv/karahanli
docker compose -f app/current/docker-compose.yml --env-file .env build admin-api
docker compose -f app/current/docker-compose.yml --env-file .env up -d admin-api
docker compose -f app/current/docker-compose.yml --env-file .env ps
curl http://127.0.0.1:3100/health
```

API host üzerinde yalnızca `127.0.0.1:3100` adresine açılır. Dış dünya API'ye Caddy üzerinden ve HTTPS ile ulaşır.

Kalıcı dizinler bind mount olduğu için container silinse veya yeniden oluşturulsa bile görseller ve katalog snapshot'ı korunur.

## 6. Caddy

`deploy/linux/Caddyfile.example` içindeki alan adını kendi Caddyfile dosyanıza uyarlayın. Caddy yalnızca `public/current` dizinini sunar; `app/current`, `.git`, `.env`, backend kaynakları ve servis hesabı web kökü dışındadır:

```caddyfile
@adminApi path /api/admin/*
handle @adminApi {
  reverse_proxy 127.0.0.1:3100
}
```

Örnek ayrıca şu yolları tanımlar:

- `/media/*` -> Linux medya dizini
- `/data/products.json` -> güncel katalog snapshot'ı
- `/urunler/*` -> admin API tarafından üretilen detay HTML'leri
- diğer yollar -> statik frontend

Caddyfile değişikliğinden sonra:

```bash
caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

## 7. Admin yayın akışı

1. Admin `admin.html` üzerinden Firebase hesabıyla giriş yapar.
2. Ürünü düzenler ve görselleri seçer.
3. Görseller API tarafından doğrulanır, WebP tam/küçük sürüme dönüştürülür ve Linux diske yazılır.
4. “Taslağı Kaydet” veriyi `productDrafts` koleksiyonuna yazar.
5. “Yayınla” taslağı `productFamilies` koleksiyonuna taşır.
6. API yeni `products.json` ve ürün HTML sayfasını atomik olarak oluşturur.
7. İşlem `auditLogs` ve `catalogReleases` koleksiyonlarına kaydedilir.

İki admin aynı revizyonu düzenlerse ikinci kayıt `409 revision-conflict` alır ve ilk adminin değişikliği ezilmez.
Dosya üretimi tamamlanamazsa yayımlanmış Firestore belgesi geri alınır, taslak korunur ve sürüm `retry-required` durumuna geçer. Başarılı kataloglardan son 30 JSON snapshot'ı `data/catalog/releases` altında tutulur. Artık bir üründe kullanılmayan admin görselleri fiziksel olarak silinmez; `data/media/.trash` altına taşınır.

## 8. Yedekleme

Elle yedek almak için:

```bash
sudo sh /srv/karahanli/app/current/deploy/linux/backup.sh
```

Günlük çalıştırmak için root cron örneği:

```cron
20 3 * * * /bin/sh /srv/karahanli/app/current/deploy/linux/backup.sh
```

Betik medya, katalog ve üretilmiş sayfaları arşivler; 30 günden eski kendi arşivlerini siler. Kritik kullanımda ayrıca sunucu dışı yedek önerilir.

## Ücretsiz plan sınırları

- Firebase Storage, Firebase Hosting ve Cloud Functions kullanılmaz.
- Firestore ücretsiz kotası yalnızca seed ve admin işlemlerinde tüketilir.
- Ziyaretçi trafiği Linux/Caddy üzerinden hizmet alır.
- Spark kotası aşılırsa Firebase hizmeti dönem sonuna kadar durabilir; otomatik ücret oluşmaz.
- WhatsApp mesajı ve müşteri verileri Firestore'a kaydedilmez.
