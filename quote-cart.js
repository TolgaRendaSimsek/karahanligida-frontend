(function () {
  const catalog = window.KarahanliCatalog;
  const config = window.KARAHANLI_CONFIG || {};
  const drawer = document.getElementById("cartDrawer");
  const overlay = document.getElementById("overlay");
  const itemsRoot = document.getElementById("cartItems");
  const count = document.getElementById("cartCount");
  const checkoutButton = document.getElementById("checkoutBtn");
  if (!catalog || !drawer || !itemsRoot) return;

  function showToast(message) {
    const toast = document.getElementById("toast");
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add("show");
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => toast.classList.remove("show"), 2200);
  }

  function save(cart) {
    localStorage.setItem(catalog.QUOTE_KEY, JSON.stringify(cart));
    document.dispatchEvent(new CustomEvent("karahanli:quote-changed", { detail: cart }));
  }

  function productUrl(item) {
    const configuredBase = String(config.siteUrl || "").replace(/\/$/, "");
    if (configuredBase) return `${configuredBase}/urunler/${item.slug}.html`;
    return new URL(`${catalog.ROOT_PREFIX}urunler/${item.slug}.html`, location.href).href;
  }

  function render() {
    const cart = catalog.getQuoteCart();
    if (count) count.textContent = cart.reduce((sum, item) => sum + item.quantity, 0);
    itemsRoot.innerHTML = cart.length
      ? cart.map((item) => `
        <article class="cart-item" data-key="${catalog.escapeHtml(item.key)}">
          <img class="cart-thumb" src="${catalog.escapeHtml(catalog.assetUrl(item.image))}" alt="">
          <div>
            <small>${catalog.escapeHtml(item.brand)}</small>
            <h4><a href="${catalog.escapeHtml(catalog.detailUrl(item.slug))}">${catalog.escapeHtml(item.name)}</a></h4>
            <p>${catalog.escapeHtml(item.variantName)}${item.variantCode ? ` · ${catalog.escapeHtml(item.variantCode)}` : ""}</p>
            <div class="quote-quantity">
              <button type="button" data-quantity="-1" aria-label="Adedi azalt">−</button>
              <strong>${item.quantity}</strong>
              <button type="button" data-quantity="1" aria-label="Adedi artır">＋</button>
            </div>
          </div>
          <button class="remove-item" type="button" data-remove aria-label="Ürünü kaldır">×</button>
        </article>`).join("")
      : '<div class="empty-cart"><strong>Teklif sepetiniz boş.</strong><p>Ürün ailesini ve varyant/modeli seçerek teklif listenizi oluşturabilirsiniz.</p><a class="btn btn-primary full" href="' + catalog.ROOT_PREFIX + 'products.html">Ürünleri İncele</a></div>';
    const summary = document.getElementById("quoteSummary");
    if (summary) summary.textContent = `${cart.length} ürün ailesi · ${cart.reduce((sum, item) => sum + item.quantity, 0)} adet`;
    if (checkoutButton) checkoutButton.disabled = cart.length === 0;
  }

  function open() {
    drawer.classList.add("open");
    overlay?.classList.add("open");
    drawer.setAttribute("aria-hidden", "false");
  }

  function close() {
    drawer.classList.remove("open");
    overlay?.classList.remove("open");
    drawer.setAttribute("aria-hidden", "true");
  }

  document.getElementById("cartBtn")?.addEventListener("click", open);
  document.getElementById("closeCart")?.addEventListener("click", close);
  overlay?.addEventListener("click", close);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") close();
  });
  document.addEventListener("karahanli:quote-changed", render);

  itemsRoot.addEventListener("click", (event) => {
    const itemRoot = event.target.closest("[data-key]");
    if (!itemRoot) return;
    const cart = catalog.getQuoteCart();
    const index = cart.findIndex((item) => item.key === itemRoot.dataset.key);
    if (index < 0) return;
    if (event.target.closest("[data-remove]")) cart.splice(index, 1);
    const quantityButton = event.target.closest("[data-quantity]");
    if (quantityButton) {
      cart[index].quantity += Number(quantityButton.dataset.quantity);
      if (cart[index].quantity < 1) cart.splice(index, 1);
    }
    save(cart);
  });

  checkoutButton?.addEventListener("click", () => {
    const cart = catalog.getQuoteCart();
    if (!cart.length) return;
    const number = String(config.whatsappNumber || "").replace(/\D/g, "");
    if (!number) {
      showToast("WhatsApp numarası config.js dosyasına henüz eklenmedi.");
      return;
    }
    const message = window.KarahanliQuoteMessage.buildQuoteMessage(cart, productUrl);
    window.open(`https://wa.me/${number}?text=${encodeURIComponent(message)}`, "_blank", "noopener");
  });

  window.KarahanliQuoteUI = {
    buildMessage: () => window.KarahanliQuoteMessage.buildQuoteMessage(catalog.getQuoteCart(), productUrl),
    close,
    open,
    render,
  };
  render();
})();
