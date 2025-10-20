#!/usr/bin/env bash
set -euo pipefail

# TASK 8.2 - Backup do Redis
# Cria backup dos dados do Redis (RDB + AOF)

REDIS_HOST=${1:-"localhost"}
REDIS_PORT=${2:-"6379"}
REDIS_PASSWORD=${3:-""}
BACKUP_DIR=${4:-"./redis-backups"}
RETENTION_DAYS=${5:-7}

# Função de logging
log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

# Função para executar comando Redis
redis_cmd() {
  local cmd=$1
  if [[ -n "$REDIS_PASSWORD" ]]; then
    redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" -a "$REDIS_PASSWORD" "$cmd"
  else
    redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" "$cmd"
  fi
}

# Função de limpeza de backups antigos
cleanup_old_backups() {
  local retention_days=$1
  log "Limpando backups mais antigos que $retention_days dias..."
  
  find "$BACKUP_DIR" -name "redis-backup-*.tar.gz" -type f -mtime +$retention_days -delete
  
  local removed_count=$(find "$BACKUP_DIR" -name "redis-backup-*.tar.gz" -type f -mtime +$retention_days | wc -l)
  log "Removidos $removed_count backups antigos"
}

# Função principal de backup
main() {
  log "=== Iniciando backup do Redis ==="
  log "Host: $REDIS_HOST:$REDIS_PORT"
  log "Diretório de backup: $BACKUP_DIR"
  log "Retenção: $RETENTION_DAYS dias"
  
  # Criar diretório de backup se não existir
  mkdir -p "$BACKUP_DIR"
  
  # Verificar conectividade
  if ! redis_cmd "ping" >/dev/null 2>&1; then
    log "ERRO: Não foi possível conectar ao Redis"
    exit 1
  fi
  
  # Obter informações do Redis
  local redis_dir=$(redis_cmd "CONFIG GET dir" | tail -1)
  local aof_file=$(redis_cmd "CONFIG GET appendfilename" | tail -1)
  local rdb_file=$(redis_cmd "CONFIG GET dbfilename" | tail -1)
  
  log "Diretório Redis: $redis_dir"
  log "Arquivo AOF: $aof_file"
  log "Arquivo RDB: $rdb_file"
  
  # Forçar save do RDB
  log "Forçando save do RDB..."
  if ! redis_cmd "BGSAVE" >/dev/null; then
    log "ERRO: Falha ao executar BGSAVE"
    exit 1
  fi
  
  # Aguardar save completar
  log "Aguardando save completar..."
  while [[ $(redis_cmd "LASTSAVE") == $(redis_cmd "LASTSAVE") ]]; do
    sleep 1
  done
  
  # Criar timestamp para o backup
  local timestamp=$(date +%Y%m%d-%H%M%S)
  local backup_name="redis-backup-$timestamp"
  local backup_path="$BACKUP_DIR/$backup_name"
  
  # Criar diretório temporário
  mkdir -p "$backup_path"
  
  # Copiar arquivos de dados (se acessíveis)
  log "Copiando arquivos de dados..."
  
  # Tentar copiar RDB
  if [[ -f "$redis_dir/$rdb_file" ]]; then
    cp "$redis_dir/$rdb_file" "$backup_path/" 2>/dev/null || log "AVISO: Não foi possível copiar RDB"
  else
    log "AVISO: Arquivo RDB não encontrado: $redis_dir/$rdb_file"
  fi
  
  # Tentar copiar AOF
  if [[ -f "$redis_dir/$aof_file" ]]; then
    cp "$redis_dir/$aof_file" "$backup_path/" 2>/dev/null || log "AVISO: Não foi possível copiar AOF"
  else
    log "AVISO: Arquivo AOF não encontrado: $redis_dir/$aof_file"
  fi
  
  # Salvar configuração atual
  log "Salvando configuração atual..."
  redis_cmd "CONFIG GET *" > "$backup_path/redis-config.txt" 2>/dev/null || log "AVISO: Não foi possível salvar configuração"
  
  # Salvar informações do servidor
  log "Salvando informações do servidor..."
  redis_cmd "INFO" > "$backup_path/redis-info.txt" 2>/dev/null || log "AVISO: Não foi possível salvar informações"
  
  # Criar arquivo de metadados
  cat > "$backup_path/backup-metadata.txt" << EOF
Backup do Redis
Timestamp: $timestamp
Host: $REDIS_HOST:$REDIS_PORT
Redis Dir: $redis_dir
RDB File: $rdb_file
AOF File: $aof_file
EOF
  
  # Criar arquivo tar.gz
  log "Criando arquivo de backup..."
  local backup_file="$BACKUP_DIR/$backup_name.tar.gz"
  if tar -czf "$backup_file" -C "$BACKUP_DIR" "$backup_name"; then
    log "Backup criado: $backup_file"
    
    # Remover diretório temporário
    rm -rf "$backup_path"
    
    # Verificar tamanho do backup
    local backup_size=$(stat -c%s "$backup_file" 2>/dev/null || stat -f%z "$backup_file" 2>/dev/null || echo "0")
    local backup_size_mb=$((backup_size / 1024 / 1024))
    log "Tamanho do backup: ${backup_size_mb}MB"
  else
    log "ERRO: Falha ao criar arquivo de backup"
    rm -rf "$backup_path"
    exit 1
  fi
  
  # Limpeza de backups antigos
  cleanup_old_backups "$RETENTION_DAYS"
  
  # Estatísticas finais
  local total_backups=$(find "$BACKUP_DIR" -name "redis-backup-*.tar.gz" -type f | wc -l)
  local total_size=$(find "$BACKUP_DIR" -name "redis-backup-*.tar.gz" -type f -exec stat -c%s {} \; 2>/dev/null | awk '{sum+=$1} END {print sum}' || find "$BACKUP_DIR" -name "redis-backup-*.tar.gz" -type f -exec stat -f%z {} \; 2>/dev/null | awk '{sum+=$1} END {print sum}' || echo "0")
  local total_size_mb=$((total_size / 1024 / 1024))
  
  log "=== Backup concluído ==="
  log "Total de backups: $total_backups"
  log "Tamanho total: ${total_size_mb}MB"
  log "Arquivo criado: $backup_file"
}

# Executar backup
main "$@"
