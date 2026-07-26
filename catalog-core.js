(function () {
  const ROOT_PREFIX = window.location.pathname.includes("/urunler/") ? "../" : "";
  const FAVORITES_KEY = "karahanliFavoritesV2";
  const QUOTE_KEY = "karahanliQuoteCartV2";
  let productPromise;

  const escapeHtml = (value) =>
    String(value ?? "").replace(
      /[&<>'"]/g,
      (character) =>
        ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[
          character
        ],
    );

  const normalize = (value) =>
    String(value ?? "")
      .toLocaleLowerCase("tr-TR")
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "");

  async function loadProducts() {
    if (!productPromise) {
      productPromise = fetch(`${ROOT_PREFIX}data/products.json?v=20260726`)
        .then((response) => {
          if (!response.ok) throw new Error("Ürün kataloğu yüklenemedi.");
          return response.json();
        })
        .then((payload) => payload.products.filter((product) => product.status === "published"));
    }
    return productPromise;
  }

  function assetUrl(path) {
    if (!path || /^https?:\/\//.test(path)) return path;
    return `${ROOT_PREFIX}${path}`;
  }

  function detailUrl(slug) {
    return `${ROOT_PREFIX}urunler/${slug}.html`;
  }

  function loadIds(key) {
    try {
      const value = JSON.parse(localStorage.getItem(key));
      return Array.isArray(value) ? value.filter((item) => typeof item === "string") : [];
    } catch {
      return [];
    }
  }

  function getFavorites() {
    return loadIds(FAVORITES_KEY);
  }

  function toggleFavorite(id) {
    const favorites = getFavorites();
    const index = favorites.indexOf(id);
    if (index >= 0) favorites.splice(index, 1);
    else favorites.push(id);
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites));
    document.dispatchEvent(new CustomEvent("karahanli:favorites-changed", { detail: favorites }));
    return favorites.includes(id);
  }

  function getQuoteCart() {
    try {
      const value = JSON.parse(localStorage.getItem(QUOTE_KEY));
      return Array.isArray(value) ? value : [];
    } catch {
      return [];
    }
  }

  function addToQuote(product, variantId, quantity = 1) {
    const variant = product.variants.find((item) => item.id === variantId) || product.variants[0];
    const cart = getQuoteCart();
    const key = `${product.id}:${variant.id}`;
    const existing = cart.find((item) => item.key === key);
    if (existing) existing.quantity += Math.max(1, Number(quantity) || 1);
    else {
      cart.push({
        key,
        productId: product.id,
        slug: product.slug,
        brand: product.brand,
        name: product.name,
        variantId: variant.id,
        variantName: variant.name,
        variantCode: variant.code || "",
        image: product.images.find((image) => image.role === "thumbnail")?.src || product.images[0]?.src || "",
        quantity: Math.max(1, Number(quantity) || 1),
      });
    }
    localStorage.setItem(QUOTE_KEY, JSON.stringify(cart));
    document.dispatchEvent(new CustomEvent("karahanli:quote-changed", { detail: cart }));
    return cart;
  }

  function cardMarkup(product, options = {}) {
    const favorites = getFavorites();
    const thumbnail =
      product.images.find((image) => image.role === "thumbnail")?.src || product.images[0]?.src;
    const firstVariant = product.variants[0];
    return `
      <article class="product-card catalog-card" data-id="${escapeHtml(product.id)}">
        <div class="product-image has-image" style="background-image:url('${escapeHtml(assetUrl(thumbnail))}')">
          <span class="badge">${escapeHtml(product.brand)}</span>
          <button class="favorite-btn ${favorites.includes(product.id) ? "active" : ""}" type="button"
            data-favorite="${escapeHtml(product.id)}" aria-label="Favorilere ekle">♥</button>
        </div>
        <div class="product-info">
          <span class="product-brand">${escapeHtml(product.category)} · ${escapeHtml(product.subcategory)}</span>
          <h3><a href="${escapeHtml(detailUrl(product.slug))}">${escapeHtml(product.name)}</a></h3>
          <p class="product-summary">${escapeHtml(product.summary)}</p>
          <div class="catalog-card-footer">
            <span>${product.variants.length} seçenek/model</span>
            <div>
              <a class="catalog-detail-link" href="${escapeHtml(detailUrl(product.slug))}">İncele</a>
              ${
                options.hideQuote
                  ? ""
                  : `<button class="add-cart" type="button" data-add-quote="${escapeHtml(product.id)}"
                      data-variant="${escapeHtml(firstVariant.id)}" aria-label="Teklif sepetine ekle">＋</button>`
              }
            </div>
          </div>
        </div>
      </article>`;
  }

  function bindCardActions(container, products, onUpdate) {
    container.addEventListener("click", (event) => {
      const favorite = event.target.closest("[data-favorite]");
      if (favorite) {
        event.preventDefault();
        favorite.classList.toggle("active", toggleFavorite(favorite.dataset.favorite));
        onUpdate?.("Favoriler güncellendi.");
        return;
      }
      const quoteButton = event.target.closest("[data-add-quote]");
      if (quoteButton) {
        const product = products.find((item) => item.id === quoteButton.dataset.addQuote);
        if (product) {
          addToQuote(product, quoteButton.dataset.variant, 1);
          onUpdate?.("Ürün teklif sepetine eklendi.");
        }
      }
    });
  }

  localStorage.removeItem("karahanliCart");
  localStorage.removeItem("roasteryProducts");

  window.KarahanliCatalog = {
    ROOT_PREFIX,
    FAVORITES_KEY,
    QUOTE_KEY,
    addToQuote,
    assetUrl,
    bindCardActions,
    cardMarkup,
    detailUrl,
    escapeHtml,
    getFavorites,
    getQuoteCart,
    loadProducts,
    normalize,
    toggleFavorite,
  };
})();
