import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { publishDraft, rebuildPublicSnapshot } from "../src/publisher.mjs";

class FakeSnapshot {
  constructor(id, value) {
    this.id = id;
    this.exists = value !== undefined;
    this._value = value;
  }

  data() {
    return this._value;
  }
}

class FakeRef {
  constructor(db, collection, id) {
    this.db = db;
    this.collection = collection;
    this.id = id;
  }

  async get() {
    return new FakeSnapshot(this.id, this.db.read(this.collection, this.id));
  }

  async update(value) {
    this.db.write(this.collection, this.id, { ...this.db.read(this.collection, this.id), ...value });
  }
}

class FakeCollection {
  constructor(db, name) {
    this.db = db;
    this.name = name;
  }

  doc(id) {
    return new FakeRef(this.db, this.name, id);
  }

  async add(value) {
    const id = `generated-${this.db.nextId++}`;
    this.db.write(this.name, id, value);
    return this.doc(id);
  }

  where(field, operator, expected) {
    assert.equal(operator, "==");
    return {
      get: async () => {
        const docs = [...(this.db.records.get(this.name) || [])]
          .filter(([, value]) => value?.[field] === expected)
          .map(([id, value]) => new FakeSnapshot(id, value));
        return { docs };
      },
    };
  }
}

class FakeDb {
  constructor(seed = {}) {
    this.records = new Map(Object.entries(seed).map(([collection, values]) => [collection, new Map(Object.entries(values))]));
    this.nextId = 1;
  }

  collection(name) {
    return new FakeCollection(this, name);
  }

  read(collection, id) {
    return this.records.get(collection)?.get(id);
  }

  write(collection, id, value) {
    if (!this.records.has(collection)) this.records.set(collection, new Map());
    this.records.get(collection).set(id, structuredClone(value));
  }

  remove(collection, id) {
    this.records.get(collection)?.delete(id);
  }

  async runTransaction(callback) {
    const transaction = {
      get: (ref) => ref.get(),
      set: (ref, value, options = {}) => {
        const next = options.merge ? { ...this.read(ref.collection, ref.id), ...value } : value;
        this.write(ref.collection, ref.id, next);
      },
      delete: (ref) => this.remove(ref.collection, ref.id),
    };
    return callback(transaction);
  }
}

function product(overrides = {}) {
  return {
    id: "family-publisher-test",
    slug: "publisher-test",
    brand: "Test Marka",
    name: "Yayınlama Test Ürünü",
    category: "Kahve",
    subcategory: "Çekirdek Kahve",
    summary: "Test özeti",
    description: "Test açıklaması",
    features: [],
    specifications: {},
    images: [],
    variants: [{ id: "variant-1", name: "Standart", code: "", attributes: {} }],
    source: { catalog: "Test", pages: [] },
    featured: false,
    imageStatus: "research-needed",
    status: "draft",
    ...overrides,
  };
}

test("Firestore yayını atomik snapshot üretir ve taslağı canlı aileye taşır", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "karahanli-publisher-"));
  const catalogPath = path.join(root, "products.json");
  const draft = product();
  const db = new FakeDb({ productDrafts: { [draft.id]: draft }, productFamilies: {} });

  try {
    const result = await publishDraft({
      db,
      productId: draft.id,
      user: { uid: "admin-test", email: "admin@test.invalid" },
      catalogPath,
    });
    const snapshot = JSON.parse(await readFile(catalogPath, "utf8"));
    assert.equal(result.productCount, 1);
    assert.equal(snapshot.products[0].id, draft.id);
    assert.equal(snapshot.products[0].status, "published");
    assert.equal(db.read("productDrafts", draft.id), undefined);
    assert.equal(db.read("productFamilies", draft.id).status, "published");
    assert.equal(db.read("catalogReleases", result.releaseId).status, "active");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("snapshot yalnız yayımlanmış aileleri içerir ve eski dosyayı atomik yeniler", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "karahanli-snapshot-"));
  const catalogPath = path.join(root, "products.json");
  const published = product({ id: "family-published", slug: "published", status: "published" });
  const archived = product({ id: "family-archived", slug: "archived", status: "archived" });
  const db = new FakeDb({ productFamilies: { [published.id]: published, [archived.id]: archived } });

  try {
    await rebuildPublicSnapshot({ db, catalogPath, releaseId: "release-test" });
    const snapshot = JSON.parse(await readFile(catalogPath, "utf8"));
    assert.deepEqual(snapshot.products.map((item) => item.id), [published.id]);
    assert.equal(snapshot.generatedFrom, "Firebase Firestore productFamilies");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
