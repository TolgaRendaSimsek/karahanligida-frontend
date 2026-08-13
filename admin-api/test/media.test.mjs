import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import sharp from "sharp";
import { assertProductId, cleanupExpiredTrash, processUpload } from "../src/media.mjs";

test("dizin geçişi içeren ürün kimliğini reddeder", () => {
  assert.throws(() => assertProductId("../../etc"), /Geçersiz ürün kimliği/);
});

test("görsel olmayan dosyayı reddeder", async () => {
  await assert.rejects(
    processUpload({
      buffer: Buffer.from("not-an-image"),
      productId: "family-media-test",
      mediaRoot: await mkdtemp(join(tmpdir(), "karahanli-")),
    }),
    /Yalnızca JPEG, PNG, WebP veya AVIF/,
  );
});

test("yüklenen görseli tam ve küçük WebP olarak üretir", async () => {
  const mediaRoot = await mkdtemp(join(tmpdir(), "karahanli-"));
  const buffer = await sharp({
    create: { width: 640, height: 480, channels: 3, background: "#c99a63" },
  }).png().toBuffer();
  const result = await processUpload({
    buffer,
    productId: "family-media-test",
    mediaRoot,
    mimeType: "image/png",
  });
  assert.match(result.src, /-full\.webp$/);
  assert.match(result.thumbnailSrc, /-thumb\.webp$/);
  const full = await readFile(join(mediaRoot, result.src.replace("/media/", "")));
  assert.equal((await sharp(full).metadata()).format, "webp");
  assert.equal(result.source.originalName, undefined);
  assert.equal(result.alt, "Ürün görseli");
});

test("MIME türü ile dosya imzası eşleşmeyen görseli reddeder", async () => {
  const buffer = await sharp({
    create: { width: 320, height: 320, channels: 3, background: "#ffffff" },
  }).png().toBuffer();
  await assert.rejects(
    processUpload({
      buffer,
      productId: "family-media-test",
      mediaRoot: await mkdtemp(join(tmpdir(), "karahanli-")),
      mimeType: "image/jpeg",
    }),
    /MIME türü ile görsel imzası eşleşmiyor/,
  );
});

test("TIFF imzasını Sharp işleminden önce reddeder", async () => {
  const buffer = await sharp({
    create: { width: 320, height: 320, channels: 3, background: "#ffffff" },
  }).tiff().toBuffer();
  await assert.rejects(
    processUpload({
      buffer,
      productId: "family-media-test",
      mediaRoot: await mkdtemp(join(tmpdir(), "karahanli-")),
      mimeType: "image/tiff",
    }),
    /Yalnızca JPEG, PNG, WebP veya AVIF/,
  );
});

test("30 günden eski medya çöpünü temizler", async () => {
  const mediaRoot = await mkdtemp(join(tmpdir(), "karahanli-"));
  const oldTrash = join(mediaRoot, ".trash", "2025-01-01", "family-test");
  const freshTrash = join(mediaRoot, ".trash", "2026-08-01", "family-test");
  await Promise.all([mkdir(oldTrash, { recursive: true }), mkdir(freshTrash, { recursive: true })]);
  const removed = await cleanupExpiredTrash({ mediaRoot, retentionDays: 30, now: Date.parse("2026-08-13T12:00:00Z") });
  assert.deepEqual(removed, ["2025-01-01"]);
  await assert.rejects(stat(oldTrash), { code: "ENOENT" });
  assert.equal((await stat(freshTrash)).isDirectory(), true);
});
