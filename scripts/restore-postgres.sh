#!/usr/bin/env bash
set -euo pipefail

# Restore simples do Postgres (RTO)
# Uso: restore-postgres.sh <arquivo.sql.gz>

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL não definido. Abortando." >&2
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
gunzip -c "$FILE" | psql "$DATABASE_URL"
echo "[RESTORE] Concluído."

