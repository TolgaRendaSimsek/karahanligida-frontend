#!/usr/bin/env python3
"""Karahanlı Gıda PDF kataloglarını normalize JSON ve WebP varlıklara dönüştürür."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import shutil
import sys
import unicodedata
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

from PIL import Image, ImageOps
from pypdf import PdfReader

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")


REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_SOURCE = REPO_ROOT.parent / "Ürünler"
DATA_PATH = REPO_ROOT / "data" / "products.json"
MANIFEST_PATH = REPO_ROOT / "data" / "catalog-manifest.json"
CURATION_PATH = REPO_ROOT / "data" / "image-curation.json"
ASSET_ROOT = REPO_ROOT / "assets" / "products"


@dataclass(frozen=True)
class FamilySpec:
    pdf: str
    brand: str
    name: str
    category: str
    subcategory: str
    pages: tuple[int, ...]
    variants: tuple[tuple[str, str], ...] = ()
    summary: str = ""
    featured: bool = False


def slugify(value: str) -> str:
    table = str.maketrans(
        {
            "ı": "i",
            "İ": "i",
            "ğ": "g",
            "Ğ": "g",
            "ü": "u",
            "Ü": "u",
            "ş": "s",
            "Ş": "s",
            "ö": "o",
            "Ö": "o",
            "ç": "c",
            "Ç": "c",
        }
    )
    value = unicodedata.normalize("NFKD", value.translate(table))
    value = "".join(ch for ch in value if not unicodedata.combining(ch))
    return re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")[:96]


def clean(value: str) -> str:
    value = value.replace("\x00", " ").replace("\ufffd", "")
    value = re.sub(r"\s+", " ", value).strip()
    value = re.sub(r"\bFiyat\b", "", value, flags=re.IGNORECASE)
    return re.sub(r"\s{2,}", " ", value).strip(" |")


def lines_for(reader: PdfReader, page_number: int) -> list[str]:
    text = reader.pages[page_number - 1].extract_text() or ""
    return [clean(line) for line in text.splitlines() if clean(line)]


def image_fingerprint(image: Image.Image) -> str:
    sample = ImageOps.fit(image.convert("RGB"), (48, 48), method=Image.Resampling.LANCZOS)
    return hashlib.sha256(sample.tobytes()).hexdigest()


def useful_product_images(reader: PdfReader, pages: Iterable[int]) -> list[tuple[Image.Image, str, int]]:
    candidates: list[tuple[float, Image.Image, str, int]] = []
    for page_number in pages:
        for item in reader.pages[page_number - 1].images:
            try:
                image = ImageOps.exif_transpose(item.image.copy())
                width, height = image.size
                if width < 150 or height < 150:
                    continue
                ratio = width / height
                if ratio > 3.2 or ratio < 0.13:
                    continue
                shape_bonus = 1.35 if 0.28 <= ratio <= 1.45 else 0.55
                score = width * height * shape_bonus
                if image.mode not in {"RGB", "RGBA"}:
                    image = image.convert("RGB")
                candidates.append((score, image, item.name, page_number))
            except Exception:
                continue
    candidates.sort(key=lambda row: row[0], reverse=True)
    unique: list[tuple[Image.Image, str, int]] = []
    fingerprints: set[str] = set()
    for score, image, name, page in candidates:
        fingerprint = image_fingerprint(image)
        if fingerprint in fingerprints:
            continue
        fingerprints.add(fingerprint)
        unique.append((image, name, page))
        if len(unique) == 8:
            break
    return unique


def render_assets(
    reader: PdfReader,
    pages: tuple[int, ...],
    target: Path,
    curation: dict | None = None,
) -> tuple[list[dict], list[dict]]:
    curation = curation or {}
    images = useful_product_images(reader, pages)
    excluded = {
        (row.get("page"), row.get("pdfObject"))
        for row in curation.get("exclude", [])
    }
    images = [
        row for row in images if (row[2], row[1]) not in excluded
    ]
    expanded: list[tuple[Image.Image, str, int, list[str], list[int] | None]] = []
    for image, name, page in images:
        crop_rules = [
            rule
            for rule in curation.get("crops", [])
            if rule.get("page") == page and rule.get("pdfObject") == name
        ]
        if not crop_rules:
            variant_ids = curation.get("variantMap", {}).get(f"{page}:{name}", [])
            expanded.append((image, name, page, variant_ids, None))
            continue
        for rule in crop_rules:
            box = rule.get("box", [])
            if len(box) != 4:
                raise ValueError(f"{target.name}: geçersiz kırpma kutusu {box}")
            left, top, right, bottom = [int(value) for value in box]
            if not (0 <= left < right <= image.width and 0 <= top < bottom <= image.height):
                raise ValueError(f"{target.name}: görsel dışında kırpma kutusu {box}")
            expanded.append(
                (
                    image.crop((left, top, right, bottom)),
                    name,
                    page,
                    rule.get("variantIds", []),
                    [left, top, right, bottom],
                )
            )
    images = expanded
    if not images:
        canvas = Image.new("RGB", (1200, 900), "#f4f0e8")
        images = [(canvas, "catalog-page-fallback", pages[0], [], None)]

    target.mkdir(parents=True, exist_ok=True)
    gallery: list[dict] = []
    manifest: list[dict] = []
    for index, (image, name, page, variant_ids, crop) in enumerate(images, 1):
        image_id = f"image-{index:02d}"
        full = target / f"{image_id}.webp"
        thumb = target / f"{image_id}-thumb.webp"
        canvas = Image.new("RGB", (1200, 900), "#ffffff")
        contained = ImageOps.contain(image.convert("RGB"), (1120, 820), Image.Resampling.LANCZOS)
        canvas.paste(contained, ((1200 - contained.width) // 2, (900 - contained.height) // 2))
        canvas.save(full, "WEBP", quality=86, method=6)
        ImageOps.fit(canvas, (480, 360), method=Image.Resampling.LANCZOS).save(
            thumb, "WEBP", quality=80, method=6
        )
        source = {"type": "pdf", "page": page, "pdfObject": name}
        if crop:
            source["crop"] = crop
        gallery.append(
            {
                "id": image_id,
                "src": full.relative_to(REPO_ROOT).as_posix(),
                "thumbnailSrc": thumb.relative_to(REPO_ROOT).as_posix(),
                "order": index,
                "variantIds": variant_ids,
                "source": source,
            }
        )
        manifest.append(source)
    return gallery, manifest


def extract_features(lines: list[str]) -> list[str]:
    features: list[str] = []
    for line in lines:
        value = clean(line.lstrip("-•* "))
        if line[:1] in {"-", "•", "*"} and 12 <= len(value) <= 190:
            if value not in features:
                features.append(value)
        if len(features) == 6:
            break
    return features


def extract_specifications(lines: list[str]) -> dict[str, str]:
    specs: dict[str, str] = {}
    allowed = (
        "Kapasite",
        "Güç",
        "Boyut",
        "Ağırlık",
        "Hazne",
        "Hacim",
        "İç Sıcaklık",
        "Ürün Kodu",
        "EAN code",
        "Koli İçeriği",
    )
    for line in lines:
        value = clean(line.lstrip("-•* "))
        if ":" not in value:
            continue
        key, content = [clean(part) for part in value.split(":", 1)]
        if content and any(key.casefold().startswith(item.casefold()) for item in allowed):
            specs.setdefault(key, content[:160])
        if len(specs) == 8:
            break
    return specs


def variants_from_lines(lines: list[str], family_name: str) -> list[dict]:
    variants: list[dict] = []
    seen: set[str] = set()

    for line in lines:
        codes = re.findall(r"\b\d{6}\b", line)
        codes.extend(re.findall(r"Ürün Kodu:\s*(\d{5})\b", line, flags=re.IGNORECASE))
        for code in codes:
            if code in seen:
                continue
            seen.add(code)
            variants.append({"id": f"model-{code}", "name": f"Model {code}", "code": code, "attributes": {}})

    if not variants:
        for line in lines:
            coded = re.match(r"^([A-Z]{1,3}\d+[A-Z]?)\s+(.+)$", line)
            if coded and 3 <= len(coded.group(2)) <= 120:
                code, name = coded.groups()
                if code not in seen:
                    seen.add(code)
                    variants.append(
                        {
                            "id": slugify(code),
                            "name": clean(name),
                            "code": code,
                            "attributes": {},
                        }
                    )
                continue
            if line.startswith(("-", "•", "*")) or len(line) > 125:
                continue
            if " - " not in line or re.search(r"\b(Fiyat|Model Ürün|İçindekiler)\b", line, re.I):
                continue
            left = clean(line.split(" - ", 1)[0])
            if not re.search(r"[A-Za-zÇĞİÖŞÜçğıöşü]", left):
                continue
            code = slugify(left)[:48]
            if code and code not in seen:
                seen.add(code)
                variants.append({"id": code, "name": clean(line)[:150], "code": left[:64], "attributes": {}})
            if len(variants) == 300:
                break

    if not variants:
        code = slugify(family_name)[:48]
        variants.append({"id": code, "name": "Katalog seçeneği", "code": "", "attributes": {}})
    return variants


def manual_specs() -> list[FamilySpec]:
    return [
        FamilySpec(
            "favori1.pdf",
            "Favori Fresh",
            "Donuk Meyve Suları ve Limonatalar",
            "İçecekler",
            "Donuk meyve içecekleri",
            (8,),
            (
                ("portakal-suyu", "Portakal Suyu"),
                ("limon-suyu", "Limon Suyu"),
                ("nar-suyu", "Nar Suyu"),
                ("greyfurt-suyu", "Greyfurt Suyu"),
                ("karadut-suyu", "Karadut Suyu"),
                ("limonata-ozutu", "Limonata Özütü"),
                ("bodrum-mandalina-limonatasi", "Bodrum Mandalina Limonatası"),
            ),
            "Soğuk sıkım ve dondurma yöntemiyle hazırlanan meyve suyu ve limonata seçenekleri.",
            True,
        ),
        FamilySpec("FO HORECA 37 .yıl.pdf", "FO", "Kokteyl Şurupları", "Şurup ve Püreler", "Kokteyl şurupları", (5, 6), featured=True),
        FamilySpec("FO HORECA 37 .yıl.pdf", "FO", "Meyveli Şuruplar", "Şurup ve Püreler", "Meyveli şuruplar", (7,)),
        FamilySpec("FO HORECA 37 .yıl.pdf", "FO", "Soğuk Çay Şurupları", "Şurup ve Püreler", "Soğuk çay şurupları", (8, 10, 14)),
        FamilySpec("FO HORECA 37 .yıl.pdf", "FO", "Aromalı Kokteyl Bazları", "Şurup ve Püreler", "Kokteyl bazları", (9,)),
        FamilySpec("FO HORECA 37 .yıl.pdf", "FO", "Simli Şuruplar", "Şurup ve Püreler", "Simli şuruplar", (11, 12, 13)),
        FamilySpec("FO HORECA 37 .yıl.pdf", "FO", "Botanical Cordial Serisi", "Şurup ve Püreler", "Botanik cordial", (15,)),
        FamilySpec("FO HORECA 37 .yıl.pdf", "FO", "Aromatik Bitter Sos", "Soslar", "Bitter sos", (16,)),
        FamilySpec("FO HORECA 37 .yıl.pdf", "FO", "Vegan Kokteyl Köpürtücü", "Bar Ürünleri", "Kokteyl köpürtücü", (17,)),
        FamilySpec("FO HORECA 37 .yıl.pdf", "FO", "Profesyonel Soslar", "Soslar", "Profesyonel soslar", (19, 20)),
        FamilySpec("FO HORECA 37 .yıl.pdf", "FO", "Premium Soslar", "Soslar", "Premium soslar", (21,)),
        FamilySpec("FO HORECA 37 .yıl.pdf", "FO", "Özel Soslar", "Soslar", "Özel soslar", (23, 27)),
        FamilySpec("FO HORECA 37 .yıl.pdf", "FO", "Meyve Püreleri", "Şurup ve Püreler", "Meyve püreleri", (24, 25)),
        FamilySpec("FO HORECA 37 .yıl.pdf", "FO", "Topping Sosları", "Soslar", "Topping sosları", (26,)),
        FamilySpec("FO HORECA 37 .yıl.pdf", "FO", "Mocktail Karışımları", "Bar Ürünleri", "Mocktail karışımları", (28,)),
        FamilySpec("FO HORECA 37 .yıl.pdf", "FO", "Meyveli Şuruplar Serisi", "Şurup ve Püreler", "Meyveli şuruplar", (29,)),
        FamilySpec("FO HORECA 37 .yıl.pdf", "FO", "Aromalı İçecek Tozları", "İçecekler", "İçecek tozları", (30,)),
        FamilySpec("FO HORECA 37 .yıl.pdf", "FO", "Donuk Meyveli İçecekler", "İçecekler", "Donuk içecekler", (31,)),
        FamilySpec("FO HORECA 37 .yıl.pdf", "FO", "Aromalı İçecek Bazları", "İçecekler", "İçecek bazları", (32, 33)),
        FamilySpec("FO HORECA 37 .yıl.pdf", "FO", "Sürülebilir Kremalar", "Soslar", "Sürülebilir krema", (34, 35)),
        FamilySpec("FO HORECA 37 .yıl.pdf", "FO", "Eclipse Sos", "Soslar", "Özel seri", (36, 37)),
        FamilySpec("FO HORECA 37 .yıl.pdf", "FO", "Yoğunlaştırılmış Süt", "İçecekler", "Yoğunlaştırılmış süt", (38,)),
        FamilySpec("Kimbo 2025 New Katalog.pdf", "Kimbo", "Horeca Çekirdek Kahveler", "Kahve", "Çekirdek kahve", (5, 6), featured=True),
        FamilySpec("Kimbo 2025 New Katalog.pdf", "Kimbo", "Horeca Filtre Kahveler", "Kahve", "Filtre kahve", (8,)),
        FamilySpec("Kimbo 2025 New Katalog.pdf", "Kimbo", "Nespresso Uyumlu Kapsüller", "Kahve", "Kapsül kahve", (10,)),
        FamilySpec("Kimbo 2025 New Katalog.pdf", "Kimbo", "Blue Uyumlu Kapsüller", "Kahve", "Kapsül kahve", (11,)),
        FamilySpec("Kimbo 2025 New Katalog.pdf", "Kimbo", "Retail Çekirdek Kahveler", "Kahve", "Çekirdek kahve", (12,)),
        FamilySpec("Kimbo 2025 New Katalog.pdf", "Kimbo", "Retail Filtre Kahveler", "Kahve", "Filtre kahve", (13,)),
        FamilySpec(
            "OCHAY TANITIM.pdf",
            "Oçay",
            "Klasik Bitki Çayları",
            "Çay",
            "Bitki çayı",
            (2, 3, 4, 5, 6, 7),
            tuple((slugify(name), name) for name in ("Ihlamur Çayı", "Adaçayı", "Mavi Kelebek Çayı", "Hibiskus Çayı", "Melisa Çayı", "Kuşburnu Çayı", "Rezene Çayı", "Papatya Çayı", "Yeşil Çay", "Beyaz Çay", "Oolong Çayı")),
            featured=True,
        ),
        FamilySpec(
            "OCHAY TANITIM.pdf",
            "Oçay",
            "Fonksiyonel Çaylar",
            "Çay",
            "Fonksiyonel çay",
            (8, 9, 10, 11, 12),
            tuple((slugify(name), name) for name in ("Relax Çayı", "Kış Çayı", "Nefes Çayı", "Mide Dostu Çayı", "Detox Çayı", "Fit Çayı", "Enerji Çayı", "Uyku Çayı")),
        ),
        FamilySpec(
            "OCHAY TANITIM.pdf",
            "Oçay",
            "Rooibos Çayları",
            "Çay",
            "Rooibos",
            (13, 14, 15),
            tuple((slugify(name), name) for name in ("Rooibos Çayı", "Bergamotlu Rooibos", "Elmalı Rooibos", "Vanilyalı Rooibos", "Vanilyalı & Çikolatalı Rooibos", "Balkabaklı & Tarçınlı Rooibos")),
        ),
        FamilySpec(
            "OCHAY TANITIM.pdf",
            "Oçay",
            "Matcha Çayları",
            "Çay",
            "Matcha",
            (16, 17, 18),
            tuple((slugify(name), name) for name in ("Matcha Çayı", "Naneli Matcha", "Hindistan Cevizli Matcha", "Çilekli Matcha", "Şeftalili Matcha")),
        ),
        FamilySpec("Toschi 2025 New Katalog.pdf", "Toschi", "Şuruplar 1 L", "Şurup ve Püreler", "Şurup", (9, 10, 11), featured=True),
        FamilySpec("Toschi 2025 New Katalog.pdf", "Toschi", "Soslar 1 kg", "Soslar", "Sos", (15,)),
        FamilySpec("Toschi 2025 New Katalog.pdf", "Toschi", "Barista Sos 2 kg", "Soslar", "Barista sos", (16,)),
        FamilySpec("Toschi 2025 New Katalog.pdf", "Toschi", "Barista Sos 500 g", "Soslar", "Barista sos", (17,)),
        FamilySpec("Toschi 2025 New Katalog.pdf", "Toschi", "Püreler 1,3 kg", "Şurup ve Püreler", "Püre", (19,)),
        FamilySpec(
            "YOOK_Brochure.pdf",
            "YOOK",
            "Barista Yulaf İçecekleri",
            "Bitkisel İçecekler",
            "Barista yulaf içeceği",
            (4, 5),
            (("barista", "Barista Yulaf İçeceği"), ("organic-barista", "Organik Barista Yulaf İçeceği"), ("orange-cardamom", "Portakal ve Kakule Aromalı Barista Yulaf İçeceği")),
            featured=True,
        ),
        FamilySpec("YOOK_Brochure.pdf", "YOOK", "Vitamin ve Kalsiyumlu Yulaf İçeceği", "Bitkisel İçecekler", "Yulaf içeceği", (6,)),
        FamilySpec(
            "YOOK_Brochure.pdf",
            "YOOK",
            "Aromalı Yulaf İçecekleri",
            "Bitkisel İçecekler",
            "Aromalı yulaf içeceği",
            (7,),
            (("chocolate", "Çikolatalı Yulaf İçeceği"), ("mango", "Mangolu Yulaf İçeceği")),
        ),
    ]


KROOM_SECTIONS = [
    (5, 15, "Buz Makineleri"),
    (16, 21, "Espresso Makineleri ve Değirmenler"),
    (22, 30, "Kahve Değirmenleri"),
    (31, 39, "Süper Otomatik Espresso Makineleri"),
    (40, 41, "Süt Soğutucular"),
    (42, 54, "Filtre Kahve Makineleri"),
    (55, 63, "Bar Ekipmanları"),
    (64, 67, "Mikrodalga ve Hızlı Fırınlar"),
    (68, 122, "Fırınlar"),
    (123, 153, "Pişirme Üniteleri"),
    (154, 166, "Soğutucular"),
    (167, 174, "Bulaşık Makineleri"),
    (175, 204, "Hazırlık Ekipmanları"),
    (205, 207, "Diğer Ekipmanlar"),
    (208, 213, "Buzdolapları ve Derin Dondurucular"),
]


DIVIDER_PAGES = {5, 16, 22, 31, 40, 42, 55, 62, 64, 68, 77, 101, 114, 123, 154, 167, 175, 205, 208}


def kroom_specs(reader: PdfReader) -> list[FamilySpec]:
    result: list[FamilySpec] = []
    featured_sections: set[str] = set()
    for start, end, section in KROOM_SECTIONS:
        for page in range(start, end + 1):
            if page in DIVIDER_PAGES:
                continue
            lines = lines_for(reader, page)
            if not lines:
                continue
            heading = next(
                (
                    line
                    for line in lines
                    if not line.startswith(("-", "•", "*"))
                    and 6 < len(line) < 135
                    and not re.match(r"^(Model|Ürün Kodu|Kodu|Açıklama|[0-9:]+$)", line, re.I)
                ),
                f"{section} Katalog Modelleri",
            )
            heading = re.sub(r"\s*&\s*Fiyat.*$", "", heading, flags=re.I)
            short_name = clean(heading)
            if len(short_name) > 105:
                short_name = f"{section} — Katalog Sayfası {page}"
            featured = section not in featured_sections
            featured_sections.add(section)
            result.append(
                FamilySpec(
                    "KROOM MUTFAK .pdf",
                    "Kroom",
                    short_name,
                    "Endüstriyel Mutfak Ekipmanları",
                    section,
                    (page,),
                    summary=f"{section} grubundaki profesyonel kullanım modelleri.",
                    featured=featured,
                )
            )
    return result


def family_to_product(
    spec: FamilySpec,
    reader: PdfReader,
    sequence: int,
    resolved_slug: str | None = None,
    curation: dict | None = None,
) -> tuple[dict, dict]:
    all_lines: list[str] = []
    for page in spec.pages:
        all_lines.extend(lines_for(reader, page))
    slug_source = f"{spec.brand}-{spec.name}"
    if spec.brand == "Kroom":
        slug_source = f"{slug_source}-sayfa-{spec.pages[0]}"
    slug = resolved_slug or slugify(slug_source)
    asset_dir = ASSET_ROOT / slugify(spec.brand) / slug
    images, image_manifest = render_assets(reader, spec.pages, asset_dir, curation)
    variants = [
        {"id": variant_id, "name": name, "code": "", "attributes": {}}
        for variant_id, name in spec.variants
    ] or variants_from_lines(all_lines, spec.name)
    features = extract_features(all_lines)
    specifications = extract_specifications(all_lines)
    summary = spec.summary or f"{spec.brand} {spec.name} ürün ailesi ve katalogda yer alan seçenekleri."
    description = summary
    if features:
        description = f"{summary} Katalogda öne çıkan nitelikler: {'; '.join(features[:3])}."
    source = {
        "catalog": spec.pdf,
        "pages": list(spec.pages),
    }
    product = {
        "id": f"family-{sequence:04d}",
        "slug": slug,
        "brand": spec.brand,
        "name": spec.name,
        "category": spec.category,
        "subcategory": spec.subcategory,
        "summary": summary,
        "description": description,
        "features": features,
        "specifications": specifications,
        "images": [
            {
                **{key: value for key, value in image.items() if key != "source"},
                "alt": f"{spec.brand} {spec.name} - görsel {image['order']}",
            }
            for image in images
        ],
        "variants": variants,
        "source": source,
        "featured": spec.featured,
        "status": "published",
    }
    manifest = {
        "productId": product["id"],
        "slug": slug,
        "catalog": spec.pdf,
        "pages": list(spec.pages),
        "assets": [
            asset
            for image in images
            for asset in (image["src"], image["thumbnailSrc"])
        ],
        "originalImages": image_manifest,
    }
    return product, manifest


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, default=DEFAULT_SOURCE)
    parser.add_argument("--clean", action="store_true", help="Önce üretilmiş varlıkları siler")
    args = parser.parse_args()

    if args.clean and ASSET_ROOT.exists():
        resolved = ASSET_ROOT.resolve()
        if REPO_ROOT.resolve() not in resolved.parents:
            raise RuntimeError("Güvenli olmayan varlık yolu")
        shutil.rmtree(resolved)

    readers: dict[str, PdfReader] = {}
    curation = (
        json.loads(CURATION_PATH.read_text(encoding="utf-8")).get("products", {})
        if CURATION_PATH.exists()
        else {}
    )
    expected = {spec.pdf for spec in manual_specs()} | {"KROOM MUTFAK .pdf"}
    for filename in sorted(expected):
        path = args.source / filename
        if not path.exists():
            raise FileNotFoundError(path)
        readers[filename] = PdfReader(path)

    specs = manual_specs() + kroom_specs(readers["KROOM MUTFAK .pdf"])
    products: list[dict] = []
    manifest: list[dict] = []
    used_slugs: set[str] = set()
    for sequence, spec in enumerate(specs, 1):
        slug_source = f"{spec.brand}-{spec.name}"
        if spec.brand == "Kroom":
            slug_source = f"{slug_source}-sayfa-{spec.pages[0]}"
        base_slug = slugify(slug_source)
        resolved_slug = base_slug
        suffix = 2
        while resolved_slug in used_slugs:
            resolved_slug = f"{base_slug}-{suffix}"
            suffix += 1
        used_slugs.add(resolved_slug)
        product, source_row = family_to_product(
            spec,
            readers[spec.pdf],
            sequence,
            resolved_slug,
            curation.get(resolved_slug, {}),
        )
        products.append(product)
        manifest.append(source_row)

    DATA_PATH.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "schemaVersion": 1,
        "generatedFrom": "Karahanlı Gıda Ürünler klasöründeki 7 PDF katalog",
        "products": products,
    }
    DATA_PATH.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    MANIFEST_PATH.write_text(
        json.dumps({"catalogs": sorted(expected), "items": manifest}, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"{len(products)} ürün ailesi, {sum(len(p['variants']) for p in products)} varyant/model oluşturuldu.")


if __name__ == "__main__":
    main()
