#!/usr/bin/env bash
set -euo pipefail

# Backup seguro do Postgres (RPO)
# Requer: pg_dump instalado e variáveis DB_* definidas

if [[ -z "${DB_HOST:-}" || -z "${DB_PORT:-}" || -z "${DB_USER:-}" || -z "${DB_NAME:-}" ]]; then
  echo "DB_HOST, DB_PORT, DB_USER e DB_NAME devem estar definidos. Abortando." >&2
  exit 1
fi

TS=$(date +%Y%m%d-%H%M%S)
OUT_DIR=${1:-"./backups"}
mkdir -p "$OUT_DIR"

FILE="$OUT_DIR/email-gateway-$TS.sql.gz"
echo "[BACKUP] Exportando para $FILE ..."

# Evita exposição de credenciais no process list
if [[ -n "${DB_PASSWORD:-}" ]]; then
  export PGPASSWORD="${DB_PASSWORD}"
fi

pg_dump -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" -d "${DB_NAME}" | gzip > "$FILE"

# Limpa variável sensível do ambiente
unset PGPASSWORD || true

echo "[BACKUP] Concluído."

