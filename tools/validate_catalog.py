#!/usr/bin/env python3
"""Normalize katalog verisini, görselleri ve statik ürün bağlantılarını doğrular."""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path
from urllib.parse import unquote, urlsplit

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")


ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data" / "products.json"
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
    ids: set[str] = set()
    slugs: set[str] = set()
    assets: set[str] = set()
    covered_catalogs: set[str] = set()

    for product in products:
        missing = REQUIRED - product.keys()
        if missing:
            fail(errors, f"{product.get('slug', '?')}: eksik alanlar {sorted(missing)}")
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
        if source.get("type") != "pdf" or not source.get("pages"):
            fail(errors, f"{slug}: PDF kaynak sayfası bulunmuyor")
        covered_catalogs.add(source.get("catalog"))
        for image in product.get("images", []):
            path = ROOT / image.get("src", "")
            if not path.is_file():
                fail(errors, f"{slug}: görsel bulunamadı {path}")
            assets.add(image.get("src"))

    if covered_catalogs != EXPECTED_CATALOGS:
        fail(errors, f"Katalog kapsamı eksik/fazla: {sorted(covered_catalogs ^ EXPECTED_CATALOGS)}")
    if set(manifest.get("catalogs", [])) != EXPECTED_CATALOGS:
        fail(errors, "Kaynak manifest katalog listesi hatalı")

    manifest_assets = {
        asset
        for item in manifest.get("items", [])
        for asset in item.get("assets", [])
    }
    if assets != manifest_assets:
        fail(errors, "Ürün verisi ve kaynak manifest görselleri eşleşmiyor")
    disk_assets = {
        path.relative_to(ROOT).as_posix()
        for path in (ROOT / "assets" / "products").rglob("*")
        if path.is_file()
    }
    if disk_assets != assets:
        fail(errors, f"Sahipsiz veya eksik ürün görseli var: {sorted(disk_assets ^ assets)[:10]}")

    if (ROOT / "urunler").exists():
        for slug in slugs:
            if not (ROOT / "urunler" / f"{slug}.html").is_file():
                fail(errors, f"Ürün detay sayfası bulunamadı: {slug}")

    for html_path in [*ROOT.glob("*.html"), *(ROOT / "urunler").glob("*.html")]:
        html = html_path.read_text(encoding="utf-8")
        for raw_url in re.findall(r"""(?:href|src)=["']([^"']+)["']""", html):
            parsed = urlsplit(raw_url)
            if parsed.scheme or raw_url.startswith(("#", "mailto:", "tel:", "javascript:")):
                continue
            relative = unquote(parsed.path)
            if not relative:
                continue
            target = (html_path.parent / relative).resolve()
            if target.is_dir():
                target = target / "index.html"
            if not target.exists():
                fail(errors, f"Kırık yerel bağlantı: {html_path.relative_to(ROOT)} -> {raw_url}")

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
