#!/usr/bin/env bash
set -euo pipefail

# Restore seguro do Postgres (RTO)
# Uso: restore-postgres.sh <arquivo.sql.gz>

if [[ -z "${DB_HOST:-}" || -z "${DB_PORT:-}" || -z "${DB_USER:-}" || -z "${DB_NAME:-}" ]]; then
  echo "DB_HOST, DB_PORT, DB_USER e DB_NAME devem estar definidos. Abortando." >&2
  exit 1
fi

if [[ $# -lt 1 ]]; then
  echo "Uso: $0 <arquivo.sql.gz>" >&2
  exit 1
fi

FILE="$1"
if [[ ! -f "$FILE" ]]; then
  echo "Arquivo não encontrado: $FILE" >&2
  exit 1
fi

echo "[RESTORE] Restaurando de $FILE ..."
if [[ -n "${DB_PASSWORD:-}" ]]; then
  export PGPASSWORD="${DB_PASSWORD}"
fi

gunzip -c "$FILE" | psql -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" -d "${DB_NAME}"

unset PGPASSWORD || true
echo "[RESTORE] Concluído."

