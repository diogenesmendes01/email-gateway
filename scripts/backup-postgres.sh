#!/usr/bin/env bash
set -euo pipefail

# TASK 8.2 - Backup automático do PostgreSQL com retenção
# Backup seguro do Postgres com retenção de 7/30 dias e validação

# Configurações
BACKUP_TYPE=${1:-"daily"}  # daily, weekly, monthly
RETENTION_DAYS=${2:-7}     # dias para retenção (7 para daily, 30 para monthly)
OUT_DIR=${3:-"./backups"}
LOG_FILE="$OUT_DIR/backup.log"

# Validar variáveis de ambiente
if [[ -z "${DB_HOST:-}" || -z "${DB_PORT:-}" || -z "${DB_USER:-}" || -z "${DB_NAME:-}" ]]; then
  echo "ERRO: DB_HOST, DB_PORT, DB_USER e DB_NAME devem estar definidos. Abortando." >&2
  exit 1
fi

# Criar diretório de backup se não existir
mkdir -p "$OUT_DIR"

# Função de logging
log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

# Função de limpeza de backups antigos
cleanup_old_backups() {
  local retention_days=$1
  log "Limpando backups mais antigos que $retention_days dias..."
  
  # Encontrar e remover backups antigos
  find "$OUT_DIR" -name "email-gateway-*.sql.gz" -type f -mtime +$retention_days -delete
  
  local removed_count=$(find "$OUT_DIR" -name "email-gateway-*.sql.gz" -type f -mtime +$retention_days | wc -l)
  log "Removidos $removed_count backups antigos"
}

# Função de validação do backup
validate_backup() {
  local backup_file=$1
  log "Validando backup: $backup_file"
  
  # Verificar se o arquivo existe e não está vazio
  if [[ ! -f "$backup_file" ]]; then
    log "ERRO: Arquivo de backup não encontrado: $backup_file"
    return 1
  fi
  
  local file_size=$(stat -f%z "$backup_file" 2>/dev/null || stat -c%s "$backup_file" 2>/dev/null || echo "0")
  if [[ $file_size -eq 0 ]]; then
    log "ERRO: Arquivo de backup está vazio: $backup_file"
    return 1
  fi
  
  # Verificar se o arquivo é um gzip válido
  if ! gzip -t "$backup_file" 2>/dev/null; then
    log "ERRO: Arquivo de backup corrompido (gzip inválido): $backup_file"
    return 1
  fi
  
  log "Backup validado com sucesso (tamanho: $file_size bytes)"
  return 0
}

# Função de teste de restauração (quinzenal)
test_restore() {
  local backup_file=$1
  local test_db_name="email_gateway_backup_test_$(date +%Y%m%d_%H%M%S)"
  
  log "Iniciando teste de restauração com banco: $test_db_name"
  
  # Criar banco de teste
  if ! createdb -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" "$test_db_name" 2>/dev/null; then
    log "ERRO: Falha ao criar banco de teste: $test_db_name"
    return 1
  fi
  
  # Restaurar backup no banco de teste
  if ! gunzip -c "$backup_file" | psql -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" -d "$test_db_name" >/dev/null 2>&1; then
    log "ERRO: Falha ao restaurar backup no banco de teste"
    dropdb -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" "$test_db_name" 2>/dev/null || true
    return 1
  fi
  
  # Verificar se as tabelas foram criadas
  local table_count=$(psql -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" -d "$test_db_name" -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';" 2>/dev/null | tr -d ' ')
  
  # Limpar banco de teste
  dropdb -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" "$test_db_name" 2>/dev/null || true
  
  if [[ -n "$table_count" && "$table_count" -gt 0 ]]; then
    log "Teste de restauração bem-sucedido ($table_count tabelas encontradas)"
    return 0
  else
    log "ERRO: Teste de restauração falhou (nenhuma tabela encontrada)"
    return 1
  fi
}

# Iniciar backup
TS=$(date +%Y%m%d-%H%M%S)
BACKUP_FILE="$OUT_DIR/email-gateway-${BACKUP_TYPE}-${TS}.sql.gz"

log "=== Iniciando backup $BACKUP_TYPE ==="
log "Tipo: $BACKUP_TYPE"
log "Retenção: $RETENTION_DAYS dias"
log "Arquivo: $BACKUP_FILE"

# Evita exposição de credenciais no process list
if [[ -n "${DB_PASSWORD:-}" ]]; then
  export PGPASSWORD="${DB_PASSWORD}"
fi

# Executar backup
log "Exportando banco de dados..."
if ! pg_dump -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" -d "${DB_NAME}" \
    --verbose \
    --no-password \
    --format=plain \
    --no-owner \
    --no-privileges \
    --clean \
    --if-exists \
    --create \
    | gzip > "$BACKUP_FILE"; then
  log "ERRO: Falha no backup do banco de dados"
  unset PGPASSWORD || true
  exit 1
fi

# Limpa variável sensível do ambiente
unset PGPASSWORD || true

# Validar backup
if ! validate_backup "$BACKUP_FILE"; then
  log "ERRO: Validação do backup falhou"
  exit 1
fi

# Teste de restauração (quinzenal - a cada 15 dias)
if [[ $(( $(date +%d) % 15 )) -eq 0 ]]; then
  log "Executando teste de restauração quinzenal..."
  if test_restore "$BACKUP_FILE"; then
    log "Teste de restauração quinzenal bem-sucedido"
  else
    log "AVISO: Teste de restauração quinzenal falhou"
  fi
fi

# Limpeza de backups antigos
cleanup_old_backups "$RETENTION_DAYS"

# Estatísticas finais
local total_backups=$(find "$OUT_DIR" -name "email-gateway-*.sql.gz" -type f | wc -l)
local total_size=$(find "$OUT_DIR" -name "email-gateway-*.sql.gz" -type f -exec stat -f%z {} \; 2>/dev/null | awk '{sum+=$1} END {print sum}' || find "$OUT_DIR" -name "email-gateway-*.sql.gz" -type f -exec stat -c%s {} \; 2>/dev/null | awk '{sum+=$1} END {print sum}' || echo "0")

log "=== Backup $BACKUP_TYPE concluído ==="
log "Total de backups: $total_backups"
log "Tamanho total: $total_size bytes"
log "Arquivo criado: $BACKUP_FILE"

