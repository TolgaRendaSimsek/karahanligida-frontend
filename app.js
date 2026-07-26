const catalog = window.KarahanliCatalog;
const productGrid = document.getElementById("productGrid");
const toast = document.getElementById("toast");
let products = [];

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove("show"), 1800);
}

function renderFeatured(filter = "all") {
  const featured = products
    .filter((product) => product.featured && (filter === "all" || product.category === filter))
    .slice(0, 8);
  productGrid.innerHTML = featured.length
    ? featured.map((product) => catalog.cardMarkup(product)).join("")
    : '<p class="error-state">Bu grupta öne çıkan ürün bulunamadı. <a href="products.html">Tüm kataloğu inceleyin.</a></p>';
}

catalog.loadProducts().then((loadedProducts) => {
  products = loadedProducts;
  renderFeatured();
  catalog.bindCardActions(productGrid, products, showToast);
}).catch((error) => {
  productGrid.innerHTML = `<p class="error-state">${catalog.escapeHtml(error.message)}</p>`;
});

document.getElementById("productTabs").addEventListener("click", (event) => {
  const button = event.target.closest("button[data-filter]");
  if (!button) return;
  document.querySelectorAll("#productTabs button").forEach((item) => item.classList.remove("active"));
  button.classList.add("active");
  renderFeatured(button.dataset.filter);
});

document.getElementById("searchForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const query = document.getElementById("searchInput").value.trim();
  location.href = `products.html${query ? `?q=${encodeURIComponent(query)}` : ""}`;
});

document.querySelectorAll("[data-sub]").forEach((link) => {
  link.addEventListener("click", (event) => {
    event.preventDefault();
    location.href = `products.html?q=${encodeURIComponent(link.dataset.sub)}`;
  });
});

const allCategoriesButton = document.getElementById("allCategoriesBtn");
const megaMenu = document.getElementById("megaMenu");
allCategoriesButton.addEventListener("click", () => {
  const open = megaMenu.classList.toggle("open");
  allCategoriesButton.setAttribute("aria-expanded", String(open));
});
document.addEventListener("click", (event) => {
  if (!megaMenu.contains(event.target) && !allCategoriesButton.contains(event.target)) {
    megaMenu.classList.remove("open");
    allCategoriesButton.setAttribute("aria-expanded", "false");
  }
});
document.getElementById("mobileMenuBtn").addEventListener("click", () => {
  document.getElementById("categoryNav").classList.toggle("mobile-open");
});

const slides = [...document.querySelectorAll(".hero-slide")];
const dots = [...document.querySelectorAll("#sliderDots button")];
let activeSlide = 0;
function showSlide(index) {
  activeSlide = (index + slides.length) % slides.length;
  slides.forEach((slide, slideIndex) => slide.classList.toggle("active", slideIndex === activeSlide));
  dots.forEach((dot, dotIndex) => dot.classList.toggle("active", dotIndex === activeSlide));
}
document.getElementById("prevSlide").addEventListener("click", () => showSlide(activeSlide - 1));
document.getElementById("nextSlide").addEventListener("click", () => showSlide(activeSlide + 1));
dots.forEach((dot) => dot.addEventListener("click", () => showSlide(Number(dot.dataset.index))));

document.getElementById("favoritesBtn").addEventListener("click", () => {
  location.href = "favorites.html";
});
document.getElementById("accountBtn").addEventListener("click", () => {
  const user = localStorage.getItem("karahanliUser");
  location.href = user ? "account.html" : "register.html";
});

document.getElementById("newsletterForm").addEventListener("submit", (event) => {
  event.preventDefault();
  document.getElementById("newsletterMessage").textContent = "Teşekkürler. Kaydınız alındı.";
  event.currentTarget.reset();
});

function updateQuoteCount() {
  document.getElementById("cartCount").textContent = catalog
    .getQuoteCart()
    .reduce((sum, item) => sum + item.quantity, 0);
}
updateQuoteCount();
document.addEventListener("karahanli:quote-changed", updateQuoteCount);
