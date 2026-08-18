#!/usr/bin/env bash
# GLM Quiz — deploy to VPS with backup and smoke check
set -euo pipefail

VPS_HOST="${VPS_HOST:-147.45.174.206}"
VPS_PORT="${VPS_PORT:-443}"
VPS_USER="${VPS_USER:-root}"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/id_ed25519}"
REMOTE_DIR="${REMOTE_DIR:-/root/glm-quiz}"
LOCAL_DIR="$(cd "$(dirname "$0")" && pwd)"
STAGING="/tmp/glm-quiz-staging-$$"

echo "📦 Preparing deploy staging..."
rm -rf "$STAGING"
mkdir -p "$STAGING"
# public includes the hashed V2 build under public/v2 alongside all legacy pages.
cp -R "$LOCAL_DIR/public" "$LOCAL_DIR/server" "$LOCAL_DIR/scripts" "$LOCAL_DIR/tests" "$STAGING/"
# Never upload workstation-native dependencies; keep/install the VPS Linux node_modules.
rm -rf "$STAGING/server/node_modules"
# Preserve the VPS database and never package local/test SQLite files.
rm -f "$STAGING/server/"*.db "$STAGING/server/"*.db-* "$STAGING/server/"*.sqlite "$STAGING/server/"*.sqlite-*
cp "$LOCAL_DIR/server/server.js" "$STAGING/server/server.js"
cp "$LOCAL_DIR/questions.json" "$LOCAL_DIR/roles.json" "$LOCAL_DIR/version.json" "$LOCAL_DIR/seminar-packs.json" "$STAGING/"
cp "$LOCAL_DIR"/{USER_GUIDE,SPEAKER_GUIDE,README,CONTINUE,ROADMAP,SEMINAR,CHECKPOINT,SESSION_REPORT}.md "$STAGING/" 2>/dev/null || true
cp "$LOCAL_DIR/deploy.sh" "$STAGING/"

# Keep root questions.json intact for SQLite upsert (correct answers stay on the server).
# Strip only the public HTTP fallback so /questions.json cannot leak the key.
node -e "
const fs=require('fs');
const p='$STAGING/public/questions.json';
if (!fs.existsSync(p)) process.exit(0);
const q=JSON.parse(fs.readFileSync(p,'utf8'));
const stripped=q.map(({correct,explanation,reference_link,reference,wrong_explanations,...rest})=>rest);
fs.writeFileSync(p, JSON.stringify(stripped, null, 2));
"

echo "📦 Building archive..."
tar czf /tmp/glm-quiz-deploy.tar.gz -C "$STAGING" .
rm -rf "$STAGING"

echo "💾 Backup on VPS..."
ssh -p "$VPS_PORT" -i "$SSH_KEY" "$VPS_USER@$VPS_HOST" \
  "cd $REMOTE_DIR && tar czf /tmp/glm-quiz-backup-\$(date +%Y%m%d-%H%M%S).tar.gz --exclude='server/node_modules' . 2>/dev/null || true"

echo "🚀 Uploading..."
scp -P "$VPS_PORT" -i "$SSH_KEY" /tmp/glm-quiz-deploy.tar.gz "$VPS_USER@$VPS_HOST:/tmp/"

echo "📂 Extracting and restarting..."
ssh -p "$VPS_PORT" -i "$SSH_KEY" "$VPS_USER@$VPS_HOST" \
  "cd $REMOTE_DIR && tar xzf /tmp/glm-quiz-deploy.tar.gz --overwrite && chmod +x scripts/backup-db.sh && systemctl restart glm-quiz && sleep 2 && systemctl is-active glm-quiz"

echo "🗄️  Installing DB backup cron (daily 03:00)..."
ssh -p "$VPS_PORT" -i "$SSH_KEY" "$VPS_USER@$VPS_HOST" \
  "(crontab -l 2>/dev/null | grep -v 'backup-db.sh'; echo '0 3 * * * PROJECT_DIR=$REMOTE_DIR $REMOTE_DIR/scripts/backup-db.sh >> /var/log/glm-quiz-backup.log 2>&1') | crontab -"

# Load DEMO_MASTER_CODE from local .env (VPS runs) or remote VPS .env if not set
if [ -z "${DEMO_MASTER_CODE:-}" ]; then
    if [ -f "$LOCAL_DIR/.env" ]; then
        set -a
        # shellcheck source=/dev/null
        . "$LOCAL_DIR/.env"
        set +a
    fi
fi
if [ -z "${DEMO_MASTER_CODE:-}" ]; then
    DEMO_MASTER_CODE="$(ssh -p "$VPS_PORT" -i "$SSH_KEY" "$VPS_USER@$VPS_HOST" "grep '^DEMO_MASTER_CODE=' $REMOTE_DIR/.env 2>/dev/null | cut -d= -f2" || true)"
fi

export DEMO_MASTER_CODE

if [ -z "${ADMIN_PASSWORD:-}" ]; then
    ADMIN_PASSWORD="$(ssh -p "$VPS_PORT" -i "$SSH_KEY" "$VPS_USER@$VPS_HOST" "grep '^ADMIN_PASSWORD=' $REMOTE_DIR/.env 2>/dev/null | cut -d= -f2-" || true)"
fi
if [ -z "${ADMIN_PASSWORD:-}" ]; then
    echo "ADMIN_PASSWORD not set locally or on VPS .env; smoke tests will fail" >&2
    exit 1
fi
export ADMIN_PASSWORD

echo "🧪 API smoke test..."
sleep 2
BASE_URL="http://$VPS_HOST" ADMIN_PASSWORD="$ADMIN_PASSWORD" DEMO_MASTER_CODE="${DEMO_MASTER_CODE:-}" \
  node "$LOCAL_DIR/tests/api-e2e.test.cjs"

echo "✅ Deploy complete: http://$VPS_HOST/"
echo "📱 QR slide: http://$VPS_HOST/qr.html"
