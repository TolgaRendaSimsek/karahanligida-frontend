#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { applicationDefault, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const root = path.resolve(import.meta.dirname, "..");
const output = path.resolve(process.env.FIRESTORE_BACKUP_PATH || path.join(root, "data", "backups", `firestore-${new Date().toISOString().replaceAll(":", "-")}.json`));
const collections = ["productFamilies", "productDrafts", "categories", "brands", "catalogImports"];
if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) throw new Error("GOOGLE_APPLICATION_CREDENTIALS zorunludur.");
initializeApp({ credential: applicationDefault(), projectId: process.env.FIREBASE_PROJECT_ID || "karahanligida01" });
const db = getFirestore();
const snapshot = {};
for (const name of collections) {
  const result = await db.collection(name).get();
  snapshot[name] = result.docs.map((document) => ({ id: document.id, data: document.data() }));
}
await mkdir(path.dirname(output), { recursive: true });
await writeFile(output, `${JSON.stringify({ generatedAt: new Date().toISOString(), projectId: process.env.FIREBASE_PROJECT_ID || "karahanligida01", collections: snapshot }, (_key, value) => {
  if (value && typeof value.toDate === "function") return value.toDate().toISOString();
  return value;
}, 2)}\n`);
console.log(JSON.stringify({ output, collections: Object.fromEntries(collections.map((name) => [name, snapshot[name].length])) }, null, 2));
