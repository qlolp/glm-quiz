#!/usr/bin/env bash
# GLM Quiz — SQLite backup (run via cron on VPS)
set -euo pipefail

PROJECT_DIR="${PROJECT_DIR:-/root/glm-quiz}"
DB_PATH="${DB_PATH:-$PROJECT_DIR/server/quiz.db}"
BACKUP_DIR="${BACKUP_DIR:-$PROJECT_DIR/backups}"
KEEP_DAYS="${KEEP_DAYS:-14}"

mkdir -p "$BACKUP_DIR"
STAMP=$(date +%Y%m%d-%H%M%S)
TARGET="$BACKUP_DIR/quiz-$STAMP.db"

if [[ ! -f "$DB_PATH" ]]; then
    echo "Database not found: $DB_PATH" >&2
    exit 1
fi

# Use sqlite3 .backup if available (safe for live DB), else file copy
if command -v sqlite3 >/dev/null 2>&1; then
    sqlite3 "$DB_PATH" ".backup '$TARGET'"
else
    cp "$DB_PATH" "$TARGET"
fi

gzip -f "$TARGET"
find "$BACKUP_DIR" -name 'quiz-*.db.gz' -mtime +"$KEEP_DAYS" -delete
echo "Backup saved: ${TARGET}.gz"
