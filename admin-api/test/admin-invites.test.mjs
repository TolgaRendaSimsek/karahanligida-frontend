import assert from "node:assert/strict";
import test from "node:test";
import { createAdminInvite, claimAdminInvite } from "../src/admin-invites.mjs";

function fakeDb() {
  const documents = new Map();
  const ref = (id) => ({
    id,
    async get() { return { exists: documents.has(id), data: () => documents.get(id) }; },
    async set(value) { documents.set(id, structuredClone(value)); },
    async update(value) { documents.set(id, { ...documents.get(id), ...structuredClone(value) }); },
  });
  return {
    documents,
    collection() { return { doc: ref }; },
    async runTransaction(callback) {
      await callback({
        get: (reference) => reference.get(),
        update: (reference, value) => reference.update(value),
      });
    },
  };
}

test("Google admin daveti ilk kullanımda claim verir", async () => {
  const db = fakeDb();
  await createAdminInvite(db, " NEW@Example.com ", { uid: "owner", email: "owner@example.com" });
  const auth = {
    async getUser() { return { customClaims: { editor: true } }; },
    async setCustomUserClaims(uid, claims) { this.uid = uid; this.claims = claims; },
  };
  const result = await claimAdminInvite({ db, auth, user: { uid: "new-user", email: "new@example.com" } });
  assert.equal(result.email, "new@example.com");
  assert.deepEqual(auth.claims, { editor: true, admin: true });
  assert.equal([...db.documents.values()][0].status, "accepted");
});

test("davetsiz Google hesabı admin olamaz", async () => {
  const db = fakeDb();
  await assert.rejects(
    claimAdminInvite({ db, auth: {}, user: { uid: "x", email: "none@example.com" } }),
    { code: "invite-required", status: 403 },
  );
});
