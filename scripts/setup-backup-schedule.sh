#!/usr/bin/env bash
set -euo pipefail

# TASK 8.2 - Configuração de agendamento de backups automáticos
# Configura cron jobs para backups diários, semanais e mensais

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKUP_SCRIPT="$SCRIPT_DIR/backup-postgres.sh"
CRON_FILE="/tmp/email-gateway-backup-cron"

echo "[BACKUP-SCHEDULE] Configurando agendamento de backups automáticos..."

# Verificar se o script de backup existe
if [[ ! -f "$BACKUP_SCRIPT" ]]; then
  echo "ERRO: Script de backup não encontrado: $BACKUP_SCRIPT" >&2
  exit 1
fi

# Criar arquivo de cron
cat > "$CRON_FILE" << EOF
# TASK 8.2 - Agendamento de backups automáticos do Email Gateway
# Gerado automaticamente em $(date)

# Backup diário às 02:00 (retenção 7 dias)
0 2 * * * cd "$SCRIPT_DIR" && DB_HOST=\${DB_HOST:-localhost} DB_PORT=\${DB_PORT:-5432} DB_USER=\${DB_USER:-postgres} DB_NAME=\${DB_NAME:-email_gateway} DB_PASSWORD=\${DB_PASSWORD} "$BACKUP_SCRIPT" daily 7 ./backups >> /var/log/email-gateway-backup.log 2>&1

# Backup semanal aos domingos às 03:00 (retenção 30 dias)
0 3 * * 0 cd "$SCRIPT_DIR" && DB_HOST=\${DB_HOST:-localhost} DB_PORT=\${DB_PORT:-5432} DB_USER=\${DB_USER:-postgres} DB_NAME=\${DB_NAME:-email_gateway} DB_PASSWORD=\${DB_PASSWORD} "$BACKUP_SCRIPT" weekly 30 ./backups >> /var/log/email-gateway-backup.log 2>&1

# Backup mensal no dia 1 às 04:00 (retenção 90 dias)
0 4 1 * * cd "$SCRIPT_DIR" && DB_HOST=\${DB_HOST:-localhost} DB_PORT=\${DB_PORT:-5432} DB_USER=\${DB_USER:-postgres} DB_NAME=\${DB_NAME:-email_gateway} DB_PASSWORD=\${DB_PASSWORD} "$BACKUP_SCRIPT" monthly 90 ./backups >> /var/log/email-gateway-backup.log 2>&1

# Limpeza de logs antigos (manter apenas 30 dias)
0 5 * * * find /var/log/email-gateway-backup.log -type f -mtime +30 -delete 2>/dev/null || true
EOF

echo "[BACKUP-SCHEDULE] Arquivo de cron criado: $CRON_FILE"
echo ""
echo "Para instalar o agendamento:"
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
echo "   tail -f /var/log/email-gateway-backup.log"
echo ""
echo "Horários configurados:"
echo "  - Backup diário: 02:00 (retenção 7 dias)"
echo "  - Backup semanal: Domingo 03:00 (retenção 30 dias)"
echo "  - Backup mensal: Dia 1 às 04:00 (retenção 90 dias)"
echo ""
echo "Variáveis de ambiente necessárias:"
echo "  - DB_HOST (padrão: localhost)"
echo "  - DB_PORT (padrão: 5432)"
echo "  - DB_USER (padrão: postgres)"
echo "  - DB_NAME (padrão: email_gateway)"
echo "  - DB_PASSWORD (obrigatório)"
echo ""
echo "Para testar manualmente:"
echo "  $BACKUP_SCRIPT daily 7 ./backups"
