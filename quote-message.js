(function (global) {
  function buildQuoteMessage(items, productUrl) {
    const lines = [
      "Merhaba, aşağıdaki ürünler için teklif rica ediyorum:",
      "",
    ];
    items.forEach((item, index) => {
      lines.push(`${index + 1}. ${item.brand} — ${item.name}`);
      lines.push(`   Varyant / Model: ${item.variantName}`);
      if (item.variantCode) lines.push(`   Ürün kodu: ${item.variantCode}`);
      lines.push(`   Adet: ${item.quantity}`);
      lines.push(`   Ürün sayfası: ${productUrl(item)}`);
      lines.push("");
    });
    lines.push("Uygunluk ve teslimat bilgilerini paylaşabilir misiniz?");
    return lines.join("\n");
  }

  global.KarahanliQuoteMessage = { buildQuoteMessage };
})(typeof window === "undefined" ? globalThis : window);
