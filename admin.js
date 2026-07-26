import { initializeApp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";

const config = window.KARAHANLI_FIREBASE_CONFIG || {};
const configured = Boolean(config.apiKey && config.authDomain && config.projectId && config.appId);
const firebaseApp = configured ? initializeApp(config) : null;
const auth = firebaseApp ? getAuth(firebaseApp) : null;
const $ = (id) => document.getElementById(id);
const state = { products: [], drafts: [], current: null, images: [], user: null };

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, (character) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
}

function slugify(value) {
  return String(value ?? "").toLocaleLowerCase("tr-TR").normalize("NFD")
    .replace(/\p{Diacritic}/gu, "").replace(/ı/g, "i").replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "").slice(0, 96);
}

function toast(message) {
  $("toast").textContent = message;
  $("toast").classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => $("toast").classList.remove("show"), 2600);
}

async function api(path, options = {}) {
  const token = await state.user.getIdToken();
  const response = await fetch(`/api/admin${path}`, {
    ...options,
    headers: {
      ...(options.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.error || "İşlem tamamlanamadı.");
    error.status = response.status;
    error.code = payload.code;
    throw error;
  }
  return payload;
}

function effectiveProducts() {
  const byId = new Map(state.products.map((product) => [product.id, { ...product, displayStatus: "published" }]));
  state.drafts.forEach((draft) => byId.set(draft.id, { ...draft, displayStatus: "draft" }));
  return [...byId.values()];
}

function render() {
  const query = $("adminSearch").value.toLocaleLowerCase("tr-TR");
  const status = $("adminStatus").value;
  const products = effectiveProducts();
  $("publishedCount").textContent = state.products.filter((product) => product.status === "published").length;
  $("draftCount").textContent = state.drafts.length;
  $("imageCount").textContent = products.reduce((sum, product) => sum + (product.images?.length || 0), 0);
  $("variantCount").textContent = products.reduce((sum, product) => sum + (product.variants?.length || 0), 0);
  const filtered = products.filter((product) => {
    const text = [product.brand, product.name, product.category, ...(product.variants || []).flatMap((variant) => [variant.name, variant.code])].join(" ").toLocaleLowerCase("tr-TR");
    return (!query || text.includes(query)) && (!status || product.displayStatus === status);
  });
  $("productTable").innerHTML = filtered.length ? filtered.map((product) => `
    <tr>
      <td><div class="product-cell"><img src="${escapeHtml(product.images?.[0]?.thumbnailSrc || product.images?.[0]?.src || "logo.png")}" alt=""><span><strong>${escapeHtml(product.name)}</strong><small>${escapeHtml(product.brand)} · ${escapeHtml(product.slug)}</small></span></div></td>
      <td>${escapeHtml(product.category)}</td><td>${product.variants?.length || 0}</td><td>${product.images?.length || 0}</td>
      <td><span class="status-pill ${product.displayStatus}">${product.displayStatus === "draft" ? "Taslak" : "Yayında"}</span></td>
      <td><button class="edit-button" type="button" data-edit="${escapeHtml(product.id)}">Düzenle</button></td>
    </tr>`).join("") : '<tr><td colspan="6">Eşleşen ürün bulunamadı.</td></tr>';
}

async function loadCatalog() {
  const payload = await api("/catalog");
  state.products = payload.products || [];
  state.drafts = payload.drafts || [];
  render();
}

function parseSpecifications(value) {
  return Object.fromEntries(value.split("\n").map((line) => line.trim()).filter(Boolean).map((line) => {
    const separator = line.indexOf(":");
    return separator < 0 ? [line, ""] : [line.slice(0, separator).trim(), line.slice(separator + 1).trim()];
  }));
}

function parseVariants(value) {
  const used = new Set();
  return value.split("\n").map((line) => line.trim()).filter(Boolean).map((line, index) => {
    const [name, code = "", imageId = ""] = line.split("|").map((part) => part.trim());
    let id = slugify(code || name) || `variant-${index + 1}`;
    while (used.has(id)) id = `${id}-${index + 1}`;
    used.add(id);
    return { id, name, code, attributes: {}, ...(imageId ? { imageId } : {}) };
  });
}

function renderMedia() {
  $("mediaList").innerHTML = state.images.length ? state.images.map((image, index) => `
    <article class="media-row" data-image="${escapeHtml(image.id)}">
      <img src="${escapeHtml(image.thumbnailSrc || image.src)}" alt="">
      <div class="media-fields">
        <input data-image-alt value="${escapeHtml(image.alt || "")}" aria-label="Görsel açıklaması" placeholder="Görsel açıklaması">
        <input data-image-variants value="${escapeHtml((image.variantIds || []).join(", "))}" aria-label="Varyant kimlikleri" placeholder="Varyant ID: a, b">
        <small>${escapeHtml(image.id)}</small><small>${index + 1}. sıra</small>
      </div>
      <div class="media-actions"><button type="button" data-move="-1" ${index === 0 ? "disabled" : ""}>↑</button><button type="button" data-move="1" ${index === state.images.length - 1 ? "disabled" : ""}>↓</button><button type="button" data-remove>×</button></div>
    </article>`).join("") : "<p>Henüz görsel eklenmedi.</p>";
}

function syncMediaFields() {
  $("mediaList").querySelectorAll(".media-row").forEach((row) => {
    const image = state.images.find((item) => item.id === row.dataset.image);
    if (!image) return;
    image.alt = row.querySelector("[data-image-alt]").value.trim();
    image.variantIds = row.querySelector("[data-image-variants]").value.split(",").map((value) => value.trim()).filter(Boolean);
  });
}

function openEditor(product = null) {
  const draft = product ? state.drafts.find((item) => item.id === product.id) : null;
  const value = draft || product || {
    id: `family-${crypto.randomUUID().slice(0, 8)}`,
    slug: "", brand: "", name: "", category: "", subcategory: "", summary: "", description: "",
    features: [], specifications: {}, images: [], variants: [], source: { type: "admin", catalog: "Admin paneli", pages: [] },
    featured: false, status: "published", revision: 0,
  };
  state.current = structuredClone(value);
  state.images = structuredClone(value.images || []);
  $("productId").value = value.id;
  $("revision").value = value.revision || 0;
  for (const field of ["brand", "name", "slug", "category", "subcategory", "summary", "description"]) $(field).value = value[field] || "";
  $("featured").checked = Boolean(value.featured);
  $("features").value = (value.features || []).join("\n");
  $("specifications").value = Object.entries(value.specifications || {}).map(([key, item]) => `${key}: ${item}`).join("\n");
  $("variants").value = (value.variants || []).map((variant) => `${variant.name} | ${variant.code || ""} | ${variant.imageId || ""}`).join("\n");
  $("editorTitle").textContent = product ? value.name : "Yeni ürün ailesi";
  $("archiveBtn").hidden = !product;
  renderMedia();
  $("editorOverlay").hidden = false;
}

function productFromForm() {
  syncMediaFields();
  return {
    id: $("productId").value,
    slug: $("slug").value.trim(),
    brand: $("brand").value.trim(),
    name: $("name").value.trim(),
    category: $("category").value.trim(),
    subcategory: $("subcategory").value.trim(),
    summary: $("summary").value.trim(),
    description: $("description").value.trim(),
    features: $("features").value.split("\n").map((line) => line.trim()).filter(Boolean),
    specifications: parseSpecifications($("specifications").value),
    images: state.images.map((image, index) => ({ ...image, order: index + 1 })),
    variants: parseVariants($("variants").value),
    source: state.current.source || { type: "admin", catalog: "Admin paneli", pages: [] },
    featured: $("featured").checked,
    status: "published",
  };
}

async function saveDraft() {
  const product = productFromForm();
  const result = await api(`/products/${encodeURIComponent(product.id)}/draft`, {
    method: "PUT",
    body: JSON.stringify({ product, expectedRevision: Number($("revision").value || 0) }),
  });
  $("revision").value = result.revision;
  state.current = { ...product, revision: result.revision };
  toast("Taslak Firestore'a kaydedildi.");
  await loadCatalog();
  return product;
}

$("loginForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!configured) {
    $("loginMessage").textContent = "Önce firebase-config.js dosyasını Firebase Web App değerleriyle doldurun.";
    return;
  }
  $("loginMessage").textContent = "";
  try {
    await signInWithEmailAndPassword(auth, $("loginEmail").value, $("loginPassword").value);
  } catch {
    $("loginMessage").textContent = "E-posta, şifre veya Firebase yapılandırması geçersiz.";
  }
});

