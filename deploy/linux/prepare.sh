#!/usr/bin/env sh
set -eu

APP_SOURCE="${1:-$(pwd)}"
BASE_DIR="${KARAHANLI_BASE_DIR:-/srv/karahanli}"
DATA_DIR="$BASE_DIR/data"

case "$(cd "$APP_SOURCE" && pwd)" in
  "$BASE_DIR"/*) ;;
  *) echo "Uygulama kaynağı $BASE_DIR altında olmalıdır." >&2; exit 1 ;;
esac

install -d -m 0755 "$DATA_DIR/media/products"
install -d -m 0755 "$DATA_DIR/catalog"
install -d -m 0700 "$BASE_DIR/secrets"
install -d -m 0750 "$BASE_DIR/backups"

cp "$APP_SOURCE/data/products.json" "$DATA_DIR/catalog/products.json"

# Dockerfile içindeki node kullanıcısı (UID/GID 1000) kalıcı dosyalara yazabilsin.
chown -R 1000:1000 "$DATA_DIR"

echo "Kalıcı katalog dizinleri hazırlandı: $DATA_DIR"
echo "Next.js web servisi katalog snapshot'ını $DATA_DIR/catalog/products.json yolundan okuyacak."
echo "Firebase servis hesabını $BASE_DIR/secrets/ altına yalnızca root okuyacak şekilde ekleyin."
