#!/usr/bin/env bash
set -euo pipefail

# TASK 8.2 - Testes de integração do sistema
# Testa integração entre todos os componentes do sistema

LOG_FILE="./test-integration-results.log"

# Função de logging
log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
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
    elif [[ "$service" == "nginx" ]]; then
      if curl -f http://localhost/health/healthz >/dev/null 2>&1; then
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

# Função para testar conectividade entre serviços
test_service_connectivity() {
  log "=== Testando conectividade entre serviços ==="
  
  local exit_code=0
  
  # Testar PostgreSQL
  if docker-compose exec postgres pg_isready -U postgres >/dev/null 2>&1; then
    log "✓ PostgreSQL está acessível"
  else
    log "✗ PostgreSQL não está acessível"
    exit_code=1
  fi
  
  # Testar Redis
  if docker-compose exec redis redis-cli ping >/dev/null 2>&1; then
    log "✓ Redis está acessível"
  else
    log "✗ Redis não está acessível"
    exit_code=1
  fi
  
  # Testar Nginx
  if curl -f http://localhost/health/healthz >/dev/null 2>&1; then
    log "✓ Nginx está acessível"
  else
    log "✗ Nginx não está acessível"
    exit_code=1
  fi
  
  return $exit_code
}

# Função para testar endpoints de saúde
test_health_endpoints() {
  log "=== Testando endpoints de saúde ==="
  
  local exit_code=0
  
  # Testar healthz
  if curl -f http://localhost/health/healthz >/dev/null 2>&1; then
    log "✓ Endpoint /health/healthz está funcionando"
  else
    log "✗ Endpoint /health/healthz não está funcionando"
    exit_code=1
  fi
  
  # Testar readyz
  if curl -f http://localhost/health/readyz >/dev/null 2>&1; then
    log "✓ Endpoint /health/readyz está funcionando"
  else
    log "✗ Endpoint /health/readyz não está funcionando"
    exit_code=1
  fi
  
  return $exit_code
}

# Função para testar rate limiting
test_rate_limiting() {
  log "=== Testando rate limiting ==="
  
  local exit_code=0
  
  # Testar rate limiting fazendo muitas requisições
  local rate_limit_hit=false
  for i in {1..20}; do
    if ! curl -f http://localhost/health/healthz >/dev/null 2>&1; then
      rate_limit_hit=true
      break
    fi
  done
  
  if [[ "$rate_limit_hit" == "true" ]]; then
    log "✓ Rate limiting está funcionando"
  else
    log "✗ Rate limiting não está funcionando"
    exit_code=1
  fi
  
  return $exit_code
}

# Função para testar configuração de SSL
test_ssl_configuration() {
  log "=== Testando configuração de SSL ==="
  
  local exit_code=0
  
  # Verificar se certificados SSL existem
  if [[ -f "ssl/cert.pem" && -f "ssl/key.pem" ]]; then
    log "✓ Certificados SSL encontrados"
    
    # Verificar se HTTPS está configurado
    if grep -q "listen 443 ssl" nginx.conf; then
      log "✓ HTTPS configurado no Nginx"
    else
      log "✗ HTTPS não configurado no Nginx"
      exit_code=1
    fi
  else
    log "✗ Certificados SSL não encontrados"
    exit_code=1
  fi
  
  return $exit_code
}

# Função para testar configuração de backup
test_backup_configuration() {
  log "=== Testando configuração de backup ==="
  
  local exit_code=0
  
  # Verificar se scripts de backup existem
  if [[ -f "scripts/backup-postgres.sh" ]]; then
    log "✓ Script de backup do PostgreSQL encontrado"
  else
    log "✗ Script de backup do PostgreSQL não encontrado"
    exit_code=1
  fi
  
  if [[ -f "scripts/backup-redis.sh" ]]; then
    log "✓ Script de backup do Redis encontrado"
  else
    log "✗ Script de backup do Redis não encontrado"
    exit_code=1
  fi
  
  # Verificar se scripts são executáveis
  if [[ -x "scripts/backup-postgres.sh" ]]; then
    log "✓ Script de backup do PostgreSQL é executável"
  else
    log "✗ Script de backup do PostgreSQL não é executável"
    exit_code=1
  fi
  
  return $exit_code
}

# Função para testar configuração de monitoramento
test_monitoring_configuration() {
  log "=== Testando configuração de monitoramento ==="
  
  local exit_code=0
  
  # Verificar se scripts de monitoramento existem
  if [[ -f "scripts/monitor-system.sh" ]]; then
    log "✓ Script de monitoramento de sistema encontrado"
  else
    log "✗ Script de monitoramento de sistema não encontrado"
    exit_code=1
  fi
  
  if [[ -f "scripts/monitor-redis.sh" ]]; then
    log "✓ Script de monitoramento do Redis encontrado"
  else
    log "✗ Script de monitoramento do Redis não encontrado"
    exit_code=1
  fi
  
  if [[ -f "scripts/monitor-backups.sh" ]]; then
    log "✓ Script de monitoramento de backups encontrado"
  else
    log "✗ Script de monitoramento de backups não encontrado"
    exit_code=1
  fi
  
  return $exit_code
}

