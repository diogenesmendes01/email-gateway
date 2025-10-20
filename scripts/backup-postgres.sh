#!/usr/bin/env bash
set -euo pipefail

# Backup simples do Postgres (RPO)
# Requer: pg_dump instalado e DATABASE_URL definido

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL não definido. Abortando." >&2
  exit 1
fi

TS=$(date +%Y%m%d-%H%M%S)
OUT_DIR=${1:-"./backups"}
mkdir -p "$OUT_DIR"

FILE="$OUT_DIR/email-gateway-$TS.sql.gz"
echo "[BACKUP] Exportando para $FILE ..."
pg_dump "$DATABASE_URL" | gzip > "$FILE"
echo "[BACKUP] Concluído."

