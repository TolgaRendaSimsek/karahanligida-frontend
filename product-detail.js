const catalog = window.KarahanliCatalog;
const slug = document.body.dataset.productSlug;
const root = document.getElementById("productDetail");
const toast = document.getElementById("toast");

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove("show"), 1800);
}

catalog.loadProducts().then((products) => {
  const product = products.find((item) => item.slug === slug);
  if (!product) throw new Error("Bu ürün ailesi bulunamadı.");
  document.title = `${product.name} | ${product.brand} | Karahanlı Gıda`;

  const gallery = product.images || [];
  const hero = gallery[0];
  const variants = product.variants
    .map(
      (variant) =>
        `<option value="${catalog.escapeHtml(variant.id)}">${catalog.escapeHtml(variant.name)}${variant.code ? ` · ${catalog.escapeHtml(variant.code)}` : ""}</option>`,
    )
    .join("");
  const features = product.features.length
    ? `<ul class="feature-list">${product.features.map((feature) => `<li>${catalog.escapeHtml(feature)}</li>`).join("")}</ul>`
    : "<p>Katalogda bu aile için ayrıca özellik metni belirtilmemiştir.</p>";
  const specifications = Object.entries(product.specifications).length
    ? `<div class="spec-list">${Object.entries(product.specifications)
        .map(([label, value]) => `<div class="spec-row"><span>${catalog.escapeHtml(label)}</span><strong>${catalog.escapeHtml(value)}</strong></div>`)
        .join("")}</div>`
    : "<p>Teknik bilgiler seçilen modele göre teklif aşamasında netleştirilir.</p>";

  root.innerHTML = `
    <div class="breadcrumbs"><a href="../index.html">Ana Sayfa</a> / <a href="../products.html">Ürünler</a> / ${catalog.escapeHtml(product.brand)} / ${catalog.escapeHtml(product.name)}</div>
    <div class="detail-grid">
      <div class="detail-gallery" id="detailGallery">
        <div class="detail-gallery-stage">
          <img id="detailGalleryImage" src="${catalog.escapeHtml(catalog.assetUrl(hero.src))}" alt="${catalog.escapeHtml(hero.alt)}">
          ${
            gallery.length > 1
              ? `<button class="detail-gallery-arrow prev" type="button" data-detail-direction="-1" aria-label="Önceki görsel">‹</button>
                 <button class="detail-gallery-arrow next" type="button" data-detail-direction="1" aria-label="Sonraki görsel">›</button>
                 <span class="detail-gallery-count" id="detailGalleryCount">1/${gallery.length}</span>`
              : ""
          }
        </div>
        ${
          gallery.length > 1
            ? `<div class="detail-thumbnails" aria-label="Ürün görselleri">${gallery
                .map(
                  (image, index) =>
                    `<button type="button" class="${index === 0 ? "active" : ""}" data-detail-index="${index}" aria-label="${index + 1}. görseli göster">
                      <img src="${catalog.escapeHtml(catalog.assetUrl(catalog.imageSource(image, true)))}" alt="" loading="lazy">
                    </button>`,
                )
                .join("")}</div>`
            : ""
        }
      </div>
      <div class="detail-copy">
        <p class="eyebrow dark">${catalog.escapeHtml(product.brand)} · ${catalog.escapeHtml(product.subcategory)}</p>
        <h1>${catalog.escapeHtml(product.name)}</h1>
        <p class="detail-summary">${catalog.escapeHtml(product.summary)}</p>
        <p class="detail-description">${catalog.escapeHtml(product.description)}</p>
        <div class="detail-purchase">
          <label>Varyant / model<select id="variantSelect">${variants}</select></label>
          <div class="quantity-row">
            <input id="quantityInput" type="number" min="1" max="99" value="1" aria-label="Adet">
            <button class="btn btn-primary" id="addQuoteButton" type="button">Teklif Sepetine Ekle</button>
          </div>
        </div>
        <p class="source-note">Kaynak: ${catalog.escapeHtml(product.source.catalog)}, sayfa ${product.source.pages.join(", ")}. Fiyat bilgisi için teklif isteyiniz.</p>
      </div>
    </div>
    <div class="detail-sections">
      <section class="detail-panel"><h2>Öne çıkan özellikler</h2>${features}</section>
      <section class="detail-panel"><h2>Teknik bilgiler</h2>${specifications}</section>
    </div>
    <section class="related-section">
      <div class="section-heading"><div><p class="eyebrow dark">BENZER ÜRÜNLER</p><h2>Aynı kategoriden</h2></div><a href="../products.html?category=${encodeURIComponent(product.category)}">Tümünü Gör →</a></div>
      <div class="product-grid" id="relatedGrid"></div>
    </section>`;

  document.getElementById("addQuoteButton").addEventListener("click", () => {
    catalog.addToQuote(
      product,
      document.getElementById("variantSelect").value,
      document.getElementById("quantityInput").value,
    );
    showToast("Ürün teklif sepetine eklendi.");
  });
  let galleryIndex = 0;
  const galleryRoot = document.getElementById("detailGallery");
  const galleryImage = document.getElementById("detailGalleryImage");
  const showGalleryImage = (index) => {
    galleryIndex = (index + gallery.length) % gallery.length;
    galleryImage.src = catalog.assetUrl(gallery[galleryIndex].src);
    galleryImage.alt = gallery[galleryIndex].alt;
    const counter = document.getElementById("detailGalleryCount");
    if (counter) counter.textContent = `${galleryIndex + 1}/${gallery.length}`;
    galleryRoot.querySelectorAll("[data-detail-index]").forEach((button) => {
      button.classList.toggle("active", Number(button.dataset.detailIndex) === galleryIndex);
    });
  };
  galleryRoot.addEventListener("click", (event) => {
    const arrow = event.target.closest("[data-detail-direction]");
    const thumb = event.target.closest("[data-detail-index]");
    if (arrow) showGalleryImage(galleryIndex + Number(arrow.dataset.detailDirection));
    if (thumb) showGalleryImage(Number(thumb.dataset.detailIndex));
  });
  galleryRoot.tabIndex = 0;
  galleryRoot.addEventListener("keydown", (event) => {
    if (event.key === "ArrowLeft") showGalleryImage(galleryIndex - 1);
    if (event.key === "ArrowRight") showGalleryImage(galleryIndex + 1);
  });
  let touchStartX = 0;
  galleryRoot.addEventListener(
    "touchstart",
    (event) => {
      touchStartX = event.changedTouches[0].clientX;
    },
    { passive: true },
  );
  galleryRoot.addEventListener(
    "touchend",
    (event) => {
      const distance = event.changedTouches[0].clientX - touchStartX;
      if (Math.abs(distance) > 45) showGalleryImage(galleryIndex + (distance < 0 ? 1 : -1));
    },
    { passive: true },
  );
  document.getElementById("variantSelect").addEventListener("change", (event) => {
    const variant = product.variants.find((item) => item.id === event.target.value);
    const imageIndex = gallery.findIndex(
      (image) => image.id === variant?.imageId || image.variantIds?.includes(variant?.id),
    );
    if (imageIndex >= 0) showGalleryImage(imageIndex);
  });
  const related = products
    .filter((item) => item.id !== product.id && item.category === product.category)
    .slice(0, 4);
  const relatedGrid = document.getElementById("relatedGrid");
  relatedGrid.innerHTML = related.map((item) => catalog.cardMarkup(item)).join("");
  catalog.bindCardActions(relatedGrid, products, showToast);
}).catch((error) => {
  root.innerHTML = `<p class="error-state">${catalog.escapeHtml(error.message)} <a href="../products.html">Kataloğa dönün.</a></p>`;
});