if (auth) {
  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      state.user = null; $("loginView").hidden = false; $("adminView").hidden = true; return;
    }
    const token = await user.getIdTokenResult(true);
    if (token.claims.admin !== true) {
      $("loginMessage").textContent = "Bu hesabın admin yetkisi bulunmuyor.";
      await signOut(auth); return;
    }
    state.user = user;
    $("adminEmail").textContent = user.email;
    $("loginView").hidden = true;
    $("adminView").hidden = false;
    try { await loadCatalog(); } catch (error) {
      $("statusBar").hidden = false;
      $("statusBar").textContent = `Admin API bağlantısı kurulamadı: ${error.message}`;
    }
  });
}

$("logoutBtn").addEventListener("click", () => signOut(auth));
$("newProductBtn").addEventListener("click", () => openEditor());
$("closeEditor").addEventListener("click", () => $("editorOverlay").hidden = true);
$("name").addEventListener("input", () => { if (!state.current?.slug) $("slug").value = slugify($("name").value); });
$("adminSearch").addEventListener("input", render);
$("adminStatus").addEventListener("change", render);
$("productTable").addEventListener("click", (event) => {
  const button = event.target.closest("[data-edit]");
  if (button) openEditor(effectiveProducts().find((product) => product.id === button.dataset.edit));
});
$("mediaList").addEventListener("click", (event) => {
  const row = event.target.closest(".media-row");
  if (!row) return;
  syncMediaFields();
  const index = state.images.findIndex((image) => image.id === row.dataset.image);
  if (event.target.closest("[data-remove]")) state.images.splice(index, 1);
  const move = event.target.closest("[data-move]");
  if (move) {
    const target = index + Number(move.dataset.move);
    [state.images[index], state.images[target]] = [state.images[target], state.images[index]];
  }
  renderMedia();
});
$("mediaInput").addEventListener("change", async (event) => {
  if (!event.target.files.length) return;
  const data = new FormData();
  data.append("productId", $("productId").value);
  [...event.target.files].forEach((file) => data.append("images", file));
  try {
    const payload = await api("/media", { method: "POST", body: data });
    state.images.push(...payload.images);
    renderMedia();
    toast(`${payload.images.length} görsel Linux medya dizinine yüklendi.`);
  } catch (error) { toast(error.message); }
  event.target.value = "";
});
$("productForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  try { await saveDraft(); } catch (error) {
    toast(error.status === 409 ? "Revizyon çakışması: ürünü yeniden açın." : error.message);
  }
});
$("publishBtn").addEventListener("click", async () => {
  try {
    const product = await saveDraft();
    await api(`/products/${encodeURIComponent(product.id)}/publish`, { method: "POST" });
    $("editorOverlay").hidden = true;
    await loadCatalog();
    toast("Ürün yayımlandı ve katalog snapshot'ı yenilendi.");
  } catch (error) { toast(error.message); }
});
$("archiveBtn").addEventListener("click", async () => {
  if (!confirm("Bu ürün ailesini canlı katalogdan kaldırmak istiyor musunuz?")) return;
  try {
    await api(`/products/${encodeURIComponent($("productId").value)}/archive`, { method: "POST" });
    $("editorOverlay").hidden = true;
    await loadCatalog();
    toast("Ürün arşivlendi.");
  } catch (error) { toast(error.message); }
});
