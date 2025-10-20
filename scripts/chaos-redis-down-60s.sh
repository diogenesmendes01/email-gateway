#!/usr/bin/env bash
set -euo pipefail

echo "[CHAOS] Simulando Redis indisponível por 60s..."

# Este script assume ambiente local e controle de serviço via docker-compose ou systemctl
if [[ "${CHAOS_REDIS_DOWN_60S:-false}" != "true" ]]; then
  echo "[CHAOS] Variável CHAOS_REDIS_DOWN_60S != true. Abortando."
  exit 1
fi

if command -v docker-compose >/dev/null 2>&1; then
  docker-compose stop redis || true
  sleep 60
  docker-compose start redis || true
else
  sudo systemctl stop redis || true
  sleep 60
  sudo systemctl start redis || true
fi

echo "[CHAOS] Redis retomado."

