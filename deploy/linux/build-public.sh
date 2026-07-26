#!/usr/bin/env sh
set -eu

APP_SOURCE="${1:?Uygulama kaynak dizini gerekli.}"
PUBLIC_ROOT="${2:?Public kök dizini gerekli.}"
RELEASE_ID="$(date -u +%Y%m%dT%H%M%SZ)-$$"
STAGING="$PUBLIC_ROOT/.staging-$RELEASE_ID"
CURRENT="$PUBLIC_ROOT/current"
PREVIOUS="$PUBLIC_ROOT/previous"

SOURCE="$(cd "$APP_SOURCE" && pwd)"
case "$PUBLIC_ROOT" in
  /srv/karahanli/public|/var/www/karahanligida.com/public) ;;
  *) echo "İzin verilmeyen public kökü: $PUBLIC_ROOT" >&2; exit 1 ;;
esac

install -d -m 0755 "$PUBLIC_ROOT"
install -d -m 0755 "$STAGING"

for file in \
  account.html admin.html favorites.html index.html products.html register.html \
  admin-catalog.css admin.css catalog.css favorites.css quote-cart.css register.css styles.css \
  admin.js app.js catalog-core.js config.js favorites.js firebase-config.js product-detail.js \
  products.js quote-cart.js quote-message.js register.js logo.png
do
  test -f "$SOURCE/$file"
  cp "$SOURCE/$file" "$STAGING/$file"
done

for directory in assets data urunler
do
  test -d "$SOURCE/$directory"
  cp -a "$SOURCE/$directory" "$STAGING/$directory"
done

find "$STAGING" -type d -exec chmod 0755 {} \;
find "$STAGING" -type f -exec chmod 0644 {} \;

rm -rf "$PREVIOUS"
if [ -d "$CURRENT" ]; then mv "$CURRENT" "$PREVIOUS"; fi
mv "$STAGING" "$CURRENT"

echo "Public sürüm hazırlandı: $CURRENT"