# Função para testar configuração de segurança
test_security_configuration() {
  log "=== Testando configuração de segurança ==="
  
  local exit_code=0
  
  # Verificar headers de segurança no Nginx
  if grep -q "X-Frame-Options" nginx.conf; then
    log "✓ X-Frame-Options configurado"
  else
    log "✗ X-Frame-Options não configurado"
    exit_code=1
  fi
  
  if grep -q "X-Content-Type-Options" nginx.conf; then
    log "✓ X-Content-Type-Options configurado"
  else
    log "✗ X-Content-Type-Options não configurado"
    exit_code=1
  fi
  
  if grep -q "Strict-Transport-Security" nginx.conf; then
    log "✓ Strict-Transport-Security configurado"
  else
    log "✗ Strict-Transport-Security não configurado"
    exit_code=1
  fi
  
  # Verificar configuração de segurança do Redis
  if grep -q "protected-mode yes" redis.conf; then
    log "✓ Protected mode habilitado no Redis"
  else
    log "✗ Protected mode não habilitado no Redis"
    exit_code=1
  fi
  
  return $exit_code
}

# Função para testar configuração de persistência
test_persistence_configuration() {
  log "=== Testando configuração de persistência ==="
  
  local exit_code=0
  
  # Verificar configuração do PostgreSQL
  if docker-compose exec postgres psql -U postgres -c "SELECT 1;" >/dev/null 2>&1; then
    log "✓ PostgreSQL está funcionando"
  else
    log "✗ PostgreSQL não está funcionando"
    exit_code=1
  fi
  
  # Verificar configuração do Redis
  if docker-compose exec redis redis-cli ping >/dev/null 2>&1; then
    log "✓ Redis está funcionando"
  else
    log "✗ Redis não está funcionando"
    exit_code=1
  fi
  
  # Verificar AOF no Redis
  if docker-compose exec redis redis-cli CONFIG GET appendonly | grep -q "yes"; then
    log "✓ AOF habilitado no Redis"
  else
    log "✗ AOF não habilitado no Redis"
    exit_code=1
  fi
  
  return $exit_code
}

# Função para testar configuração de logs
test_logging_configuration() {
  log "=== Testando configuração de logs ==="
  
  local exit_code=0
  
  # Verificar se logs estão sendo gerados
  if docker-compose logs --tail=1 >/dev/null 2>&1; then
    log "✓ Logs do Docker estão sendo gerados"
  else
    log "✗ Logs do Docker não estão sendo gerados"
    exit_code=1
  fi
  
  # Verificar configuração de logs do Nginx
  if grep -q "access_log" nginx.conf; then
    log "✓ Access log configurado no Nginx"
  else
    log "✗ Access log não configurado no Nginx"
    exit_code=1
  fi
  
  if grep -q "error_log" nginx.conf; then
    log "✓ Error log configurado no Nginx"
  else
    log "✗ Error log não configurado no Nginx"
    exit_code=1
  fi
  
  return $exit_code
}

# Função principal de teste
main() {
  log "=== Iniciando testes de integração ==="
  
  local exit_code=0
  
  # Aguardar serviços estarem prontos
  if ! wait_for_service postgres; then
    log "ERRO: PostgreSQL não está disponível"
    exit 1
  fi
  
  if ! wait_for_service redis; then
    log "ERRO: Redis não está disponível"
    exit 1
  fi
  
  if ! wait_for_service nginx; then
    log "ERRO: Nginx não está disponível"
    exit 1
  fi
  
  # Executar testes
  if ! test_service_connectivity; then
    exit_code=1
  fi
  
  if ! test_health_endpoints; then
    exit_code=1
  fi
  
  if ! test_rate_limiting; then
    exit_code=1
  fi
  
  if ! test_ssl_configuration; then
    exit_code=1
  fi
  
  if ! test_backup_configuration; then
    exit_code=1
  fi
  
  if ! test_monitoring_configuration; then
    exit_code=1
  fi
  
  if ! test_security_configuration; then
    exit_code=1
  fi
  
  if ! test_persistence_configuration; then
    exit_code=1
  fi
  
  if ! test_logging_configuration; then
    exit_code=1
  fi
  
  if [[ $exit_code -eq 0 ]]; then
    log "=== Todos os testes de integração passaram ==="
  else
    log "=== Alguns testes de integração falharam ==="
  fi
  
  exit $exit_code
}

# Executar testes
main "$@"
