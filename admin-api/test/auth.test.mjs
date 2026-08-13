import test from "node:test";
import assert from "node:assert/strict";
import { createRequireAdmin, createRequireGoogleUser } from "../src/auth.mjs";

const googleToken = {
  uid: "u1",
  email: "admin@example.com",
  email_verified: true,
  firebase: { sign_in_provider: "google.com" },
};

function responseRecorder() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

test("token bulunmayan isteği 401 ile reddeder", async () => {
  const middleware = createRequireAdmin({ verifyIdToken() {} });
  const response = responseRecorder();
  await middleware({ headers: {} }, response, () => assert.fail("next çağrılmamalı"));
  assert.equal(response.statusCode, 401);
});

test("admin claim bulunmayan isteği 403 ile reddeder", async () => {
  const middleware = createRequireAdmin({ verifyIdToken: async () => ({ ...googleToken, admin: false }) });
  const response = responseRecorder();
  await middleware({ headers: { authorization: "Bearer token" } }, response, () => assert.fail("next çağrılmamalı"));
  assert.equal(response.statusCode, 403);
});

test("admin tokenini doğrular ve kullanıcıyı isteğe ekler", async () => {
  const middleware = createRequireAdmin({
    verifyIdToken: async () => ({ ...googleToken, admin: true }),
  });
  const request = { headers: { authorization: "Bearer token" } };
  const response = responseRecorder();
  let continued = false;
  await middleware(request, response, () => { continued = true; });
  assert.equal(continued, true);
  assert.equal(request.admin.email, "admin@example.com");
});

test("parola sağlayıcısıyla alınmış admin tokenini reddeder", async () => {
  const middleware = createRequireAdmin({
    verifyIdToken: async () => ({ ...googleToken, admin: true, firebase: { sign_in_provider: "password" } }),
  });
  const response = responseRecorder();
  await middleware({ headers: { authorization: "Bearer token" } }, response, () => assert.fail("next çağrılmamalı"));
  assert.equal(response.statusCode, 403);
});

test("doğrulanmış Google kullanıcısını davet kabul akışına geçirir", async () => {
  const middleware = createRequireGoogleUser({ verifyIdToken: async () => googleToken });
  const request = { headers: { authorization: "Bearer token" } };
  const response = responseRecorder();
  let continued = false;
  await middleware(request, response, () => { continued = true; });
  assert.equal(continued, true);
  assert.equal(request.googleUser.email, "admin@example.com");
});

test("iptal edilmiş tokeni yeniden giriş koduyla reddeder", async () => {
  const middleware = createRequireAdmin({
    verifyIdToken: async () => {
      throw Object.assign(new Error("revoked"), { code: "auth/id-token-revoked" });
    },
  });
  const response = responseRecorder();
  await middleware({ headers: { authorization: "Bearer revoked-token" } }, response, () => assert.fail("next çağrılmamalı"));
  assert.equal(response.statusCode, 401);
  assert.equal(response.body.code, "session-revoked");
});

test("süresi dolan tokeni ayrı hata koduyla reddeder", async () => {
  const middleware = createRequireAdmin({
    verifyIdToken: async () => {
      throw Object.assign(new Error("expired"), { code: "auth/id-token-expired" });
    },
  });
  const response = responseRecorder();
  await middleware({ headers: { authorization: "Bearer expired-token" } }, response, () => assert.fail("next çağrılmamalı"));
  assert.equal(response.statusCode, 401);
  assert.equal(response.body.code, "token-expired");
});

test("okunamayan Firebase credential hatasını oturum hatası gibi göstermez", async () => {
  const middleware = createRequireAdmin({
    verifyIdToken: async () => {
      throw Object.assign(new Error("permission denied"), { code: "EACCES" });
    },
  });
  const response = responseRecorder();
  await middleware({ headers: { authorization: "Bearer token" } }, response, () => assert.fail("next çağrılmamalı"));
  assert.equal(response.statusCode, 503);
  assert.equal(response.body.code, "firebase-unavailable");
});
