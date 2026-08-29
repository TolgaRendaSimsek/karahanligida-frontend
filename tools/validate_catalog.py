#!/usr/bin/env python3
"""Normalize katalog verisini, görselleri ve Next.js rota yapısını doğrular."""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")


ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data" / "products.json"
ARCHIVE = ROOT / "data" / "catalog-archive.json"
MANIFEST = ROOT / "data" / "catalog-manifest.json"
REQUIRED = {
    "id",
    "slug",
    "brand",
    "name",
    "category",
    "subcategory",
    "summary",
    "description",
    "features",
    "specifications",
    "images",
    "variants",
    "source",
    "featured",
    "status",
}
EXPECTED_CATALOGS = {
    "favori1.pdf",
    "FO HORECA 37 .yıl.pdf",
    "Kimbo 2025 New Katalog.pdf",
    "KROOM MUTFAK .pdf",
    "OCHAY TANITIM.pdf",
    "Toschi 2025 New Katalog.pdf",
    "YOOK_Brochure.pdf",
}


def fail(errors: list[str], message: str) -> None:
    errors.append(message)


def main() -> int:
    errors: list[str] = []
    if not DATA.exists() or not MANIFEST.exists():
        print("Katalog verisi bulunamadı. Önce tools/build_catalog.py çalıştırın.", file=sys.stderr)
        return 1

    payload = json.loads(DATA.read_text(encoding="utf-8"))
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    products = payload.get("products", [])
    archived_products = json.loads(ARCHIVE.read_text(encoding="utf-8")).get("products", []) if ARCHIVE.exists() else []
    ids: set[str] = set()
    slugs: set[str] = set()
    assets: set[str] = set()
    covered_catalogs: set[str] = set()

    for product in [*products, *archived_products]:
        missing = REQUIRED - product.keys()
        if missing:
            fail(errors, f"{product.get('slug', '?')}: eksik alanlar {sorted(missing)}")
        unknown = product.keys() - REQUIRED
        if unknown:
            fail(errors, f"{product.get('slug', '?')}: public şemada bilinmeyen alanlar {sorted(unknown)}")
        if "price" in json.dumps(product, ensure_ascii=False).lower():
            fail(errors, f"{product.get('slug', '?')}: fiyat alanı/metni içeriyor")
        if product.get("id") in ids:
            fail(errors, f"Tekrarlanan id: {product.get('id')}")
        ids.add(product.get("id"))
        slug = product.get("slug", "")
        if slug in slugs or not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", slug):
            fail(errors, f"Geçersiz/tekrarlanan slug: {slug}")
        slugs.add(slug)
        if not product.get("variants"):
            fail(errors, f"{slug}: varyant/model bulunmuyor")
        source = product.get("source", {})
        if set(source) != {"catalog", "pages"} or not source.get("pages"):
            fail(errors, f"{slug}: PDF kaynak sayfası bulunmuyor")
        covered_catalogs.add(source.get("catalog"))
        for image in product.get("images", []):
            required_image_fields = {
                "id",
                "src",
                "thumbnailSrc",
                "alt",
                "order",
                "variantIds",
            }
            if missing_image_fields := required_image_fields - image.keys():
                fail(errors, f"{slug}: görsel alanları eksik {sorted(missing_image_fields)}")
            if unknown_image_fields := image.keys() - required_image_fields:
                fail(errors, f"{slug}: public görselde bilinmeyen alanlar {sorted(unknown_image_fields)}")
            for field in ("src", "thumbnailSrc"):
                asset = image.get(field, "")
                if asset.startswith(("http://", "https://", "/media/")):
                    continue
                path = ROOT / asset
                if not path.is_file():
                    fail(errors, f"{slug}: görsel bulunamadı {path}")
                assets.add(asset)
        if not product.get("images"):
            fail(errors, f"{slug}: galeri görseli bulunmuyor")
        orders = [image.get("order") for image in product.get("images", [])]
        if orders != list(range(1, len(orders) + 1)):
            fail(errors, f"{slug}: galeri sıralaması geçersiz")

    if not covered_catalogs.issubset(EXPECTED_CATALOGS):
        fail(errors, f"Katalog kapsamı dışında kaynak var: {sorted(covered_catalogs - EXPECTED_CATALOGS)}")
    if set(manifest.get("catalogs", [])) != EXPECTED_CATALOGS:
        fail(errors, "Kaynak manifest katalog listesi hatalı")

    manifest_assets = {
        asset
        for item in manifest.get("items", [])
        for asset in item.get("assets", [])
    }
    if not assets.issubset(manifest_assets):
        fail(errors, "Ürün verisindeki bir görsel kaynak manifestte bulunmuyor")
    disk_assets = {
        path.relative_to(ROOT).as_posix()
        for path in (ROOT / "assets" / "products").rglob("*")
        if path.is_file()
    }
    if not assets.issubset(disk_assets):
        fail(errors, f"Eksik ürün görseli var: {sorted(assets - disk_assets)[:10]}")

    dynamic_route = ROOT / "app" / "(store)" / "urunler" / "[slug]" / "page.tsx"
    if not dynamic_route.is_file():
        fail(errors, "Next.js dinamik ürün rotası bulunamadı")
    if not (ROOT / "next.config.ts").is_file():
        fail(errors, "Next.js yönlendirme yapılandırması bulunamadı")

    static_html = [*ROOT.glob("*.html")]
    legacy_product_dir = ROOT / "urunler"
    if legacy_product_dir.exists():
        static_html.extend(legacy_product_dir.glob("*.html"))
    if static_html:
        fail(
            errors,
            "Eski statik HTML dosyaları kalmış: "
            + ", ".join(path.relative_to(ROOT).as_posix() for path in static_html[:10]),
        )

    if errors:
        print("\n".join(f"ERROR: {error}" for error in errors), file=sys.stderr)
        return 1
    print(
        f"OK: {len(products)} aile, "
        f"{sum(len(p['variants']) for p in products)} varyant/model, "
        f"{len(assets)} optimize görsel, 7 katalog doğrulandı."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
