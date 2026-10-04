#!/usr/bin/env bash
# استقرار خودکار روی cPanel با SSH/rsync (بعد از ساخت و بسته‌بندی: scripts/pack-service.mjs ، pack-web.mjs ، build وب‌ادمین).
# ورودی‌ها از env (در GitHub Actions از Secrets/Variables):
#   SSH_TARGET        user@host                          (الزامی)
#   SSH_KEY_FILE      مسیر کلید خصوصی                     (الزامی)
#   SSH_KNOWN_HOSTS   مسیر فایل known_hosts               (الزامی؛ برای جلوگیری از MITM)
#   SSH_PORT          پیش‌فرض 22
#   APPS_DIR          پوشهٔ اپ‌ها نسبت به home؛ پیش‌فرض apps   (هر اپ: $APPS_DIR/api-low ...)
#   ADMIN_DOCROOT     docroot ساب‌دامنهٔ ادمین نسبت به home؛ پیش‌فرض panel.israapp.ir
#   NODE_VERSION      نسخهٔ Node انتخاب‌شده در cPanel؛ پیش‌فرض 22
#   TARGETS           فهرست هدف‌ها؛ پیش‌فرض: "api-low api-mid api-high web-main web-admin"
#   HEALTH_URL_LOW / HEALTH_URL_MID / HEALTH_URL_HIGH   آدرس /health برای تأیید پس از restart (اختیاری؛ خالی ⇒ بدون بررسی)
set -euo pipefail

: "${SSH_TARGET:?SSH_TARGET لازم است}" "${SSH_KEY_FILE:?SSH_KEY_FILE لازم است}" "${SSH_KNOWN_HOSTS:?SSH_KNOWN_HOSTS لازم است}"
SSH_PORT="${SSH_PORT:-22}"
APPS_DIR="${APPS_DIR:-apps}"
ADMIN_DOCROOT="${ADMIN_DOCROOT:-panel.israapp.ir}"
NODE_VERSION="${NODE_VERSION:-22}"
TARGETS="${TARGETS:-api-low api-mid api-high web-main web-admin}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

SSH_OPTS=(-p "$SSH_PORT" -i "$SSH_KEY_FILE" -o BatchMode=yes -o StrictHostKeyChecking=yes -o "UserKnownHostsFile=$SSH_KNOWN_HOSTS")
rsh() { ssh "${SSH_OPTS[@]}" "$SSH_TARGET" "$@"; }
sync_dir() { # <src/> <dest-relative-to-home> [rsync-extra-args...]
  local src="$1" dest="$2"; shift 2
  rsh "mkdir -p '$dest'"
  rsync -az --delete "$@" -e "ssh ${SSH_OPTS[*]}" "$src" "$SSH_TARGET:$dest/"
}

health() { # <name> <url>
  local name="$1" url="${2:-}"
  [ -z "$url" ] && { echo "  (بدون بررسی سلامت: $name)"; return 0; }
  for i in $(seq 1 12); do
    code="$(curl -s -o /dev/null -m 10 -w '%{http_code}' "$url" || true)"
    [ "$code" = "200" ] && { echo "  ✓ $name سالم ($url)"; return 0; }
    sleep 5
  done
  echo "  ✗ $name بعد از restart سالم نشد ($url ⇒ ${code:-?})" >&2
  return 1
}

# فایل‌هایی که cPanel/Passenger/npm روی هاست می‌سازند و نباید حذف شوند
APP_EXCLUDES=(--exclude=/node_modules --exclude=/tmp --exclude=/stderr.log --exclude=/.pkg.sha --exclude=/.htaccess)

deploy_api() { # <api-low|api-mid|api-high> <health-url>
  local app="$1" url="${2:-}" src="$ROOT/deploy/$1"
  [ -f "$src/app.js" ] || { echo "بستهٔ $app نیست؛ ابتدا node scripts/pack-service.mjs $app" >&2; exit 1; }
  echo "→ $app"
  sync_dir "$src/" "$APPS_DIR/$app" "${APP_EXCLUDES[@]}"
  rsh "bash -s" <<REMOTE
set -euo pipefail
cd "$APPS_DIR/$app"
mkdir -p tmp
new="\$(cat package.json vendor/node_modules/@isra/api-types/package.json 2>/dev/null | sha256sum | cut -d' ' -f1)"
if [ ! -f .pkg.sha ] || [ "\$(cat .pkg.sha)" != "\$new" ] || [ ! -e node_modules ]; then
  echo "  npm install (وابستگی‌ها تغییر کرده یا اولین بار)"
  # shellcheck disable=SC1090
  source "\$HOME/nodevenv/$APPS_DIR/$app/$NODE_VERSION/bin/activate"
  npm install --omit=dev --no-audit --no-fund
  echo "\$new" > .pkg.sha
fi
touch tmp/restart.txt
REMOTE
  health "$app" "$url"
}

for t in $TARGETS; do
  case "$t" in
    api-low)  deploy_api api-low  "${HEALTH_URL_LOW:-}" ;;
    api-mid)  deploy_api api-mid  "${HEALTH_URL_MID:-}" ;;
    api-high) deploy_api api-high "${HEALTH_URL_HIGH:-}" ;;
    web-main)
      [ -f "$ROOT/deploy/web-main/app.js" ] || { echo "بستهٔ web-main نیست (node scripts/pack-web.mjs)" >&2; exit 1; }
      echo "→ web-main"
      sync_dir "$ROOT/deploy/web-main/" "$APPS_DIR/web-main" "${APP_EXCLUDES[@]}"
      rsh "mkdir -p '$APPS_DIR/web-main/tmp' && touch '$APPS_DIR/web-main/tmp/restart.txt'"
      ;;
    web-admin)
      [ -f "$ROOT/apps/web-admin/build/index.html" ] || { echo "بیلد web-admin نیست" >&2; exit 1; }
      echo "→ web-admin"
      # .htaccess باید منتقل شود؛ پوشه‌های سیستمی cPanel حفظ می‌شوند
      sync_dir "$ROOT/apps/web-admin/build/" "$ADMIN_DOCROOT" --exclude=.well-known --exclude=cgi-bin --exclude=.htaccess.bak
      ;;
    *) echo "هدف ناشناخته: $t" >&2; exit 1 ;;
  esac
done
echo "✓ استقرار کامل شد"
