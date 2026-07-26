const DRAFT_KEY = "karahanliCatalogDraftV1";
const $ = (id) => document.getElementById(id);
const escapeHtml = (value) =>
  String(value ?? "").replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;",
  })[character]);
let basePayload;
let products = [];

function slugify(value) {
  return value
    .toLocaleLowerCase("tr-TR")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function loadDraft() {
  try {
    const draft = JSON.parse(localStorage.getItem(DRAFT_KEY));
    return Array.isArray(draft?.products) ? draft.products : null;
  } catch {
    return null;
  }
}

function saveDraft() {
  localStorage.setItem(
    DRAFT_KEY,
    JSON.stringify({ schemaVersion: 1, editedAt: new Date().toISOString(), products }),
  );
  render();
}

function showToast(message) {
  const toast = $("adminToast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove("show"), 1800);
}

function searchable(product) {
  return [
    product.name,
    product.brand,
    product.category,
    product.subcategory,
    ...product.variants.flatMap((variant) => [variant.name, variant.code]),
  ].join(" ").toLocaleLowerCase("tr-TR");
}

function render() {
  const query = $("adminSearch").value.toLocaleLowerCase("tr-TR");
  const category = $("categoryFilter").value;
  const filtered = products.filter(
    (product) =>
      (category === "all" || product.category === category) &&
      (!query || searchable(product).includes(query)),
  );
  $("productCount").textContent = `${products.length} ürün ailesi`;
  $("stats").innerHTML = `
    <article class="stat"><span>Ürün ailesi</span><strong>${products.length}</strong></article>
    <article class="stat"><span>Varyant/model</span><strong>${products.reduce((sum, product) => sum + product.variants.length, 0)}</strong></article>
    <article class="stat"><span>Marka</span><strong>${new Set(products.map((product) => product.brand)).size}</strong></article>
    <article class="stat"><span>Yerel taslak</span><strong>${localStorage.getItem(DRAFT_KEY) ? "Var" : "Yok"}</strong></article>`;
  $("productTable").innerHTML = filtered.length
    ? filtered.map((product) => `
      <tr>
        <td><div class="product-cell"><div class="thumb" style="background-image:url('${escapeHtml(product.images[1]?.src || product.images[0]?.src)}')"></div><div><strong>${escapeHtml(product.name)}</strong><small>${escapeHtml(product.brand)} · ${escapeHtml(product.slug)}</small></div></div></td>
        <td><span class="category-pill">${escapeHtml(product.category)}</span><br><small>${escapeHtml(product.subcategory)}</small></td>
        <td><strong>${product.variants.length}</strong></td>
        <td><span class="stock-pill ${product.status === "draft" ? "low" : ""}">${product.status === "published" ? "Yayında" : "Taslak"}</span></td>
        <td><small>${escapeHtml(product.source?.catalog || "Yerel taslak")} ${product.source?.pages?.length ? `s. ${product.source.pages.join(", ")}` : ""}</small></td>
        <td><div class="row-actions"><button class="icon-action" data-edit="${escapeHtml(product.id)}">Düzenle</button><button class="icon-action delete" data-delete="${escapeHtml(product.id)}">Sil</button></div></td>
      </tr>`).join("")
    : '<tr><td colspan="6" class="empty-row">Eşleşen ürün ailesi bulunamadı.</td></tr>';
}

function parseRows(value, mapper) {
  return value.split("\n").map((line) => line.trim()).filter(Boolean).map(mapper);
}

function openModal(product) {
  $("productForm").reset();
  $("productId").value = product?.id || "";
  $("modalTitle").textContent = product ? "Ürün Ailesini Düzenle" : "Yeni Ürün Ailesi";
  $("name").value = product?.name || "";
  $("slug").value = product?.slug || "";
  $("brand").value = product?.brand || "";
  $("category").value = product?.category || "";
  $("subcategory").value = product?.subcategory || "";
  $("status").value = product?.status || "draft";
  $("featured").checked = Boolean(product?.featured);
  $("summary").value = product?.summary || "";
  $("description").value = product?.description || "";
  $("features").value = (product?.features || []).join("\n");
  $("variants").value = (product?.variants || [])
    .map((variant) => `${variant.code || variant.id} | ${variant.name}`)
    .join("\n");
  $("specifications").value = Object.entries(product?.specifications || {})
    .map(([label, value]) => `${label} | ${value}`)
    .join("\n");
  $("image").value = product?.images?.[0]?.src || "";
  $("modalBackdrop").hidden = false;
  $("name").focus();
}

function closeModal() {
  $("modalBackdrop").hidden = true;
}

$("name").addEventListener("input", () => {
  if (!$("productId").value) $("slug").value = slugify($("name").value);
});
$("newProductBtn").addEventListener("click", () => openModal());
$("closeModal").addEventListener("click", closeModal);
$("cancelBtn").addEventListener("click", closeModal);
$("modalBackdrop").addEventListener("click", (event) => {
  if (event.target === $("modalBackdrop")) closeModal();
});

$("productForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const currentId = $("productId").value;
  const variants = parseRows($("variants").value, (line, index) => {
    const [code, ...nameParts] = line.split("|").map((part) => part.trim());
    return {
      id: slugify(code || `varyant-${index + 1}`),
      code: code || "",
      name: nameParts.join(" | ") || code,
      attributes: {},
    };
  });
  if (!variants.length) {
    showToast("En az bir varyant veya model ekleyin.");
    return;
  }
  const specifications = Object.fromEntries(
    parseRows($("specifications").value, (line) => {
      const [label, ...valueParts] = line.split("|").map((part) => part.trim());
      return [label, valueParts.join(" | ")];
    }).filter(([label, value]) => label && value),
  );
  const imagePath = $("image").value.trim();
  const previous = products.find((product) => product.id === currentId);
  const item = {
    id: currentId || `draft-${Date.now()}`,
    slug: $("slug").value.trim(),
    brand: $("brand").value.trim(),
    name: $("name").value.trim(),
    category: $("category").value.trim(),
    subcategory: $("subcategory").value.trim(),
    summary: $("summary").value.trim(),
    description: $("description").value.trim(),
    features: parseRows($("features").value, (line) => line),
    specifications,
    images: [
      { src: imagePath, role: "detail", alt: `${$("brand").value.trim()} ${$("name").value.trim()}` },
      { src: imagePath.replace(/hero\.webp$/, "thumb.webp"), role: "thumbnail", alt: `${$("brand").value.trim()} ${$("name").value.trim()}` },
    ],
    variants,
    source: previous?.source || { type: "local-draft", catalog: "", pages: [] },
    featured: $("featured").checked,
    status: $("status").value,
  };
  if (products.some((product) => product.slug === item.slug && product.id !== item.id)) {
    showToast("Bu slug başka bir ürün ailesinde kullanılıyor.");
    return;
  }
  if (currentId) products = products.map((product) => product.id === currentId ? item : product);
  else products.unshift(item);
  saveDraft();
  closeModal();
  showToast(currentId ? "Ürün ailesi güncellendi." : "Yeni ürün ailesi eklendi.");
});

$("productTable").addEventListener("click", (event) => {
  const edit = event.target.closest("[data-edit]");
  const remove = event.target.closest("[data-delete]");
  if (edit) openModal(products.find((product) => product.id === edit.dataset.edit));
  if (remove) {
    const product = products.find((item) => item.id === remove.dataset.delete);
    if (product && confirm(`“${product.name}” yerel taslaktan silinsin mi?`)) {
      products = products.filter((item) => item.id !== product.id);
      saveDraft();
      showToast("Ürün ailesi yerel taslaktan silindi.");
    }
  }
});

$("adminSearch").addEventListener("input", render);
$("categoryFilter").addEventListener("change", render);
$("resetBtn").addEventListener("click", () => {
  if (confirm("Yerel değişiklikler silinip yayımlanmış katalog verisine dönülsün mü?")) {
    localStorage.removeItem(DRAFT_KEY);
    products = structuredClone(basePayload.products);
    render();
    showToast("Yerel taslak sıfırlandı.");
  }
});
$("exportBtn").addEventListener("click", () => {
  const payload = { schemaVersion: 1, exportedAt: new Date().toISOString(), products };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "karahanli-products-draft.json";
  link.click();
  URL.revokeObjectURL(link.href);
});
$("importInput").addEventListener("change", async (event) => {
  const file = event.target.files[0];
  if (!file) return;
  try {
    const payload = JSON.parse(await file.text());
    const imported = Array.isArray(payload) ? payload : payload.products;
    if (!Array.isArray(imported) || imported.some((product) => !product.id || !product.slug || !product.variants?.length || "price" in product)) {
      throw new Error();
    }
    products = imported;
    saveDraft();
    showToast("JSON taslağı yüklendi.");
  } catch {
    alert("Geçersiz katalog JSON dosyası. Fiyat alanı içermediğinden ve varyantların bulunduğundan emin olun.");
  }
  event.target.value = "";
});
$("logoutBtn").addEventListener("click", (event) => {
  event.preventDefault();
  localStorage.removeItem("karahanliUser");
  location.href = "index.html";
});

fetch("data/products.json?v=20260726")
  .then((response) => response.json())
  .then((payload) => {
    basePayload = payload;
    products = loadDraft() || structuredClone(payload.products);
    [...new Set(products.map((product) => product.category))]
      .sort((a, b) => a.localeCompare(b, "tr"))
      .forEach((category) => $("categoryFilter").add(new Option(category, category)));
    render();
  })
  .catch(() => {
    $("productTable").innerHTML = '<tr><td colspan="6" class="empty-row">Katalog JSON dosyası yüklenemedi.</td></tr>';
  });
