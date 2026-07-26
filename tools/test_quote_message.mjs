import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = await readFile(join(root, "quote-message.js"), "utf8");
const context = { globalThis: {} };
vm.createContext(context);
vm.runInContext(source, context);

const message = context.globalThis.KarahanliQuoteMessage.buildQuoteMessage(
  [{
    brand: "Kimbo",
    name: "Horeca Çekirdek Kahveler",
    variantName: "Model 14003",
    variantCode: "14003",
    quantity: 2,
    slug: "kimbo-horeca-cekirdek-kahveler",
  }],
  (item) => `https://karahanligida.example/urunler/${item.slug}.html`,
);

for (const forbidden of ["₺", "ara toplam", "birim fiyat", "tutar:", "price", "subtotal"]) {
  if (message.toLocaleLowerCase("tr-TR").includes(forbidden)) {
    throw new Error(`WhatsApp metninde yasaklı ifade bulundu: ${forbidden}`);
  }
}
for (const required of ["Kimbo", "14003", "Adet: 2", "Ürün sayfası:"]) {
  if (!message.includes(required)) throw new Error(`WhatsApp metninde eksik ifade: ${required}`);
}

console.log("OK: WhatsApp teklif metni ürün, varyant, kod, adet ve bağlantı içeriyor; ücret ifadesi içermiyor.");
