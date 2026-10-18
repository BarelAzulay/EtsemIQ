#!/usr/bin/env bash
# One-shot deploy of the sign-in Worker and a review copy of the site.
#
#   CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID      Cloudflare ("Edit Cloudflare Workers" token)
#   WHOP_CLIENT_ID, WHOP_CLIENT_SECRET, WHOP_API_KEY, WHOP_PRODUCT_ID
#   ADMIN_WHOP_USER_IDS                               optional; set once you know your Whop user id
#
#   bash api/deploy.sh            deploy (or update) both
#   bash api/deploy.sh --check    only check that every variable is present
#
# SESSION_SECRET is generated here the first time and never printed. Re-running
# the script keeps it (an existing secret is not overwritten), so nobody is signed
# out by a redeploy. Pass --rotate-session to replace it on purpose.
set -euo pipefail
cd "$(dirname "$0")"

need=(CLOUDFLARE_API_TOKEN CLOUDFLARE_ACCOUNT_ID WHOP_CLIENT_ID WHOP_CLIENT_SECRET WHOP_API_KEY WHOP_PRODUCT_ID)
missing=()
for v in "${need[@]}"; do [ -n "${!v:-}" ] || missing+=("$v"); done
if [ ${#missing[@]} -gt 0 ]; then
  echo "Missing: ${missing[*]}" >&2
  exit 1
fi
case "$WHOP_PRODUCT_ID" in prod_*) ;; *) echo "WHOP_PRODUCT_ID should start with prod_" >&2; exit 1;; esac
echo "All variables present."
[ "${1:-}" = "--check" ] && exit 0

npm ci --no-audit --no-fund >/dev/null
W="$PWD/node_modules/.bin/wrangler"

echo "Deploying etsemiq-api ..."
$W deploy --config "$PWD/wrangler.jsonc"

put() { printf '%s' "$2" | $W secret put "$1" --config "$PWD/wrangler.jsonc" >/dev/null; echo "  secret $1 set"; }
put WHOP_CLIENT_ID     "$WHOP_CLIENT_ID"
put WHOP_CLIENT_SECRET "$WHOP_CLIENT_SECRET"
put WHOP_API_KEY       "$WHOP_API_KEY"
put WHOP_PRODUCT_ID    "$WHOP_PRODUCT_ID"
if [ -n "${ADMIN_WHOP_USER_IDS:-}" ]; then put ADMIN_WHOP_USER_IDS "$ADMIN_WHOP_USER_IDS"; fi

if [ "${1:-}" = "--rotate-session" ] || ! $W secret list --config "$PWD/wrangler.jsonc" 2>/dev/null | grep -q 'SESSION_SECRET'; then
  put SESSION_SECRET "$(openssl rand -base64 48 | tr -d '\n')"
else
  echo "  secret SESSION_SECRET kept"
fi

# Review copy of the site: the current index.html served as static assets.
echo "Deploying etsemiq-preview ..."
tmp="$(mktemp -d)"
mkdir -p "$tmp/public"
cp ../index.html "$tmp/public/index.html"
cat > "$tmp/wrangler.jsonc" <<'EOF'
{
  "name": "etsemiq-preview",
  "compatibility_date": "2026-09-18",
  "workers_dev": true,
  "assets": { "directory": "./public" }
}
EOF
(cd "$tmp" && $W deploy --config "$tmp/wrangler.jsonc")
rm -rf "$tmp"

echo
echo "Health check:"
curl -fsS https://etsemiq-api.etsemiq.workers.dev/health || true
echo
echo "Review site: https://etsemiq-preview.etsemiq.workers.dev"
