import assert from "node:assert/strict";
import test from "node:test";
import { grantAdminByEmail, listAdminUsers, revokeAdminByUid } from "../src/admin-users.mjs";

function fakeAuth(seed) {
  const users = new Map(seed.map((user) => [user.uid, structuredClone(user)]));
  return {
    users,
    async listUsers() {
      return { users: [...users.values()] };
    },
    async getUser(uid) {
      const user = users.get(uid);
      if (!user) throw Object.assign(new Error("missing"), { code: "auth/user-not-found" });
      return user;
    },
    async getUserByEmail(email) {
      const user = [...users.values()].find((item) => item.email === email);
      if (!user) throw Object.assign(new Error("missing"), { code: "auth/user-not-found" });
      return user;
    },
    async setCustomUserClaims(uid, claims) {
      users.get(uid).customClaims = claims;
    },
    async revokeRefreshTokens(uid) {
      users.get(uid).revoked = true;
    },
  };
}

test("admin kullanıcıları listelenir ve e-postaya göre sıralanır", async () => {
  const auth = fakeAuth([
    { uid: "b", email: "z@example.com", customClaims: { admin: true } },
    { uid: "c", email: "user@example.com", customClaims: {} },
    { uid: "a", email: "a@example.com", customClaims: { admin: true } },
  ]);
  assert.deepEqual((await listAdminUsers(auth)).map((user) => user.uid), ["a", "b"]);
});

test("mevcut kullanıcıya diğer claimleri korunarak admin yetkisi verilir", async () => {
  const auth = fakeAuth([{ uid: "u1", email: "user@example.com", customClaims: { editor: true } }]);
  const admin = await grantAdminByEmail(auth, " USER@example.com ");
  assert.equal(admin.uid, "u1");
  assert.deepEqual(auth.users.get("u1").customClaims, { editor: true, admin: true });
});

test("kullanıcı kendi admin yetkisini kaldıramaz", async () => {
  const auth = fakeAuth([{ uid: "u1", email: "admin@example.com", customClaims: { admin: true } }]);
  await assert.rejects(() => revokeAdminByUid(auth, "u1", "u1"), { code: "self-revoke", status: 409 });
});

test("başka bir adminin yetkisi kaldırılır ve oturumları iptal edilir", async () => {
  const auth = fakeAuth([
    { uid: "u1", email: "first@example.com", customClaims: { admin: true } },
    { uid: "u2", email: "second@example.com", customClaims: { admin: true, editor: true } },
  ]);
  await revokeAdminByUid(auth, "u2", "u1");
  assert.deepEqual(auth.users.get("u2").customClaims, { editor: true });
  assert.equal(auth.users.get("u2").revoked, true);
});
