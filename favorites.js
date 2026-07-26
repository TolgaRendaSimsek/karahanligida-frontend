const catalog = window.KarahanliCatalog;
const grid = document.getElementById("favoritesGrid");
const emptyState = document.getElementById("favoritesEmpty");
const toast = document.getElementById("toast");
let products = [];

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove("show"), 1800);
}

function render() {
  const favoriteIds = catalog.getFavorites();
  const favorites = products.filter((product) => favoriteIds.includes(product.id));
  emptyState.hidden = favorites.length > 0;
  grid.hidden = favorites.length === 0;
  grid.innerHTML = favorites.map((product) => catalog.cardMarkup(product)).join("");
}

catalog.loadProducts().then((loadedProducts) => {
  products = loadedProducts;
  render();
  catalog.bindCardActions(grid, products, showToast);
}).catch((error) => {
  grid.innerHTML = `<p class="error-state">${catalog.escapeHtml(error.message)}</p>`;
});

document.addEventListener("karahanli:favorites-changed", render);
document.getElementById("searchForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const query = document.getElementById("searchInput").value.trim();
  location.href = `products.html${query ? `?q=${encodeURIComponent(query)}` : ""}`;
});
document.getElementById("favoritesBtn").addEventListener("click", () => {
  location.href = "favorites.html";
});
document.getElementById("accountBtn").addEventListener("click", () => {
  location.href = localStorage.getItem("karahanliUser") ? "account.html" : "register.html";
});
document.getElementById("mobileMenuBtn").addEventListener("click", () => {
  document.getElementById("categoryNav").classList.toggle("mobile-open");
});

function updateQuoteCount() {
  document.getElementById("cartCount").textContent = catalog
    .getQuoteCart()
    .reduce((sum, item) => sum + item.quantity, 0);
}
updateQuoteCount();
document.addEventListener("karahanli:quote-changed", updateQuoteCount);
