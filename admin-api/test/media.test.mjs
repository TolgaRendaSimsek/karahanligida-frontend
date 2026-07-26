import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import sharp from "sharp";
import { assertProductId, processUpload } from "../src/media.mjs";

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
    /geçerli bir görsel değil/,
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
    originalName: "ürün.png",
    mimeType: "image/png",
  });
  assert.match(result.src, /-full\.webp$/);
  assert.match(result.thumbnailSrc, /-thumb\.webp$/);
  const full = await readFile(join(mediaRoot, result.src.replace("/media/", "")));
  assert.equal((await sharp(full).metadata()).format, "webp");
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
