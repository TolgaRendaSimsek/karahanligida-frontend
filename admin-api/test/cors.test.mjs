import test from "node:test";
import assert from "node:assert/strict";
import { createAdminCors } from "../src/cors.mjs";

function responseRecorder() {
  return {
    statusCode: 200,
    body: null,
    headers: {},
    ended: false,
    setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
    end() { this.ended = true; return this; },
  };
}

test("izin verilen origin için CORS ve preflight başlıklarını döndürür", () => {
  const middleware = createAdminCors("https://karahanligida.com");
  const response = responseRecorder();
  middleware(
    { method: "OPTIONS", headers: { origin: "https://karahanligida.com" } },
    response,
    () => assert.fail("preflight next çağırmamalı"),
  );
  assert.equal(response.statusCode, 204);
  assert.equal(response.ended, true);
  assert.equal(response.headers["access-control-allow-origin"], "https://karahanligida.com");
  assert.match(response.headers["access-control-allow-headers"], /Authorization/);
  assert.match(response.headers["access-control-allow-methods"], /DELETE/);
  assert.equal(response.headers.vary, "Origin");
});

test("başka origin üzerinden gelen isteği reddeder", () => {
  const middleware = createAdminCors("https://karahanligida.com");
  const response = responseRecorder();
  middleware(
    { method: "GET", headers: { origin: "https://example.com" } },
    response,
    () => assert.fail("reddedilen origin next çağırmamalı"),
  );
  assert.equal(response.statusCode, 403);
});

test("origin içermeyen sunucu isteğine izin verir", () => {
  const middleware = createAdminCors("https://karahanligida.com");
  const response = responseRecorder();
  let continued = false;
  middleware(
    { method: "GET", headers: {} },
    response,
    () => { continued = true; },
  );
  assert.equal(continued, true);
  assert.equal(response.headers.vary, "Origin");
});

test("izin verilen origin yapılandırması zorunludur", () => {
  assert.throws(() => createAdminCors(""), /ADMIN_ORIGIN/);
});
