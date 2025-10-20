#!/usr/bin/env bash
set -euo pipefail

# TASK 8.2 - Configuração de monitoramento de sistema
# Configura monitoramento automático de CPU/memória/disco/I/O

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MONITOR_SCRIPT="$SCRIPT_DIR/monitor-system.sh"
CRON_FILE="/tmp/email-gateway-system-monitor-cron"

# Configurações padrão
CPU_THRESHOLD=${1:-80}
MEMORY_THRESHOLD=${2:-85}
DISK_THRESHOLD=${3:-90}

echo "[SYSTEM-MONITORING] Configurando monitoramento de sistema..."

# Verificar se o script de monitoramento existe
if [[ ! -f "$MONITOR_SCRIPT" ]]; then
  echo "ERRO: Script de monitoramento não encontrado: $MONITOR_SCRIPT" >&2
  exit 1
fi

# Criar arquivo de cron
cat > "$CRON_FILE" << EOF
# TASK 8.2 - Monitoramento de sistema do Email Gateway
# Gerado automaticamente em $(date)

# Monitoramento a cada 5 minutos
*/5 * * * * cd "$SCRIPT_DIR" && "$MONITOR_SCRIPT" $CPU_THRESHOLD $MEMORY_THRESHOLD $DISK_THRESHOLD >> /var/log/email-gateway-system-monitor.log 2>&1

# Relatório diário às 08:00
0 8 * * * cd "$SCRIPT_DIR" && "$MONITOR_SCRIPT" $CPU_THRESHOLD $MEMORY_THRESHOLD $DISK_THRESHOLD >> /var/log/email-gateway-system-monitor.log 2>&1

# Limpeza de logs antigos (manter apenas 30 dias)
0 9 * * * find /var/log/email-gateway-system-monitor.log -type f -mtime +30 -delete 2>/dev/null || true
EOF

echo "[SYSTEM-MONITORING] Arquivo de cron criado: $CRON_FILE"
echo ""
echo "Para instalar o monitoramento:"
echo "1. Revisar o arquivo de cron:"
echo "   cat $CRON_FILE"
echo ""
echo "2. Instalar no crontab:"
echo "   crontab $CRON_FILE"
echo ""
echo "3. Verificar instalação:"
echo "   crontab -l"
echo ""
echo "4. Monitorar logs:"
echo "   tail -f /var/log/email-gateway-system-monitor.log"
echo ""
echo "Configurações:"
echo "  - Monitoramento a cada 5 minutos"
echo "  - Relatório diário às 08:00"
echo "  - Limite de CPU: ${CPU_THRESHOLD}%"
echo "  - Limite de memória: ${MEMORY_THRESHOLD}%"
echo "  - Limite de disco: ${DISK_THRESHOLD}%"
echo ""
echo "Para testar manualmente:"
echo "  $MONITOR_SCRIPT $CPU_THRESHOLD $MEMORY_THRESHOLD $DISK_THRESHOLD"
echo ""
echo "Logs serão salvos em: /var/log/email-gateway-system-monitor.log"
