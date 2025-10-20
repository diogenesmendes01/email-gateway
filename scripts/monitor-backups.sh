#!/usr/bin/env bash
set -euo pipefail

# TASK 8.2 - Monitoramento de saúde dos backups
# Verifica integridade, idade e disponibilidade dos backups

BACKUP_DIR=${1:-"./backups"}
LOG_FILE="$BACKUP_DIR/backup-monitor.log"
ALERT_THRESHOLD_HOURS=${2:-25}  # Alerta se backup mais recente for mais antigo que 25h

# Função de logging
log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

# Função de verificação de backup recente
check_recent_backup() {
  local backup_type=$1
  local threshold_hours=$2
  
  local latest_backup=$(find "$BACKUP_DIR" -name "email-gateway-${backup_type}-*.sql.gz" -type f -printf '%T@ %p\n' 2>/dev/null | sort -n | tail -1 | cut -d' ' -f2-)
  
  if [[ -z "$latest_backup" ]]; then
    log "ALERTA: Nenhum backup $backup_type encontrado"
    return 1
  fi
  
  local backup_age_hours=$(( ($(date +%s) - $(stat -c %Y "$latest_backup" 2>/dev/null || stat -f %m "$latest_backup" 2>/dev/null || echo "0")) / 3600 ))
  
  if [[ $backup_age_hours -gt $threshold_hours ]]; then
    log "ALERTA: Backup $backup_type mais recente tem $backup_age_hours horas (limite: $threshold_hours)"
    return 1
  else
    log "OK: Backup $backup_type mais recente tem $backup_age_hours horas"
    return 0
  fi
}

# Função de verificação de integridade
check_backup_integrity() {
  local backup_file=$1
  
  if [[ ! -f "$backup_file" ]]; then
    log "ERRO: Arquivo de backup não encontrado: $backup_file"
    return 1
  fi
  
  # Verificar se é um gzip válido
  if ! gzip -t "$backup_file" 2>/dev/null; then
    log "ERRO: Backup corrompido (gzip inválido): $backup_file"
    return 1
  fi
  
  # Verificar tamanho mínimo (1KB)
  local file_size=$(stat -c%s "$backup_file" 2>/dev/null || stat -f%z "$backup_file" 2>/dev/null || echo "0")
  if [[ $file_size -lt 1024 ]]; then
    log "ERRO: Backup muito pequeno ($file_size bytes): $backup_file"
    return 1
  fi
  
  log "OK: Backup íntegro ($file_size bytes): $backup_file"
  return 0
}

# Função de estatísticas
generate_stats() {
  log "=== Estatísticas de Backup ==="
  
  local total_backups=$(find "$BACKUP_DIR" -name "email-gateway-*.sql.gz" -type f | wc -l)
  local daily_backups=$(find "$BACKUP_DIR" -name "email-gateway-daily-*.sql.gz" -type f | wc -l)
  local weekly_backups=$(find "$BACKUP_DIR" -name "email-gateway-weekly-*.sql.gz" -type f | wc -l)
  local monthly_backups=$(find "$BACKUP_DIR" -name "email-gateway-monthly-*.sql.gz" -type f | wc -l)
  
  local total_size=$(find "$BACKUP_DIR" -name "email-gateway-*.sql.gz" -type f -exec stat -c%s {} \; 2>/dev/null | awk '{sum+=$1} END {print sum}' || find "$BACKUP_DIR" -name "email-gateway-*.sql.gz" -type f -exec stat -f%z {} \; 2>/dev/null | awk '{sum+=$1} END {print sum}' || echo "0")
  local total_size_mb=$((total_size / 1024 / 1024))
  
  log "Total de backups: $total_backups"
  log "  - Diários: $daily_backups"
  log "  - Semanais: $weekly_backups"
  log "  - Mensais: $monthly_backups"
  log "Tamanho total: ${total_size_mb}MB"
  
  # Listar backups mais recentes
  log "Backups mais recentes:"
  find "$BACKUP_DIR" -name "email-gateway-*.sql.gz" -type f -printf '%T@ %Tc %p\n' 2>/dev/null | sort -n | tail -5 | while read timestamp datetime filepath; do
    local filename=$(basename "$filepath")
    local filesize=$(stat -c%s "$filepath" 2>/dev/null || stat -f%z "$filepath" 2>/dev/null || echo "0")
    local filesize_mb=$((filesize / 1024 / 1024))
    log "  $filename - ${filesize_mb}MB - $datetime"
  done
}

# Função principal de monitoramento
main() {
  log "=== Iniciando monitoramento de backups ==="
  
  local exit_code=0
  
  # Verificar se diretório existe
  if [[ ! -d "$BACKUP_DIR" ]]; then
    log "ERRO: Diretório de backup não encontrado: $BACKUP_DIR"
    exit 1
  fi
  
  # Verificar backups recentes
  log "Verificando backups recentes..."
  check_recent_backup "daily" $ALERT_THRESHOLD_HOURS || exit_code=1
  
  # Verificar integridade dos backups mais recentes
  log "Verificando integridade dos backups..."
  for backup_type in daily weekly monthly; do
    local latest_backup=$(find "$BACKUP_DIR" -name "email-gateway-${backup_type}-*.sql.gz" -type f -printf '%T@ %p\n' 2>/dev/null | sort -n | tail -1 | cut -d' ' -f2-)
    if [[ -n "$latest_backup" ]]; then
      check_backup_integrity "$latest_backup" || exit_code=1
    fi
  done
  
  # Gerar estatísticas
  generate_stats
  
  if [[ $exit_code -eq 0 ]]; then
    log "=== Monitoramento concluído - Tudo OK ==="
  else
    log "=== Monitoramento concluído - PROBLEMAS DETECTADOS ==="
  fi
  
  exit $exit_code
}

# Executar monitoramento
main "$@"
