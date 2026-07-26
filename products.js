const catalog = window.KarahanliCatalog;
const grid = document.getElementById("catalogGrid");
const search = document.getElementById("catalogSearch");
const brandFilter = document.getElementById("brandFilter");
const categoryFilter = document.getElementById("categoryFilter");
const resultCount = document.getElementById("resultCount");
const loadMore = document.getElementById("loadMore");
const toast = document.getElementById("toast");
let products = [];
let visibleCount = 24;

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove("show"), 1800);
}

function searchText(product) {
  return catalog.normalize(
    [
      product.brand,
      product.name,
      product.category,
      product.subcategory,
      product.summary,
      ...product.variants.flatMap((variant) => [variant.name, variant.code]),
    ].join(" "),
  );
}

function filteredProducts() {
  const query = catalog.normalize(search.value);
  return products.filter(
    (product) =>
      (!brandFilter.value || product.brand === brandFilter.value) &&
      (!categoryFilter.value || product.category === categoryFilter.value) &&
      (!query || searchText(product).includes(query)),
  );
}

function syncUrl() {
  const params = new URLSearchParams();
  if (search.value) params.set("q", search.value);
  if (brandFilter.value) params.set("brand", brandFilter.value);
  if (categoryFilter.value) params.set("category", categoryFilter.value);
  history.replaceState(null, "", `${location.pathname}${params.size ? `?${params}` : ""}`);
}

function render() {
  const filtered = filteredProducts();
  const visible = filtered.slice(0, visibleCount);
  resultCount.textContent = `${filtered.length} ürün ailesi bulundu`;
  grid.innerHTML = visible.length
    ? visible.map((product) => catalog.cardMarkup(product)).join("")
    : '<p class="error-state">Aramanızla eşleşen ürün ailesi bulunamadı.</p>';
  loadMore.hidden = visible.length >= filtered.length;
  syncUrl();
}

catalog.loadProducts().then((loadedProducts) => {
  products = loadedProducts;
  [...new Set(products.map((product) => product.brand))]
    .sort((a, b) => a.localeCompare(b, "tr"))
    .forEach((brand) => brandFilter.add(new Option(brand, brand)));
  [...new Set(products.map((product) => product.category))]
    .sort((a, b) => a.localeCompare(b, "tr"))
    .forEach((category) => categoryFilter.add(new Option(category, category)));

  const params = new URLSearchParams(location.search);
  search.value = params.get("q") || "";
  brandFilter.value = params.get("brand") || "";
  categoryFilter.value = params.get("category") || "";
  render();
  catalog.bindCardActions(grid, products, showToast);
}).catch((error) => {
  grid.innerHTML = `<p class="error-state">${catalog.escapeHtml(error.message)}</p>`;
});

[search, brandFilter, categoryFilter].forEach((control) => {
  control.addEventListener(control === search ? "input" : "change", () => {
    visibleCount = 24;
    render();
  });
});

document.getElementById("clearFilters").addEventListener("click", () => {
  search.value = "";
  brandFilter.value = "";
  categoryFilter.value = "";
  visibleCount = 24;
  render();
});
loadMore.addEventListener("click", () => {
  visibleCount += 24;
  render();
});
document.getElementById("headerSearch").addEventListener("submit", (event) => {
  event.preventDefault();
  search.value = document.getElementById("headerSearchInput").value;
  visibleCount = 24;
  render();
  search.scrollIntoView({ behavior: "smooth", block: "center" });
});
document.getElementById("favoritesBtn").addEventListener("click", () => {
  location.href = "favorites.html";
});

function updateQuoteCount() {
  document.getElementById("cartCount").textContent = catalog
    .getQuoteCart()
    .reduce((sum, item) => sum + item.quantity, 0);
}
updateQuoteCount();
document.addEventListener("karahanli:quote-changed", updateQuoteCount);
document.getElementById("cartBtn").addEventListener("click", () => {
  showToast("Teklif sepeti ana sayfadaki panelden açılabilir.");
});
