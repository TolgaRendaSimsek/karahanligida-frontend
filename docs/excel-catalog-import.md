# Excel katalog aktarımı

`data/excel-catalog-import.json`, Excel dosyasının yalnızca A (ürün adı), bölüm ve B (anlamlı ambalaj) alanlarını içerir. Fiyat, stok ve C/D sütunları bilerek dışarıda bırakılmıştır.

## Yerel önizleme

```powershell
node tools/import_excel_catalog.mjs
```

Komut mevcut `data/products.json` dosyasını yedekler, Kroom ailelerini koruyup makine kategorilerini günceller, eşleşmeyen gıda ailelerini `data/catalog-archive.json` içine alır ve kaynağı/görseli doğrulanmamış 159 satırı `data/catalog-import-report.json` içinde taslak olarak listeler.

## Firestore aktarımı

Servis hesabı Git deposuna konulmadan aşağıdaki gibi çalıştırılır:

```powershell
$env:FIREBASE_PROJECT_ID = "karahanligida01"
$env:GOOGLE_APPLICATION_CREDENTIALS = "C:\path\to\firebase-service-account.json"
node firebase/import_excel.mjs
```

Komut `productFamilies`, `productDrafts`, `categories`, `brands`, `catalogImports` ve `auditLogs` koleksiyonlarını günceller. Taslaklar görsel ve resmî kaynak doğrulaması tamamlanana kadar public snapshot'a alınmaz. Admin API üzerinden aynı işlem `catalog/import/preview` ve `catalog/import/apply` uçlarıyla tekrar edilebilir.
