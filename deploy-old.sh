#!/usr/bin/env bash
# GLM Quiz — compatibility entry point for the production VPS
set -euo pipefail

export VPS_HOST="147.45.174.206"
export VPS_PORT="443"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
if [[ "$VPS_HOST" != "147.45.174.206" ]]; then
    echo "Refusing deploy: deploy-old.sh is locked to 147.45.174.206" >&2
    exit 1
fi
echo "🔄 Deploying to production server: $VPS_HOST (SSH port $VPS_PORT)"
exec "$SCRIPT_DIR/deploy.sh" "$@"
