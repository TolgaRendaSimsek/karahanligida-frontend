#!/usr/bin/env sh
set -eu

BASE_DIR="/srv/karahanli"
DATA_DIR="$BASE_DIR/data"
BACKUP_DIR="$BASE_DIR/backups"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"

case "$BACKUP_DIR" in
  "$BASE_DIR"/*) ;;
  *) echo "Güvenli olmayan yedek dizini." >&2; exit 1 ;;
esac

install -d -m 0750 "$BACKUP_DIR"
tar -C "$DATA_DIR" -czf "$BACKUP_DIR/catalog-$STAMP.tar.gz" media catalog generated
find "$BACKUP_DIR" -maxdepth 1 -type f -name 'catalog-*.tar.gz' -mtime +30 -delete
echo "$BACKUP_DIR/catalog-$STAMP.tar.gz oluşturuldu."
