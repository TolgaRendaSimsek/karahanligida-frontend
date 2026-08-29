import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import sharp from "sharp";
import { auditCatalogMedia } from "../src/media-audit.mjs";

test("medya denetimi eksik ve sahipsiz dosyaları raporlar", async () => {
  const mediaRoot = await mkdtemp(join(tmpdir(), "karahanli-audit-"));
  const productDir = join(mediaRoot, "products", "family-audit-test");
  await mkdir(productDir, { recursive: true });
  const full = await sharp({ create: { width: 320, height: 240, channels: 4, background: { r: 20, g: 40, b: 30, alpha: 1 } } }).webp().toBuffer();
  await writeFile(join(productDir, "aaaaaaaaaaaaaaaa-full.webp"), full);
  await writeFile(join(productDir, "bbbbbbbbbbbbbbbb-full.webp"), full);
  const report = await auditCatalogMedia({
    mediaRoot,
    families: [{
      id: "family-audit-test",
      slug: "audit",
      name: "Denetim",
      images: [{ id: "image-1", src: "/media/products/family-audit-test/aaaaaaaaaaaaaaaa-full.webp", thumbnailSrc: "/media/products/family-audit-test/aaaaaaaaaaaaaaaa-thumb.webp" }],
    }],
  });
  assert.equal(report.summary.products, 1);
  assert.equal(report.summary.images, 1);
  assert.equal(report.summary.missingFiles, 1);
  assert.equal(report.summary.orphanFiles, 1);
  assert.equal(report.products[0].status, "file-missing");
});
