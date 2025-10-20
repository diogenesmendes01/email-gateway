#!/usr/bin/env bash
set -euo pipefail

PCT=${1:-95}
FILL_FILE="/tmp/chaos-disk-fill.bin"

# Bloqueio em produção
if [[ "${NODE_ENV:-}" == "production" || "${ENVIRONMENT:-}" == "production" ]]; then
  echo "[CHAOS] ❌ BLOCKED: Não executar em produção."
  exit 1
fi

echo "[CHAOS] Simulando disco ${PCT}% cheio..."

if [[ "${CHAOS_DISK_FILL:-false}" != "true" ]]; then
  echo "[CHAOS] Variável CHAOS_DISK_FILL != true. Abortando."
  exit 1
fi

TOTAL=$(df -Pk / | awk 'NR==2 {print $2}')
USED=$(df -Pk / | awk 'NR==2 {print $3}')
TARGET=$(( TOTAL * PCT / 100 ))

if (( USED >= TARGET )); then
  echo "[CHAOS] Disco já acima de ${PCT}%. Nada a fazer."
  exit 0
fi

NEEDED=$(( TARGET - USED ))

cleanup() {
  rm -f "${FILL_FILE}" || true
  echo "[CHAOS] Cleanup executado."
}

trap cleanup EXIT INT TERM

echo "[CHAOS] Alocando $NEEDED KB em ${FILL_FILE}..."
dd if=/dev/zero of="${FILL_FILE}" bs=1024 count=${NEEDED} status=progress || true

echo "[CHAOS] Configurando auto-cleanup em 5 minutos..."
( sleep 300 && cleanup ) &
echo "[CHAOS] Feito. Para reverter manualmente: rm -f ${FILL_FILE}."

