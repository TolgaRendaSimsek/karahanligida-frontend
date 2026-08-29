"use client";

import Image from "next/image";
import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getApps, initializeApp } from "firebase/app";
import {
  getAuth,
  onAuthStateChanged,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  type User,
} from "firebase/auth";
import { publicAssetPath, type ProductFamily, type ProductImage } from "@/lib/catalog-schema";

export type FirebaseClientConfig = {
  apiKey: string;
  authDomain: string;
  projectId: string;
  appId: string;
};

type AdminProduct = ProductFamily & {
  revision?: number;
  displayStatus?: "published" | "draft" | "archived";
  importMeta?: {
    excelRow?: number;
    decision?: string;
    duplicateRows?: number[];
    research?: { status?: string; officialUrl?: string | null; checkedAt?: string | null };
  };
};

type TaxonomyCategory = {
  id: string;
  name: string;
  slug: string;
  status?: string;
  productCount?: number;
  subcategories: Array<{ name: string; slug: string }>;
};

type Taxonomy = { categories: TaxonomyCategory[]; brands: Array<{ id: string; name: string; productCount?: number }> };

type AdminUser = {
  uid: string;
  email: string;
  displayName: string;
  disabled: boolean;
};

type AdminInvite = {
  id: string;
  email: string;
  status: "pending";
};

type EditorFields = {
  product: AdminProduct;
  featuresText: string;
  specificationsText: string;
  variantsText: string;
};

const emptyProduct = (): AdminProduct => ({
  id: `family-${crypto.randomUUID().slice(0, 8)}`,
  slug: "",
  brand: "",
  name: "",
  category: "",
  subcategory: "",
  summary: "",
  description: "",
  features: [],
  specifications: {},
  images: [],
  variants: [],
  source: { catalog: "Admin paneli", pages: [] },
  featured: false,
  status: "published",
  revision: 0,
});

function slugify(value: string) {
  return value.toLocaleLowerCase("tr-TR").normalize("NFD")
    .replace(/\p{Diacritic}/gu, "").replace(/ı/g, "i")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 96);
}

function toEditor(product: AdminProduct): EditorFields {
  return {
    product: structuredClone(product),
    featuresText: product.features.join("\n"),
    specificationsText: Object.entries(product.specifications)
      .map(([key, value]) => `${key}: ${value}`).join("\n"),
    variantsText: product.variants
      .map((variant) => `${variant.name} | ${variant.code || ""} | ${variant.imageId || ""}`)
      .join("\n"),
  };
}

function parseSpecifications(value: string) {
  return Object.fromEntries(value.split("\n").map((line) => line.trim()).filter(Boolean).map((line) => {
    const separator = line.indexOf(":");
    return separator < 0
      ? [line, ""]
      : [line.slice(0, separator).trim(), line.slice(separator + 1).trim()];
  }));
}

function parseVariants(value: string) {
  const used = new Set<string>();
  return value.split("\n").map((line) => line.trim()).filter(Boolean).map((line, index) => {
    const [name, code = "", imageId = ""] = line.split("|").map((part) => part.trim());
    let id = slugify(code || name) || `variant-${index + 1}`;
    while (used.has(id)) id = `${id}-${index + 1}`;
    used.add(id);
    return { id, name, code, attributes: {}, ...(imageId ? { imageId } : {}) };
  });
}

