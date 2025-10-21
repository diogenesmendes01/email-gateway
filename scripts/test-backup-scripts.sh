#!/usr/bin/env bash
set -euo pipefail

# TASK 8.2 - Testes de validação dos scripts de backup
# Testa funcionalidade dos scripts de backup e monitoramento

TEST_DIR="./test-backups"
LOG_FILE="./test-backup-results.log"

# Função de logging
log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

# Função para limpar ambiente de teste
cleanup() {
  log "Limpando ambiente de teste..."
  rm -rf "$TEST_DIR" 2>/dev/null || true
  docker-compose stop postgres redis 2>/dev/null || true
  docker-compose start postgres redis 2>/dev/null || true
}

# Função para aguardar serviço estar pronto
wait_for_service() {
  local service=$1
  local max_attempts=30
  local attempt=1
  
  log "Aguardando $service estar pronto..."
  
  while [[ $attempt -le $max_attempts ]]; do
    if [[ "$service" == "postgres" ]]; then
      if docker-compose exec postgres pg_isready -U postgres >/dev/null 2>&1; then
        log "$service está pronto"
        return 0
      fi
    elif [[ "$service" == "redis" ]]; then
      if docker-compose exec redis redis-cli ping >/dev/null 2>&1; then
        log "$service está pronto"
        return 0
      fi
    fi
    
    sleep 2
    ((attempt++))
  done
  
  log "ERRO: $service não ficou pronto em $max_attempts tentativas"
  return 1
}

# Função para testar script de backup do PostgreSQL
test_postgres_backup() {
  log "=== Testando backup do PostgreSQL ==="
  
  # Configurar variáveis de ambiente
  export DB_HOST=localhost
  export DB_PORT=5432
  export DB_USER=postgres
  export DB_NAME=email_gateway
  export DB_PASSWORD=postgres
  
  # Criar diretório de teste
  mkdir -p "$TEST_DIR"
  
  # Executar backup
  if ./scripts/backup-postgres.sh daily 1 "$TEST_DIR"; then
    log "✓ Backup do PostgreSQL executado com sucesso"
    
    # Verificar se arquivo foi criado
    local backup_file=$(find "$TEST_DIR" -name "email-gateway-daily-*.sql.gz" -type f | head -1)
    if [[ -n "$backup_file" ]]; then
      log "✓ Arquivo de backup criado: $backup_file"
      
      # Verificar integridade do arquivo
      if gzip -t "$backup_file" 2>/dev/null; then
        log "✓ Arquivo de backup íntegro"
        
        # Verificar tamanho do arquivo
        local file_size=$(stat -c%s "$backup_file" 2>/dev/null || stat -f%z "$backup_file" 2>/dev/null || echo "0")
        if [[ $file_size -gt 0 ]]; then
          log "✓ Arquivo de backup não está vazio ($file_size bytes)"
          return 0
        else
          log "✗ Arquivo de backup está vazio"
          return 1
        fi
      else
        log "✗ Arquivo de backup corrompido"
        return 1
      fi
    else
      log "✗ Arquivo de backup não foi criado"
      return 1
    fi
  else
    log "✗ Falha na execução do backup do PostgreSQL"
    return 1
  fi
}

# Função para testar script de backup do Redis
test_redis_backup() {
  log "=== Testando backup do Redis ==="
  
  # Executar backup
  if ./scripts/backup-redis.sh localhost 6379 "" "$TEST_DIR" 1; then
    log "✓ Backup do Redis executado com sucesso"
    
    # Verificar se arquivo foi criado
    local backup_file=$(find "$TEST_DIR" -name "redis-backup-*.tar.gz" -type f | head -1)
    if [[ -n "$backup_file" ]]; then
      log "✓ Arquivo de backup criado: $backup_file"
      
      # Verificar integridade do arquivo
      if tar -tzf "$backup_file" >/dev/null 2>&1; then
        log "✓ Arquivo de backup íntegro"
        
        # Verificar tamanho do arquivo
        local file_size=$(stat -c%s "$backup_file" 2>/dev/null || stat -f%z "$backup_file" 2>/dev/null || echo "0")
        if [[ $file_size -gt 0 ]]; then
          log "✓ Arquivo de backup não está vazio ($file_size bytes)"
          return 0
        else
          log "✗ Arquivo de backup está vazio"
          return 1
        fi
      else
        log "✗ Arquivo de backup corrompido"
        return 1
      fi
    else
      log "✗ Arquivo de backup não foi criado"
      return 1
    fi
  else
    log "✗ Falha na execução do backup do Redis"
    return 1
  fi
}

