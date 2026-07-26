# Karahanlı Gıda Firebase Geçiş Rehberi

Bu depo şu anda `data/products.json` dosyasını kullanır. Firebase dosyaları, yerel katalog onaylandıktan sonra aynı veri modelini Firestore'a taşımak için hazırlandı. Canlı bir Firebase projesine bağlantı veya yayın yapılmadı.

## Neden Firestore?

Karahanlı Gıda kataloğu belge temelli bir yapıya uygundur: bir ürün ailesinin altında varyantlar, görseller ve teknik bilgiler bulunur. Firestore bu iç içe yapıyı doğal şekilde karşılar. Authentication admin girişini, Storage görselleri, Security Rules ise ziyaretçi ve admin yetkilerini yönetir.

## Koleksiyon yapısı

```text
brands/{brandId}
categories/{categoryId}
productFamilies/{familyId}
  variants/{variantId}
  images/{imageId}
  specs/{specId}
```

`productFamilies` belgesi ürün adı, slug, marka, kategori, açıklama, öne çıkan bilgisi, kaynak ve `status` alanlarını taşır. Fiyat alanı yoktur. Ziyaretçiler yalnızca `status: "published"` olan aileleri okuyabilir. Yazma işlemleri Firebase Authentication kullanıcısında `admin: true` custom claim'i varsa açılır.

## İlk kurulum

1. Firebase Console'da yeni proje açın ve Web App ekleyin.
2. Firestore Database, Authentication (Email/Password) ve Storage'ı etkinleştirin.
3. Bilgisayarınızda Firebase CLI ile giriş yapın: `firebase login`.
4. `.firebaserc.example` dosyasını `.firebaserc` adıyla kopyalayın ve proje kimliğini değiştirin.
5. `firebase` klasöründe `npm install` çalıştırın.
6. Google Application Default Credentials veya güvenli bir servis hesabı ile `npm run seed` çalıştırın.
7. Admin kullanıcısını Authentication ekranında oluşturun, sonra `npm run set-admin -- admin@alanadi.com` çalıştırın.
8. Kuralları önce Emulator Suite'te test edin; onaydan sonra `firebase deploy --only firestore:rules,firestore:indexes,storage` komutunu kullanın.

Servis hesabı JSON dosyasını depoya koymayın. Bu dosya `.gitignore` kapsamındadır.

## Görseller

İlk sürümde optimize WebP dosyaları statik `assets/products` klasöründen gelir. Firebase aşamasında dosyalar `product-images/{familyId}/` yoluna yüklenir ve ürün belgesindeki görsel URL'leri Storage indirme URL'leriyle güncellenir. Storage'a yalnızca admin yazabilir; 10 MB üzeri veya görsel olmayan dosyalar reddedilir.

## Yerel geliştirme

`firebase emulators:start` komutu Auth, Firestore, Storage ve Hosting emülatörlerini açar. Emulator UI varsayılan olarak `http://127.0.0.1:4000` adresindedir. Gerçek Firebase projesine veri yazmadan önce seed ve admin akışını burada test edin.

## Maliyet ve güvenlik notları

- Katalog listelemesinde sayfalama kullanın; her açılışta bütün alt koleksiyonları okumayın.
- Arama için ilk aşamada istemci tarafındaki normalize arama terimleri yeterlidir. Tam metin arama büyürse ayrı bir arama hizmeti değerlendirilir.
- App Check, canlıya geçmeden önce web istemcisi için etkinleştirilebilir.
- Bütçe uyarısı tanımlayın.
- WhatsApp mesajları ve müşteri bilgileri ilk sürümde Firestore'a yazılmaz.

## Geçiş sırası

1. Yerel JSON kataloğunu içerik ve görsel açısından onaylayın.
2. Emulator üzerinde seed verisini ve Security Rules davranışını test edin.
3. Admin girişini Firebase Authentication'a bağlayın.
4. Görselleri Storage'a taşıyın.
5. Site veri sağlayıcısını `products.json` yerine Firestore sorgusuna çevirin.
6. Son olarak Firebase Hosting veya mevcut hosting üzerinde yayınlayın.
