import test from "node:test";
import assert from "node:assert/strict";
import { createRequireAdmin } from "../src/auth.mjs";

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
  const middleware = createRequireAdmin({ verifyIdToken: async () => ({ uid: "u1", admin: false }) });
  const response = responseRecorder();
  await middleware({ headers: { authorization: "Bearer token" } }, response, () => assert.fail("next çağrılmamalı"));
  assert.equal(response.statusCode, 403);
});

test("admin tokenini doğrular ve kullanıcıyı isteğe ekler", async () => {
  const middleware = createRequireAdmin({
    verifyIdToken: async () => ({ uid: "u1", email: "admin@example.com", admin: true }),
  });
  const request = { headers: { authorization: "Bearer token" } };
  const response = responseRecorder();
  let continued = false;
  await middleware(request, response, () => { continued = true; });
  assert.equal(continued, true);
  assert.equal(request.admin.email, "admin@example.com");
});