# Função para testar script de monitoramento de backups
test_backup_monitoring() {
  log "=== Testando monitoramento de backups ==="
  
  # Executar monitoramento
  if ./scripts/monitor-backups.sh "$TEST_DIR"; then
    log "✓ Monitoramento de backups executado com sucesso"
    return 0
  else
    log "✗ Falha na execução do monitoramento de backups"
    return 1
  fi
}

# Função para testar script de monitoramento do Redis
test_redis_monitoring() {
  log "=== Testando monitoramento do Redis ==="
  
  # Executar monitoramento
  if ./scripts/monitor-redis.sh localhost 6379 ""; then
    log "✓ Monitoramento do Redis executado com sucesso"
    return 0
  else
    log "✗ Falha na execução do monitoramento do Redis"
    return 1
  fi
}

# Função para testar script de monitoramento de sistema
test_system_monitoring() {
  log "=== Testando monitoramento de sistema ==="
  
  # Executar monitoramento
  if ./scripts/monitor-system.sh 80 85 90; then
    log "✓ Monitoramento de sistema executado com sucesso"
    return 0
  else
    log "✗ Falha na execução do monitoramento de sistema"
    return 1
  fi
}

# Função para testar configuração do Nginx
test_nginx_config() {
  log "=== Testando configuração do Nginx ==="
  
  # Verificar se arquivo de configuração existe
  if [[ -f "nginx.conf" ]]; then
    log "✓ Arquivo nginx.conf existe"
    
    # Verificar se configuração é válida
    if docker-compose exec nginx nginx -t >/dev/null 2>&1; then
      log "✓ Configuração do Nginx é válida"
      return 0
    else
      log "✗ Configuração do Nginx é inválida"
      return 1
    fi
  else
    log "✗ Arquivo nginx.conf não encontrado"
    return 1
  fi
}

# Função para testar configuração do Redis
test_redis_config() {
  log "=== Testando configuração do Redis ==="
  
  # Verificar se arquivo de configuração existe
  if [[ -f "redis.conf" ]]; then
    log "✓ Arquivo redis.conf existe"
    
    # Verificar se Redis está rodando com configuração correta
    if docker-compose exec redis redis-cli CONFIG GET appendonly | grep -q "yes"; then
      log "✓ AOF habilitado no Redis"
      
      if docker-compose exec redis redis-cli CONFIG GET appendfsync | grep -q "everysec"; then
        log "✓ AOF fsync configurado como everysec"
        return 0
      else
        log "✗ AOF fsync não configurado como everysec"
        return 1
      fi
    else
      log "✗ AOF não habilitado no Redis"
      return 1
    fi
  else
    log "✗ Arquivo redis.conf não encontrado"
    return 1
  fi
}

# Função principal de teste
main() {
  log "=== Iniciando testes de validação ==="
  
  local exit_code=0
  
  # Limpar ambiente
  cleanup
  
  # Aguardar serviços estarem prontos
  if ! wait_for_service postgres; then
    log "ERRO: PostgreSQL não está disponível"
    exit 1
  fi
  
  if ! wait_for_service redis; then
    log "ERRO: Redis não está disponível"
    exit 1
  fi
  
  # Executar testes
  if ! test_nginx_config; then
    exit_code=1
  fi
  
  if ! test_redis_config; then
    exit_code=1
  fi
  
  if ! test_postgres_backup; then
    exit_code=1
  fi
  
  if ! test_redis_backup; then
    exit_code=1
  fi
  
  if ! test_backup_monitoring; then
    exit_code=1
  fi
  
  if ! test_redis_monitoring; then
    exit_code=1
  fi
  
  if ! test_system_monitoring; then
    exit_code=1
  fi
  
  # Limpar ambiente
  cleanup
  
  if [[ $exit_code -eq 0 ]]; then
    log "=== Todos os testes passaram ==="
  else
    log "=== Alguns testes falharam ==="
  fi
  
  exit $exit_code
}

# Executar testes
main "$@"
