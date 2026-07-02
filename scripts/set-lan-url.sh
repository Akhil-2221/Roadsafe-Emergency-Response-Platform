#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════
# set-lan-url.sh
#
# Fixes: "QR code only scans / opens on the laptop, not on other phones"
#
# Root cause: APP_URL (and NEXT_PUBLIC_API_URL) default to localhost, which
# only resolves on the machine that generated the QR code. A phone on the
# same Wi-Fi network can't reach "localhost" — it needs your machine's LAN
# IP address instead.
#
# What this does:
#   1. Detects your machine's LAN IP (e.g. 192.168.1.23)
#   2. Updates APP_URL in .env (backend)
#   3. Updates NEXT_PUBLIC_API_URL in apps/web/.env.local (frontend)
#   4. Reminds you to regenerate QR codes (old ones have the old URL baked in)
#
# NOTE: your phone must be on the SAME Wi-Fi network as this machine.
# If you need it to work over mobile data / different networks, use a
# tunnel instead (e.g. `ngrok http 3000` and `ngrok http 3001`) and paste
# those https URLs into .env / .env.local manually.
# ═══════════════════════════════════════════════════════════════════════
set -euo pipefail

detect_lan_ip() {
  if command -v ip >/dev/null 2>&1; then
    ip -4 route get 1.1.1.1 2>/dev/null | awk '{for(i=1;i<=NF;i++) if ($i=="src") print $(i+1)}' | head -n1
  elif command -v ifconfig >/dev/null 2>&1; then
    # macOS fallback
    ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null
  fi
}

LAN_IP="$(detect_lan_ip || true)"

if [ -z "${LAN_IP:-}" ]; then
  echo "❌ Could not auto-detect your LAN IP."
  echo "   Find it manually: 'ip addr' (Linux) or 'ipconfig getifaddr en0' (Mac) or 'ipconfig' (Windows)"
  echo "   Then re-run: bash scripts/set-lan-url.sh <your-ip>"
  exit 1
fi

# Allow manual override: bash scripts/set-lan-url.sh 192.168.1.50
if [ "${1:-}" != "" ]; then
  LAN_IP="$1"
fi

APP_URL="http://${LAN_IP}:3000"
API_URL="http://${LAN_IP}:3001"

echo "📡 Detected LAN IP: ${LAN_IP}"
echo "   App (frontend):  ${APP_URL}"
echo "   API (backend):   ${API_URL}"
echo ""

update_env_var() {
  local file="$1" key="$2" value="$3"
  if [ ! -f "$file" ]; then
    echo "⚠️  $file not found, skipping"
    return
  fi
  if grep -q "^${key}=" "$file"; then
    # portable in-place edit (Linux + macOS)
    sed -i.bak "s|^${key}=.*|${key}=${value}|" "$file" && rm -f "${file}.bak"
  else
    echo "${key}=${value}" >> "$file"
  fi
  echo "   ✓ updated ${key} in ${file}"
}

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

update_env_var "${ROOT_DIR}/.env" "APP_URL" "${APP_URL}"
update_env_var "${ROOT_DIR}/.env" "ALLOWED_ORIGINS" "http://localhost:3000,${APP_URL}"
update_env_var "${ROOT_DIR}/.env" "NEXT_PUBLIC_API_URL" "${API_URL}"
update_env_var "${ROOT_DIR}/apps/web/.env.local" "NEXT_PUBLIC_API_URL" "${API_URL}"

echo ""
echo "✅ Done. Next steps:"
echo "   1. Restart the API and web dev servers (or docker-compose restart)."
echo "   2. Re-generate QR codes for any vehicles created before this change"
echo "      (old QR images/tokens still point at the old localhost URL)."
echo "   3. Make sure your phone is on the SAME Wi-Fi network as this machine."
echo "   4. Open ${APP_URL} on your phone to confirm it loads before testing"
echo "      the QR scan itself."