export function AdminClient({
  firebaseConfig,
  apiOrigin,
}: {
  firebaseConfig: FirebaseClientConfig;
  apiOrigin: string;
}) {
  const configured = Object.values(firebaseConfig).every(Boolean);
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [loginError, setLoginError] = useState("");
  const [products, setProducts] = useState<AdminProduct[]>([]);
  const [drafts, setDrafts] = useState<AdminProduct[]>([]);
  const [archived, setArchived] = useState<AdminProduct[]>([]);
  const [taxonomy, setTaxonomy] = useState<Taxonomy>({ categories: [], brands: [] });
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [brandFilter, setBrandFilter] = useState("");
  const [editor, setEditor] = useState<EditorFields | null>(null);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [invites, setInvites] = useState<AdminInvite[]>([]);
  const [adminEmail, setAdminEmail] = useState("");
  const [adminBusy, setAdminBusy] = useState(false);
  const [dashboardState, setDashboardState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const replacementInput = useRef<HTMLInputElement>(null);
  const [replacementImageId, setReplacementImageId] = useState("");
  const [wizardStep, setWizardStep] = useState(1);
  const [adminView, setAdminView] = useState<"catalog" | "archive" | "categories" | "admins">("catalog");

  const auth = useMemo(() => {
    if (!configured) return null;
    const app = getApps()[0] || initializeApp(firebaseConfig);
    return getAuth(app);
  }, [configured, firebaseConfig]);

  const api = useCallback(async (path: string, options: RequestInit = {}) => {
    if (!user) throw new Error("Admin oturumu bulunamadı.");
    const baseUrl = apiOrigin.replace(/\/+$/, "");
    const send = async (forceRefresh = false) => fetch(`${baseUrl}/api/admin${path}`, {
      ...options,
      headers: {
        ...(options.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
        Authorization: `Bearer ${await user.getIdToken(forceRefresh)}`,
        ...options.headers,
      },
    });
    let response = await send();
    // Sağlayıcı bağlama veya admin claim değişikliğinden sonra önbellekteki
    // token iptal edilmiş olabilir. Bir kez zorla yenileyerek kullanıcıyı
    // gereksiz yere panelden atmadan isteği tekrarlarız.
    if (response.status === 401) response = await send(true);
    const payload = await response.json().catch(() => ({}));
    if (response.status === 401) {
      setLoginError(payload.error || "Google oturumunuz yenilenmeli.");
      if (auth) await signOut(auth);
    }
    if (!response.ok) {
      const error = new Error(payload.error || "İşlem tamamlanamadı.") as Error & { status?: number };
      error.status = response.status;
      throw error;
    }
    return payload;
  }, [apiOrigin, auth, user]);

  const loadCatalog = useCallback(async () => {
    try {
      const payload = await api("/catalog");
      setProducts(payload.products || []);
      setDrafts(payload.drafts || []);
      setArchived(payload.archived || []);
      setDashboardState("ready");
      setNotice("");
    } catch (error) {
      setDashboardState("error");
      setNotice(`Admin API bağlantısı kurulamadı: ${(error as Error).message}`);
    }
  }, [api]);

  const loadTaxonomy = useCallback(async () => {
    try {
      const payload = await api("/taxonomy");
      setTaxonomy({ categories: payload.categories || [], brands: payload.brands || [] });
    } catch (error) {
      setNotice(`Kategori ağacı alınamadı: ${(error as Error).message}`);
    }
  }, [api]);

  const loadAdmins = useCallback(async () => {
    try {
      const payload = await api("/admins");
      setAdmins(payload.admins || []);
      setInvites(payload.invites || []);
    } catch (error) {
      setNotice(`Admin listesi alınamadı: ${(error as Error).message}`);
    }
  }, [api]);

  useEffect(() => {
    if (!auth) {
      setAuthReady(true);
      return;
    }
    return onAuthStateChanged(auth, async (nextUser) => {
      if (!nextUser) {
        setUser(null);
        setAuthReady(true);
        return;
      }
      let token = await nextUser.getIdTokenResult(true);
      if (token.claims.admin !== true) {
        try {
          const baseUrl = apiOrigin.replace(/\/+$/, "");
          const response = await fetch(`${baseUrl}/api/admin/claim-invite`, {
            method: "POST",
            headers: { Authorization: `Bearer ${await nextUser.getIdToken()}` },
          });
          const payload = await response.json().catch(() => ({}));
          if (!response.ok) throw new Error(payload.error || "Admin daveti bulunamadı.");
          token = await nextUser.getIdTokenResult(true);
        } catch (error) {
          setLoginError((error as Error).message);
          await signOut(auth);
          setAuthReady(true);
          return;
        }
      }
      if (token.claims.admin !== true) throw new Error("Admin yetkisi etkinleştirilemedi.");
      setUser(nextUser);
      setAuthReady(true);
    });
  }, [auth, apiOrigin]);

  useEffect(() => {
    if (user) {
      setDashboardState("loading");
      void (async () => {
        try {
          await api("/session");
          await Promise.all([loadCatalog(), loadAdmins(), loadTaxonomy()]);
        } catch (error) {
          setDashboardState("error");
          setNotice(`Admin oturumu doğrulanamadı: ${(error as Error).message}`);
        }
      })();
    } else {
      setProducts([]);
      setDrafts([]);
      setArchived([]);
      setTaxonomy({ categories: [], brands: [] });
      setAdmins([]);
      setInvites([]);
      setDashboardState("idle");
    }
  }, [user, api, loadCatalog, loadAdmins, loadTaxonomy]);

  const effectiveProducts = useMemo(() => {
    const byId = new Map<string, AdminProduct>(products.map((product) => [
      product.id,
      { ...product, displayStatus: product.status === "archived" ? "archived" as const : "published" as const },
    ]));
    drafts.forEach((draft) => byId.set(draft.id, { ...draft, displayStatus: "draft" }));
    archived.forEach((product) => byId.set(product.id, { ...product, displayStatus: "archived" }));
    return [...byId.values()];
  }, [products, drafts, archived]);

  const categories = useMemo(() => taxonomy.categories.length
    ? taxonomy.categories.map((category) => category.name)
    : [...new Set(effectiveProducts.map((product) => product.category))].sort((left, right) => left.localeCompare(right, "tr")), [taxonomy.categories, effectiveProducts]);
  const brands = useMemo(() => taxonomy.brands.length
    ? taxonomy.brands.map((brand) => brand.name)
    : [...new Set(effectiveProducts.map((product) => product.brand))].sort((left, right) => left.localeCompare(right, "tr")), [taxonomy.brands, effectiveProducts]);
  const categoryCounts = useMemo(() => effectiveProducts.reduce<Record<string, number>>((counts, product) => {
    counts[product.category] = (counts[product.category] || 0) + 1;
    return counts;
  }, {}), [effectiveProducts]);

  const filtered = effectiveProducts.filter((product) => {
    const text = [
      product.brand, product.name, product.category,
      ...product.variants.flatMap((variant) => [variant.name, variant.code]),
    ].join(" ").toLocaleLowerCase("tr-TR");
    return (!query || text.includes(query.toLocaleLowerCase("tr-TR")))
      && (!brandFilter || product.brand === brandFilter)
      && (!categoryFilter || product.category === categoryFilter)
      && (!status || product.displayStatus === status)
      && (adminView !== "archive" || product.displayStatus === "archived")
      && (adminView === "archive" || product.displayStatus !== "archived");
  }).sort((left, right) => left.category.localeCompare(right.category, "tr")
    || left.brand.localeCompare(right.brand, "tr")
    || left.name.localeCompare(right.name, "tr"));

  function scrollAdminSection(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function openEditor(product: AdminProduct) {
    setEditor(toEditor(product));
    setWizardStep(1);
  }

  async function createCategory() {
    const name = window.prompt("Yeni kategori adı:");
    if (!name?.trim()) return;
    try {
      const result = await api("/categories", { method: "POST", body: JSON.stringify({ name: name.trim() }) });
      await loadTaxonomy();
      patchProduct({ category: result.category.name, subcategory: "" });
      setNotice("Yeni kategori oluşturuldu.");
    } catch (error) { setNotice((error as Error).message); }
  }

  async function createSubcategory(category: TaxonomyCategory) {
    const name = window.prompt(`${category.name} için yeni alt kategori adı:`);
    if (!name?.trim()) return;
    try {
      const subcategories = [...category.subcategories, { name: name.trim(), slug: slugify(name.trim()) }];
      await api(`/categories/${encodeURIComponent(category.id)}`, { method: "PATCH", body: JSON.stringify({ subcategories }) });
      await loadTaxonomy();
      patchProduct({ subcategory: name.trim() });
      setNotice("Yeni alt kategori oluşturuldu.");
    } catch (error) { setNotice((error as Error).message); }
  }

  async function deleteCategory(category: TaxonomyCategory) {
    if (!window.confirm(`${category.name} kategorisi silinsin mi?`)) return;
    try {
      await api(`/categories/${encodeURIComponent(category.id)}`, { method: "DELETE" });
      await loadTaxonomy();
      setNotice("Kategori silindi.");
    } catch (error) { setNotice((error as Error).message); }
  }

  async function restoreProduct(product: AdminProduct) {
    if (!window.confirm(`${product.name} arşivden geri getirilsin mi?`)) return;
    setBusy(true);
    try {
      await api(`/products/${encodeURIComponent(product.id)}/restore`, { method: "POST" });
      await loadCatalog();
      setNotice("Ürün arşivden geri getirildi ve snapshot yenilendi.");
    } catch (error) { setNotice((error as Error).message); }
    finally { setBusy(false); }
  }

  async function login() {
    if (!auth) {
      setLoginError("Firebase Web App ortam değişkenleri yapılandırılmamış.");
      return;
    }
    setLoginError("");
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });
      await signInWithPopup(auth, provider);
    } catch (error) {
      setLoginError((error as { code?: string }).code === "auth/popup-closed-by-user"
        ? "Google giriş penceresi kapatıldı."
        : "Google ile giriş tamamlanamadı.");
    }
  }

  function patchProduct(patch: Partial<AdminProduct>) {
    setEditor((current) => current ? { ...current, product: { ...current.product, ...patch } } : current);
  }

  function productFromEditor(current: EditorFields): AdminProduct {
    return {
      ...current.product,
      features: current.featuresText.split("\n").map((line) => line.trim()).filter(Boolean),
      specifications: parseSpecifications(current.specificationsText),
      variants: parseVariants(current.variantsText),
      images: current.product.images.map((image, index) => ({ ...image, order: index + 1 })),
      status: "published",
    };
  }

  async function saveDraft(): Promise<AdminProduct> {
    if (!editor) throw new Error("Düzenlenen ürün bulunamadı.");
    const product = productFromEditor(editor);
    const result = await api(`/products/${encodeURIComponent(product.id)}/draft`, {
      method: "PUT",
      body: JSON.stringify({ product, expectedRevision: Number(product.revision || 0) }),
    });
    const updated = { ...product, revision: result.revision };
    setEditor(toEditor(updated));
    await loadCatalog();
    setNotice("Taslak Firestore'a kaydedildi.");
    return updated;
  }

  async function submitDraft(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      await saveDraft();
    } catch (error) {
      setNotice((error as Error & { status?: number }).status === 409
        ? "Revizyon çakışması: ürünü yeniden açın."
        : (error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function publish() {
    setBusy(true);
    try {
      const product = await saveDraft();
      await api(`/products/${encodeURIComponent(product.id)}/publish`, { method: "POST" });
      setEditor(null);
      await loadCatalog();
      setNotice("Ürün yayımlandı ve katalog snapshot'ı yenilendi.");
    } catch (error) {
      setNotice((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function archive() {
    if (!editor || !window.confirm("Bu ürün ailesini canlı katalogdan kaldırmak istiyor musunuz?")) return;
    setBusy(true);
    try {
      await api(`/products/${encodeURIComponent(editor.product.id)}/archive`, { method: "POST" });
      setEditor(null);
      await loadCatalog();
      setNotice("Ürün arşivlendi.");
    } catch (error) {
      setNotice((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function uploadImages(files: FileList | null) {
    if (!editor || !files?.length) return;
    setBusy(true);
    const form = new FormData();
    form.append("productId", editor.product.id);
    [...files].forEach((file) => form.append("images", file));
    try {
      const result = await api("/media", { method: "POST", body: form });
      patchProduct({ images: [...editor.product.images, ...result.images] });
      setNotice(`${result.images.length} görsel Linux medya dizinine yüklendi.`);
    } catch (error) {
      setNotice((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function replaceImage(files: FileList | null) {
    if (!editor || !replacementImageId || !files?.[0]) return;
    setBusy(true);
    const form = new FormData();
    form.append("productId", editor.product.id);
    form.append("images", files[0]);
    try {
      const result = await api("/media", { method: "POST", body: form });
      const replacement = result.images[0] as ProductImage;
      const previous = editor.product.images.find((image) => image.id === replacementImageId);
      patchProduct({
        images: editor.product.images.map((image) => image.id === replacementImageId
          ? { ...replacement, alt: previous?.alt || replacement.alt, variantIds: previous?.variantIds || [] }
          : image),
      });
      setNotice("Görsel değiştirildi. Dosya, ürün yayımlandığında canlıya alınacak.");
    } catch (error) {
      setNotice((error as Error).message);
    } finally {
      setReplacementImageId("");
      if (replacementInput.current) replacementInput.current.value = "";
      setBusy(false);
    }
  }

  async function addAdmin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAdminBusy(true);
    try {
      await api("/admins", {
        method: "POST",
        body: JSON.stringify({ email: adminEmail }),
      });
      setAdminEmail("");
      await loadAdmins();
      setNotice("Google admin daveti oluşturuldu. Kullanıcı ilk Google girişinde yetkilendirilecek.");
    } catch (error) {
      setNotice((error as Error).message);
    } finally {
      setAdminBusy(false);
    }
  }

  async function cancelInvite(invite: AdminInvite) {
    if (!window.confirm(`${invite.email} daveti iptal edilsin mi?`)) return;
    setAdminBusy(true);
    try {
      await api(`/invites/${encodeURIComponent(invite.id)}`, { method: "DELETE" });
      await loadAdmins();
      setNotice("Admin daveti iptal edildi.");
    } catch (error) {
      setNotice((error as Error).message);
    } finally {
      setAdminBusy(false);
    }
  }

  async function deleteProduct() {
    if (!editor) return;
    const confirmation = window.prompt(`Bu işlem geri alınamaz. Kalıcı silmek için ürün adını yazın:\n${editor.product.name}`);
    if (confirmation === null) return;
    setBusy(true);
    try {
      await api(`/products/${encodeURIComponent(editor.product.id)}`, {
        method: "DELETE",
        body: JSON.stringify({ confirmation }),
      });
      setEditor(null);
      await loadCatalog();
      setNotice("Ürün kalıcı olarak silindi; medya dosyaları 30 günlük çöp alanına taşındı.");
    } catch (error) {
      setNotice((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function removeAdmin(admin: AdminUser) {
    if (admin.uid === user?.uid) {
      setNotice("Kendi admin yetkinizi kaldıramazsınız.");
      return;
    }
    if (!window.confirm(`${admin.email} kullanıcısının admin yetkisi kaldırılsın mı?`)) return;
    setAdminBusy(true);
    try {
      await api(`/admins/${encodeURIComponent(admin.uid)}`, { method: "DELETE" });
      await loadAdmins();
      setNotice("Admin yetkisi kaldırıldı ve kullanıcının mevcut oturumları iptal edildi.");
    } catch (error) {
      setNotice((error as Error).message);
    } finally {
      setAdminBusy(false);
    }
  }

  function updateImage(id: string, patch: Partial<ProductImage>) {
    if (!editor) return;
    patchProduct({ images: editor.product.images.map((image) => image.id === id ? { ...image, ...patch } : image) });
  }

  function moveImage(index: number, direction: number) {
    if (!editor) return;
    const target = index + direction;
    if (target < 0 || target >= editor.product.images.length) return;
    const images = [...editor.product.images];
    [images[index], images[target]] = [images[target], images[index]];
    patchProduct({ images });
  }

  function nextWizardStep() {
    if (!editor) return;
    if (wizardStep === 1 && (!editor.product.brand.trim() || !editor.product.name.trim() || !editor.product.slug.trim() || !editor.product.summary.trim() || !editor.product.description.trim())) {
      setNotice("Temel bilgilerde marka, ad, slug, özet ve açıklama zorunludur.");
      return;
    }
    if (wizardStep === 2 && !editor.product.category.trim()) {
      setNotice("Bir kategori seçin veya yeni kategori oluşturun.");
      return;
    }
    setWizardStep((step) => Math.min(5, step + 1));
  }

  if (!authReady) return <main className="admin-login-shell"><p>Güvenli yönetim paneli hazırlanıyor…</p></main>;
  if (!user) {
    return (
      <main className="admin-login-shell">
        <section className="admin-login-card">
          <Image src="/logo.png" width={70} height={70} alt="Karahanlı Gıda" />
          <span className="eyebrow">GÜVENLİ YÖNETİM</span>
          <h1>Katalog yönetimi</h1>
          <p>Davet edilmiş Google hesabınızla güvenli şekilde giriş yapın.</p>
          <button type="button" onClick={() => void login()}>Google ile Giriş Yap</button>
          <p className="admin-error">{loginError}</p>
        </section>
      </main>
    );
  }

  const imageCount = effectiveProducts.reduce((sum, product) => sum + product.images.length, 0);
  const variantCount = effectiveProducts.reduce((sum, product) => sum + product.variants.length, 0);

  return (
    <main className="admin-page">
      <aside className="admin-sidebar">
        <Link className="admin-brand" href="/admin">
          <Image src="/logo.png" width={46} height={46} alt="" />
          <span><strong>KARAHANLI GIDA</strong><small>Katalog Yönetimi</small></span>
        </Link>
        <nav>
          <button className={adminView === "catalog" ? "active" : undefined} type="button" onClick={() => { setAdminView("catalog"); scrollAdminSection("urunler"); }}>Yayınlanan Ürünler</button>
          <button className={adminView === "archive" ? "active" : undefined} type="button" onClick={() => { setAdminView("archive"); scrollAdminSection("urunler"); }}>Arşiv <small>({archived.length})</small></button>
          <button className={adminView === "categories" ? "active" : undefined} type="button" onClick={() => { setAdminView("categories"); scrollAdminSection("kategoriler"); }}>Kategoriler</button>
          <button className={adminView === "admins" ? "active" : undefined} type="button" onClick={() => { setAdminView("admins"); scrollAdminSection("yoneticiler"); }}>Yöneticiler</button>
          <Link href="/urunler" target="_blank" rel="noopener noreferrer">Canlı kataloğu gör ↗</Link>
        </nav>
        <div className="admin-account"><span>{user.email}</span><button type="button" onClick={() => auth && signOut(auth)}>Çıkış</button></div>
      </aside>
      <section className="admin-main">
        <header className="admin-topbar">
          <div><span className="eyebrow">FIREBASE + LINUX MEDYA</span><h1>Ürün kataloğu</h1></div>
          <button type="button" className="admin-primary" onClick={() => openEditor(emptyProduct())}>Yeni Ürün Ailesi</button>
        </header>
        {dashboardState === "loading" && <div className="admin-notice"><span>Google oturumu doğrulanıyor ve 230 ürün yükleniyor…</span></div>}
        {notice && <div className="admin-notice">
          <span>{notice}</span>
          {dashboardState === "error" && user && <button type="button" onClick={() => {
            setDashboardState("loading");
            void api("/session").then(() => Promise.all([loadCatalog(), loadAdmins(), loadTaxonomy()])).catch((error) => {
              setDashboardState("error");
              setNotice(`Admin oturumu doğrulanamadı: ${error.message}`);
            });
          }}>Tekrar Dene</button>}
        </div>}
        {dashboardState === "ready" && <><section className="admin-stats">
          <article><span>Yayımlanmış</span><strong>{products.filter((item) => item.status === "published").length}</strong></article>
          <article><span>Taslak</span><strong>{drafts.length}</strong></article>
          <article><span>Görsel</span><strong>{imageCount}</strong></article>
          <article><span>Varyant / model</span><strong>{variantCount}</strong></article>
        </section>
        <section className="admin-panel" id="urunler">
          <header className="admin-catalog-heading">
            <div><span className="eyebrow">{adminView === "archive" ? "ARŞİV" : "ÜRÜN SINIFLARI"}</span><h2>{adminView === "archive" ? "Arşivlenmiş ürünler" : "Katalog görünümü"}</h2><p>{adminView === "archive" ? "Canlı katalogdan kaldırılmış ürünleri eski kategorileri ve görselleriyle inceleyip geri getirin." : "Ürünleri canlı sitedeki gibi fotoğraflarıyla inceleyin; marka, kategori veya duruma göre süzün."}</p></div>
            <strong>{filtered.length} / {effectiveProducts.length} ürün</strong>
          </header>
          <div className="admin-category-strip" aria-label="Kategori filtreleri">
            <button type="button" className={!categoryFilter ? "active" : undefined} onClick={() => setCategoryFilter("")}><span>Tümü</span><strong>{effectiveProducts.length}</strong></button>
            {adminView !== "archive" && categories.map((category) => <button type="button" className={categoryFilter === category ? "active" : undefined} key={category} onClick={() => setCategoryFilter(category)}><span>{category}</span><strong>{categoryCounts[category]}</strong></button>)}
          </div>
          <div className="admin-toolbar">
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Ürün, marka veya model kodu ara" />
            <select aria-label="Marka" value={brandFilter} onChange={(event) => setBrandFilter(event.target.value)}>
              <option value="">Tüm markalar</option>{brands.map((brand) => <option key={brand}>{brand}</option>)}
            </select>
            <select aria-label="Kategori" value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}>
              <option value="">Tüm kategoriler</option>{categories.map((category) => <option key={category}>{category}</option>)}
            </select>
            <select value={status} onChange={(event) => setStatus(event.target.value)}>
              <option value="">Tüm durumlar</option><option value="published">Yayımlanmış</option><option value="draft">Taslak</option><option value="archived">Arşiv</option>
            </select>
          </div>
          {filtered.length ? <div className="admin-product-grid">{filtered.map((product) => (
            <article className="admin-product-card" key={product.id}>
              <div className="admin-product-media">
                {product.images[0] ? <Image src={publicAssetPath(product.images[0].thumbnailSrc || product.images[0].src)} fill sizes="(max-width: 800px) 100vw, 300px" alt={product.images[0].alt || `${product.brand} ${product.name}`} /> : <span>Görsel yok</span>}
                <span className={`admin-status ${product.displayStatus}`}>{product.displayStatus === "draft" ? "Taslak" : product.displayStatus === "archived" ? "Arşiv" : "Yayında"}</span>
                <span className="admin-image-count" aria-label={`${product.images.length} görsel`}>▧ {product.images.length}</span>
              </div>
              <div className="admin-product-content">
                <div className="admin-product-labels"><span>{product.brand}</span><span>{product.category}</span></div>
                <h3>{product.name}</h3>
                <p>{product.summary}</p>
                <dl>
                  <div><dt>Varyant / model</dt><dd>{product.variants.length}</dd></div>
                  <div><dt>Ürün görseli</dt><dd>{product.images.length}</dd></div>
                  <div><dt>Alt kategori</dt><dd>{product.subcategory || "—"}</dd></div>
                </dl>
              </div>
              <footer>
                {product.displayStatus === "archived" ? <span className="admin-muted-link">Canlıdan kaldırıldı</span> : <Link href={`/urunler/${product.slug}`} target="_blank" rel="noopener noreferrer" aria-label={`${product.name} canlı ürün sayfasını aç`}>Canlı sayfa ↗</Link>}
                {product.displayStatus === "archived" ? <button type="button" className="admin-edit" disabled={busy} onClick={() => void restoreProduct(product)}>Geri Getir</button> : <button type="button" className="admin-edit" onClick={() => openEditor(product)}>Ürünü Düzenle</button>}
              </footer>
            </article>
          ))}</div> : <div className="admin-empty-products"><h3>Eşleşen ürün bulunamadı</h3><p>Aramayı veya kategori filtrelerini temizleyin.</p><button type="button" onClick={() => { setQuery(""); setBrandFilter(""); setCategoryFilter(""); setStatus(""); }}>Tüm ürünleri göster</button></div>}
        </section>
        <section className="admin-panel admin-taxonomy-panel" id="kategoriler">
          <header>
            <div><span className="eyebrow">KATALOG SINIFLANDIRMASI</span><h2>Kategoriler ve alt kategoriler</h2><p>Ürün düzenlerken aşağıdaki tanımlı seçenekler kullanılabilir. Kullanılan kategori silinemez.</p></div>
            <button type="button" className="admin-secondary" onClick={() => void createCategory()}>+ Yeni kategori</button>
          </header>
          <div className="admin-taxonomy-list">
            {taxonomy.categories.map((category) => <article key={category.id}>
              <div><strong>{category.name}</strong><small>{category.productCount || 0} ürün · {category.subcategories.length} alt kategori</small><div className="admin-subcategory-pills">{category.subcategories.map((subcategory) => <span key={subcategory.slug}>{subcategory.name}</span>)}</div></div>
              <div className="admin-taxonomy-actions"><button type="button" className="admin-secondary" onClick={() => void createSubcategory(category)}>Alt kategori ekle</button><button type="button" className="admin-danger" onClick={() => void deleteCategory(category)} disabled={Boolean(category.productCount)}>Sil</button></div>
            </article>)}
          </div>
        </section>
        <section className="admin-panel admin-users-panel" id="yoneticiler">
          <header>
            <div>
              <span className="eyebrow">FIREBASE AUTHENTICATION</span>
              <h2>Yöneticiler</h2>
              <p>Google hesabını davet edin veya mevcut bir yöneticinin yetkisini kaldırın.</p>
            </div>
            <strong>{admins.length} admin</strong>
          </header>
          <form className="admin-user-form" onSubmit={addAdmin}>
            <label>
              Kullanıcı e-postası
              <input
                type="email"
                value={adminEmail}
                onChange={(event) => setAdminEmail(event.target.value)}
                placeholder="admin@ornek.com"
                required
              />
            </label>
            <button className="admin-primary" type="submit" disabled={adminBusy}>Google Admin Daveti Gönder</button>
          </form>
          {invites.length > 0 && <div className="admin-user-list">
            {invites.map((invite) => <article key={invite.id}>
              <div><strong>{invite.email}</strong><small>İlk Google girişini bekliyor</small></div>
              <button className="admin-danger" type="button" disabled={adminBusy} onClick={() => void cancelInvite(invite)}>Daveti İptal Et</button>
            </article>)}
          </div>}
          <div className="admin-user-list">
            {admins.map((admin) => (
              <article key={admin.uid}>
                <div>
                  <strong>{admin.displayName || admin.email}</strong>
                  {admin.displayName && <small>{admin.email}</small>}
                  <small>{admin.disabled ? "Hesap devre dışı" : "Aktif hesap"}</small>
                </div>
                <button
                  className="admin-danger"
                  type="button"
                  disabled={adminBusy || admin.uid === user.uid}
                  onClick={() => void removeAdmin(admin)}
                  title={admin.uid === user.uid ? "Kendi yetkinizi kaldıramazsınız" : "Admin yetkisini kaldır"}
                >
                  {admin.uid === user.uid ? "Mevcut hesap" : "Yetkiyi Kaldır"}
                </button>
              </article>
            ))}
          </div>
        </section></>}
      </section>
      {editor && (
        <div className="admin-editor-overlay">
          <form className="admin-editor" onSubmit={submitDraft}>
            <header><div><span className="eyebrow">ÜRÜN AİLESİ</span><h2>{editor.product.name || "Yeni ürün ailesi"}</h2></div><button type="button" onClick={() => setEditor(null)} aria-label="Düzenleyiciyi kapat">×</button></header>
            <div className="admin-editor-body">
              <div className="admin-wizard-steps" aria-label="Ürün düzenleme adımları">
                {["Temel bilgiler", "Kategori", "Varyantlar", "Görseller", "Önizleme"].map((label, index) => <button type="button" key={label} className={wizardStep === index + 1 ? "active" : wizardStep > index + 1 ? "complete" : undefined} onClick={() => setWizardStep(index + 1)}><strong>{index + 1}</strong><span>{label}</span></button>)}
              </div>
              {wizardStep === 1 && <div className="admin-form-grid">
                <label>Marka<input value={editor.product.brand} onChange={(e) => patchProduct({ brand: e.target.value })} required /></label>
                <label>Ürün adı<input value={editor.product.name} onChange={(e) => { const name = e.target.value; patchProduct({ name, ...(!editor.product.slug ? { slug: slugify(name) } : {}) }); }} required /></label>
                <label>Slug<input value={editor.product.slug} onChange={(e) => patchProduct({ slug: e.target.value })} pattern="[a-z0-9-]+" required /></label>
                <label className="admin-check"><input type="checkbox" checked={editor.product.featured} onChange={(e) => patchProduct({ featured: e.target.checked })} />Ana sayfada öne çıkar</label>
                <label className="wide">Kısa özet<textarea rows={2} value={editor.product.summary} onChange={(e) => patchProduct({ summary: e.target.value })} required /></label>
                <label className="wide">Açıklama<textarea rows={5} value={editor.product.description} onChange={(e) => patchProduct({ description: e.target.value })} required /></label>
              </div>}
              {wizardStep === 2 && <div className="admin-form-grid">
                <label>Kategori<select value={editor.product.category} onChange={(e) => { if (e.target.value === "__new__") void createCategory(); else patchProduct({ category: e.target.value, subcategory: "" }); }} required><option value="">Kategori seçin</option>{taxonomy.categories.map((category) => <option value={category.name} key={category.id}>{category.name} ({category.productCount || 0})</option>)}<option value="__new__">+ Yeni kategori oluştur</option></select></label>
                <label>Alt kategori<select value={editor.product.subcategory} onChange={(e) => { if (e.target.value === "__new__") { const category = taxonomy.categories.find((item) => item.name === editor.product.category); if (category) void createSubcategory(category); } else patchProduct({ subcategory: e.target.value }); }}><option value="">Alt kategori seçin</option>{taxonomy.categories.find((category) => category.name === editor.product.category)?.subcategories.map((subcategory) => <option value={subcategory.name} key={subcategory.slug}>{subcategory.name}</option>)}<option value="__new__">+ Yeni alt kategori oluştur</option></select></label>
                <div className="admin-category-help wide"><strong>Seçili kategori:</strong> {editor.product.category || "Henüz seçilmedi"}<br /><span>Yeni seçenek eklemek için açılır listenin sonundaki “+” seçeneğini kullanın.</span></div>
              </div>}
              {wizardStep === 3 && <div className="admin-form-grid">
                <label className="wide">Varyantlar / modeller <small>Her satıra: Ad | Model/kod | Görsel ID</small><textarea rows={12} value={editor.variantsText} onChange={(e) => setEditor({ ...editor, variantsText: e.target.value })} required /></label>
                <label className="wide">Özellikler <small>Her satıra bir özellik</small><textarea rows={6} value={editor.featuresText} onChange={(e) => setEditor({ ...editor, featuresText: e.target.value })} /></label>
                <label className="wide">Teknik bilgiler <small>Her satıra “Alan: Değer” (fiyat/stok yazmayın)</small><textarea rows={6} value={editor.specificationsText} onChange={(e) => setEditor({ ...editor, specificationsText: e.target.value })} /></label>
              </div>}
              {wizardStep === 4 && <section className="admin-media">
                <div className="admin-media-heading"><div><h3>Ürün görselleri</h3><p>Görselleri yükleyin, sıralayın ve varyantlarla eşleştirin.</p></div><label className="admin-upload">Görsel Yükle<input type="file" accept="image/jpeg,image/png,image/webp,image/avif" multiple onChange={(e) => void uploadImages(e.target.files)} /></label></div>
                <input ref={replacementInput} hidden type="file" accept="image/jpeg,image/png,image/webp,image/avif" onChange={(event) => void replaceImage(event.target.files)} />
                <div className="admin-media-list">{editor.product.images.length ? editor.product.images.map((image, index) => (
                  <article className="admin-media-row" key={image.id}>
                    <div><Image src={publicAssetPath(image.thumbnailSrc || image.src)} fill sizes="82px" alt="" /></div>
                    <div className="admin-media-fields">
                      <input value={image.alt} onChange={(e) => updateImage(image.id, { alt: e.target.value })} placeholder="Görsel açıklaması" />
                      <input value={image.variantIds.join(", ")} onChange={(e) => updateImage(image.id, { variantIds: e.target.value.split(",").map((value) => value.trim()).filter(Boolean) })} placeholder="Varyant ID: a, b" />
                      <small>{image.id}</small><small>{index + 1}. sıra</small>
                    </div>
                    <div className="admin-media-actions">
                      <button type="button" aria-label="Görseli yukarı taşı" disabled={index === 0} onClick={() => moveImage(index, -1)}>↑</button>
                      <button type="button" aria-label="Görseli aşağı taşı" disabled={index === editor.product.images.length - 1} onClick={() => moveImage(index, 1)}>↓</button>
                      <button type="button" aria-label="Görseli değiştir" onClick={() => { setReplacementImageId(image.id); replacementInput.current?.click(); }}>↻</button>
                      <button type="button" aria-label="Görseli kaldır" disabled={editor.product.images.length === 1} title={editor.product.images.length === 1 ? "Önce yeni bir görsel yükleyin" : "Görseli kaldır"} onClick={() => patchProduct({ images: editor.product.images.filter((item) => item.id !== image.id) })}>×</button>
                    </div>
                  </article>
                )) : <p>Henüz görsel eklenmedi.</p>}</div>
              </section>}
              {wizardStep === 5 && <section className="admin-preview-step"><span className="eyebrow">YAYINA HAZIRLIK</span><h3>{editor.product.name || "Yeni ürün ailesi"}</h3><p>{editor.product.summary || "Kısa özet eklenmedi."}</p><dl><div><dt>Marka</dt><dd>{editor.product.brand || "—"}</dd></div><div><dt>Kategori</dt><dd>{editor.product.category || "—"} / {editor.product.subcategory || "—"}</dd></div><div><dt>Varyant</dt><dd>{parseVariants(editor.variantsText).length}</dd></div><div><dt>Görsel</dt><dd>{editor.product.images.length}</dd></div></dl>{(!editor.product.images.length || !editor.product.variants.length) && <p className="admin-warning">Yayınlamak için en az bir görsel ve varyant gerekir.</p>}</section>}
            </div>
            <footer>
              {products.some((item) => item.id === editor.product.id) && <><button className="admin-danger" type="button" onClick={() => void archive()}>Arşivle</button><button className="admin-danger" type="button" onClick={() => void deleteProduct()}>Kalıcı Sil</button></>}
              <span />
              {wizardStep > 1 && <button className="admin-secondary" type="button" disabled={busy} onClick={() => setWizardStep((step) => step - 1)}>‹ Geri</button>}
              {wizardStep < 5 && <button className="admin-secondary" type="button" disabled={busy} onClick={nextWizardStep}>İleri ›</button>}
              <button className="admin-secondary" type="submit" disabled={busy}>Taslağı Kaydet</button>
              {wizardStep === 5 && <button className="admin-primary" type="button" disabled={busy} onClick={() => void publish()}>Yayınla</button>}
            </footer>
          </form>
        </div>
      )}
    </main>
  );
}
