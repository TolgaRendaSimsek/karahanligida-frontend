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
  displayStatus?: "published" | "draft";
};

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
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [editor, setEditor] = useState<EditorFields | null>(null);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [invites, setInvites] = useState<AdminInvite[]>([]);
  const [adminEmail, setAdminEmail] = useState("");
  const [adminBusy, setAdminBusy] = useState(false);
  const replacementInput = useRef<HTMLInputElement>(null);
  const [replacementImageId, setReplacementImageId] = useState("");

  const auth = useMemo(() => {
    if (!configured) return null;
    const app = getApps()[0] || initializeApp(firebaseConfig);
    return getAuth(app);
  }, [configured, firebaseConfig]);

  const api = useCallback(async (path: string, options: RequestInit = {}) => {
    if (!user) throw new Error("Admin oturumu bulunamadı.");
    const token = await user.getIdToken();
    const baseUrl = apiOrigin.replace(/\/+$/, "");
    const response = await fetch(`${baseUrl}/api/admin${path}`, {
      ...options,
      headers: {
        ...(options.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
        Authorization: `Bearer ${token}`,
        ...options.headers,
      },
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(payload.error || "İşlem tamamlanamadı.") as Error & { status?: number };
      error.status = response.status;
      throw error;
    }
    return payload;
  }, [apiOrigin, user]);

  const loadCatalog = useCallback(async () => {
    try {
      const payload = await api("/catalog");
      setProducts(payload.products || []);
      setDrafts(payload.drafts || []);
      setNotice("");
    } catch (error) {
      setNotice(`Admin API bağlantısı kurulamadı: ${(error as Error).message}`);
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
      void loadCatalog();
      void loadAdmins();
    }
  }, [user, loadCatalog, loadAdmins]);

  const effectiveProducts = useMemo(() => {
    const byId = new Map<string, AdminProduct>(products.map((product) => [
      product.id,
      { ...product, displayStatus: "published" as const },
    ]));
    drafts.forEach((draft) => byId.set(draft.id, { ...draft, displayStatus: "draft" }));
    return [...byId.values()];
  }, [products, drafts]);

  const filtered = effectiveProducts.filter((product) => {
    const text = [
      product.brand, product.name, product.category,
      ...product.variants.flatMap((variant) => [variant.name, variant.code]),
    ].join(" ").toLocaleLowerCase("tr-TR");
    return (!query || text.includes(query.toLocaleLowerCase("tr-TR")))
      && (!status || product.displayStatus === status);
  });

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
        <Link className="admin-brand" href="/">
          <Image src="/logo.png" width={46} height={46} alt="" />
          <span><strong>KARAHANLI GIDA</strong><small>Katalog Yönetimi</small></span>
        </Link>
        <nav>
          <a className="active" href="#urunler">Ürün Aileleri</a>
          <a href="#yoneticiler">Yöneticiler</a>
          <Link href="/urunler">Canlı kataloğu gör</Link>
        </nav>
        <div className="admin-account"><span>{user.email}</span><button type="button" onClick={() => auth && signOut(auth)}>Çıkış</button></div>
      </aside>
      <section className="admin-main">
        <header className="admin-topbar">
          <div><span className="eyebrow">FIREBASE + LINUX MEDYA</span><h1>Ürün kataloğu</h1></div>
          <button type="button" className="admin-primary" onClick={() => setEditor(toEditor(emptyProduct()))}>Yeni Ürün Ailesi</button>
        </header>
        {notice && <div className="admin-notice">{notice}</div>}
        <section className="admin-stats">
          <article><span>Yayımlanmış</span><strong>{products.filter((item) => item.status === "published").length}</strong></article>
          <article><span>Taslak</span><strong>{drafts.length}</strong></article>
          <article><span>Görsel</span><strong>{imageCount}</strong></article>
          <article><span>Varyant / model</span><strong>{variantCount}</strong></article>
        </section>
        <section className="admin-panel" id="urunler">
          <div className="admin-toolbar">
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Ürün, marka veya model kodu ara" />
            <select value={status} onChange={(event) => setStatus(event.target.value)}>
              <option value="">Tüm durumlar</option><option value="published">Yayımlanmış</option><option value="draft">Taslak</option>
            </select>
          </div>
          <div className="admin-table-wrap">
            <table>
              <thead><tr><th>Ürün ailesi</th><th>Kategori</th><th>Varyant</th><th>Görsel</th><th>Durum</th><th /></tr></thead>
              <tbody>{filtered.length ? filtered.map((product) => (
                <tr key={product.id}>
                  <td><div className="admin-product-cell">
                    <div>{product.images[0] && <Image src={publicAssetPath(product.images[0].thumbnailSrc)} fill sizes="60px" alt="" />}</div>
                    <span><strong>{product.name}</strong><small>{product.brand} · {product.slug}</small></span>
                  </div></td>
                  <td>{product.category}</td><td>{product.variants.length}</td><td>{product.images.length}</td>
                  <td><span className={`admin-status ${product.displayStatus}`}>{product.displayStatus === "draft" ? "Taslak" : "Yayında"}</span></td>
                  <td><button type="button" className="admin-edit" onClick={() => setEditor(toEditor(product))}>Düzenle</button></td>
                </tr>
              )) : <tr><td colSpan={6}>Eşleşen ürün bulunamadı.</td></tr>}</tbody>
            </table>
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
        </section>
      </section>
      {editor && (
        <div className="admin-editor-overlay">
          <form className="admin-editor" onSubmit={submitDraft}>
            <header><div><span className="eyebrow">ÜRÜN AİLESİ</span><h2>{editor.product.name || "Yeni ürün ailesi"}</h2></div><button type="button" onClick={() => setEditor(null)} aria-label="Düzenleyiciyi kapat">×</button></header>
            <div className="admin-editor-body">
              <div className="admin-form-grid">
                <label>Marka<input value={editor.product.brand} onChange={(e) => patchProduct({ brand: e.target.value })} required /></label>
                <label>Ürün adı<input value={editor.product.name} onChange={(e) => {
                  const name = e.target.value; patchProduct({ name, ...(!editor.product.slug ? { slug: slugify(name) } : {}) });
                }} required /></label>
                <label>Slug<input value={editor.product.slug} onChange={(e) => patchProduct({ slug: e.target.value })} pattern="[a-z0-9-]+" required /></label>
                <label>Kategori<input value={editor.product.category} onChange={(e) => patchProduct({ category: e.target.value })} required /></label>
                <label>Alt kategori<input value={editor.product.subcategory} onChange={(e) => patchProduct({ subcategory: e.target.value })} /></label>
                <label className="admin-check"><input type="checkbox" checked={editor.product.featured} onChange={(e) => patchProduct({ featured: e.target.checked })} />Ana sayfada öne çıkar</label>
                <label className="wide">Kısa özet<textarea rows={2} value={editor.product.summary} onChange={(e) => patchProduct({ summary: e.target.value })} required /></label>
                <label className="wide">Açıklama<textarea rows={4} value={editor.product.description} onChange={(e) => patchProduct({ description: e.target.value })} required /></label>
                <label className="wide">Özellikler <small>Her satıra bir özellik</small><textarea rows={5} value={editor.featuresText} onChange={(e) => setEditor({ ...editor, featuresText: e.target.value })} /></label>
                <label className="wide">Teknik bilgiler <small>Her satıra “Alan: Değer”</small><textarea rows={5} value={editor.specificationsText} onChange={(e) => setEditor({ ...editor, specificationsText: e.target.value })} /></label>
                <label className="wide">Varyantlar / modeller <small>Ad | Kod | Görsel ID</small><textarea rows={8} value={editor.variantsText} onChange={(e) => setEditor({ ...editor, variantsText: e.target.value })} required /></label>
              </div>
              <section className="admin-media">
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
              </section>
            </div>
            <footer>
              {products.some((item) => item.id === editor.product.id) && <><button className="admin-danger" type="button" onClick={() => void archive()}>Arşivle</button><button className="admin-danger" type="button" onClick={() => void deleteProduct()}>Kalıcı Sil</button></>}
              <span />
              <button className="admin-secondary" type="submit" disabled={busy}>Taslağı Kaydet</button>
              <button className="admin-primary" type="button" disabled={busy} onClick={() => void publish()}>Yayınla</button>
            </footer>
          </form>
        </div>
      )}
    </main>
  );
}
