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
    if (!path || /^(?:https?:)?\/\//.test(path) || path.startsWith("/")) return path;
    return `${ROOT_PREFIX}${path}`;
  }

  function imageSource(image, thumbnail = false) {
    if (!image) return "";
    return thumbnail ? image.thumbnailSrc || image.src : image.src;
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
        image: imageSource(product.images[0], true),
        quantity: Math.max(1, Number(quantity) || 1),
      });
    }
    localStorage.setItem(QUOTE_KEY, JSON.stringify(cart));
    document.dispatchEvent(new CustomEvent("karahanli:quote-changed", { detail: cart }));
    return cart;
  }

  function cardMarkup(product, options = {}) {
    const favorites = getFavorites();
    const gallery = product.images || [];
    const thumbnail = imageSource(gallery[0], true);
    const firstVariant = product.variants[0];
    return `
      <article class="product-card catalog-card" data-id="${escapeHtml(product.id)}">
        <div class="product-image has-image card-gallery" data-gallery-index="0">
          <img class="card-gallery-image" src="${escapeHtml(assetUrl(thumbnail))}"
            alt="${escapeHtml(gallery[0]?.alt || `${product.brand} ${product.name}`)}" loading="lazy">
          <span class="badge">${escapeHtml(product.brand)}</span>
          <button class="favorite-btn ${favorites.includes(product.id) ? "active" : ""}" type="button"
            data-favorite="${escapeHtml(product.id)}" aria-label="Favorilere ekle">♥</button>
          ${
            gallery.length > 1
              ? `<button class="card-gallery-arrow prev" type="button" data-gallery-direction="-1" aria-label="Önceki görsel">‹</button>
                 <button class="card-gallery-arrow next" type="button" data-gallery-direction="1" aria-label="Sonraki görsel">›</button>
                 <span class="card-gallery-count">1/${gallery.length}</span>`
              : ""
          }
          <script type="application/json" class="card-gallery-data">${JSON.stringify(
            gallery.map((image) => ({
              src: assetUrl(imageSource(image, true)),
              alt: image.alt || `${product.brand} ${product.name}`,
            })),
          ).replace(/</g, "\\u003c")}</script>
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
      const galleryButton = event.target.closest("[data-gallery-direction]");
      if (galleryButton) {
        event.preventDefault();
        event.stopPropagation();
        const gallery = galleryButton.closest(".card-gallery");
        const data = JSON.parse(gallery.querySelector(".card-gallery-data").textContent);
        const nextIndex =
          (Number(gallery.dataset.galleryIndex) + Number(galleryButton.dataset.galleryDirection) + data.length) %
          data.length;
        gallery.dataset.galleryIndex = String(nextIndex);
        const image = gallery.querySelector(".card-gallery-image");
        image.src = data[nextIndex].src;
        image.alt = data[nextIndex].alt;
        gallery.querySelector(".card-gallery-count").textContent = `${nextIndex + 1}/${data.length}`;
        return;
      }
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
    imageSource,
    loadProducts,
    normalize,
    toggleFavorite,
  };
})();
