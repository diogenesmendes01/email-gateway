#!/usr/bin/env bash
set -euo pipefail

# TASK 8.2 - Testes de validação das configurações de segurança
# Testa configurações de segurança do Nginx, Redis e sistema

LOG_FILE="./test-security-results.log"

# Função de logging
log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

# Função para testar configuração de segurança do Nginx
test_nginx_security() {
  log "=== Testando configuração de segurança do Nginx ==="
  
  local exit_code=0
  
  # Verificar se arquivo de configuração existe
  if [[ ! -f "nginx.conf" ]]; then
    log "✗ Arquivo nginx.conf não encontrado"
    return 1
  fi
  
  log "✓ Arquivo nginx.conf encontrado"
  
  # Verificar headers de segurança
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
  
  if grep -q "X-XSS-Protection" nginx.conf; then
    log "✓ X-XSS-Protection configurado"
  else
    log "✗ X-XSS-Protection não configurado"
    exit_code=1
  fi
  
  if grep -q "Strict-Transport-Security" nginx.conf; then
    log "✓ Strict-Transport-Security configurado"
  else
    log "✗ Strict-Transport-Security não configurado"
    exit_code=1
  fi
  
  # Verificar rate limiting
  if grep -q "limit_req_zone" nginx.conf; then
    log "✓ Rate limiting configurado"
  else
    log "✗ Rate limiting não configurado"
    exit_code=1
  fi
  
  # Verificar connection limiting
  if grep -q "limit_conn_zone" nginx.conf; then
    log "✓ Connection limiting configurado"
  else
    log "✗ Connection limiting não configurado"
    exit_code=1
  fi
  
  # Verificar SSL/TLS
  if grep -q "ssl_protocols" nginx.conf; then
    log "✓ SSL protocols configurados"
  else
    log "✗ SSL protocols não configurados"
    exit_code=1
  fi
  
  if grep -q "ssl_ciphers" nginx.conf; then
    log "✓ SSL ciphers configurados"
  else
    log "✗ SSL ciphers não configurados"
    exit_code=1
  fi
  
  # Verificar server tokens
  if grep -q "server_tokens off" nginx.conf; then
    log "✓ Server tokens desabilitados"
  else
    log "✗ Server tokens não desabilitados"
    exit_code=1
  fi
  
  return $exit_code
}

# Função para testar configuração de segurança do Redis
test_redis_security() {
  log "=== Testando configuração de segurança do Redis ==="
  
  local exit_code=0
  
  # Verificar se arquivo de configuração existe
  if [[ ! -f "redis.conf" ]]; then
    log "✗ Arquivo redis.conf não encontrado"
    return 1
  fi
  
  log "✓ Arquivo redis.conf encontrado"
  
  # Verificar protected mode
  if grep -q "protected-mode yes" redis.conf; then
    log "✓ Protected mode habilitado"
  else
    log "✗ Protected mode não habilitado"
    exit_code=1
  fi
  
  # Verificar bind address
  if grep -q "bind 127.0.0.1" redis.conf; then
    log "✓ Bind address configurado para localhost"
  else
    log "✗ Bind address não configurado para localhost"
    exit_code=1
  fi
  
  # Verificar AOF
  if grep -q "appendonly yes" redis.conf; then
    log "✓ AOF habilitado"
  else
    log "✗ AOF não habilitado"
    exit_code=1
  fi
  
  # Verificar AOF fsync
  if grep -q "appendfsync everysec" redis.conf; then
    log "✓ AOF fsync configurado como everysec"
  else
    log "✗ AOF fsync não configurado como everysec"
    exit_code=1
  fi
  
  # Verificar maxmemory policy
  if grep -q "maxmemory-policy noeviction" redis.conf; then
    log "✓ Maxmemory policy configurado como noeviction"
  else
    log "✗ Maxmemory policy não configurado como noeviction"
    exit_code=1
  fi
  
  return $exit_code
}

# Função para testar configuração de segurança do Docker
test_docker_security() {
  log "=== Testando configuração de segurança do Docker ==="
  
  local exit_code=0
  
  # Verificar se docker-compose.yml existe
  if [[ ! -f "docker-compose.yml" ]]; then
    log "✗ Arquivo docker-compose.yml não encontrado"
    return 1
  fi
  
  log "✓ Arquivo docker-compose.yml encontrado"
  
  # Verificar se containers não rodam como root
  if grep -q "user:" docker-compose.yml; then
    log "✓ Containers configurados para não rodar como root"
  else
    log "✗ Containers não configurados para não rodar como root"
    exit_code=1
  fi
  
  # Verificar se há limites de recursos
  if grep -q "deploy:" docker-compose.yml; then
    log "✓ Limites de recursos configurados"
  else
    log "✗ Limites de recursos não configurados"
    exit_code=1
  fi
  
  return $exit_code
}

# Função para testar configuração de segurança do sistema
test_system_security() {
  log "=== Testando configuração de segurança do sistema ==="
  
  local exit_code=0
  
  # Verificar se arquivos sensíveis não estão expostos
  if [[ -f ".env" ]]; then
    if grep -q "PASSWORD\|SECRET\|KEY" .env; then
      log "✗ Arquivo .env contém informações sensíveis"
      exit_code=1
    else
      log "✓ Arquivo .env não contém informações sensíveis"
    fi
  else
    log "✓ Arquivo .env não encontrado (usando .env.example)"
  fi
  
  # Verificar se .env.example existe
  if [[ -f ".env.example" ]]; then
    log "✓ Arquivo .env.example encontrado"
  else
    log "✗ Arquivo .env.example não encontrado"
    exit_code=1
  fi
  
  # Verificar se .gitignore exclui arquivos sensíveis
  if [[ -f ".gitignore" ]]; then
    if grep -q "\.env" .gitignore; then
      log "✓ .env excluído do git"
    else
      log "✗ .env não excluído do git"
      exit_code=1
    fi
    
    if grep -q "ssl/" .gitignore; then
      log "✓ Diretório ssl/ excluído do git"
    else
      log "✗ Diretório ssl/ não excluído do git"
      exit_code=1
    fi
  else
    log "✗ Arquivo .gitignore não encontrado"
    exit_code=1
  fi
  
  return $exit_code
}

# Função para testar configuração de SSL
test_ssl_config() {
  log "=== Testando configuração de SSL ==="
  
  local exit_code=0
  
  # Verificar se diretório SSL existe
  if [[ -d "ssl" ]]; then
    log "✓ Diretório ssl/ encontrado"
    
    # Verificar se certificados existem
    if [[ -f "ssl/cert.pem" ]]; then
      log "✓ Certificado SSL encontrado"
      
      # Verificar validade do certificado
      if openssl x509 -in ssl/cert.pem -text -noout >/dev/null 2>&1; then
        log "✓ Certificado SSL é válido"
      else
        log "✗ Certificado SSL é inválido"
        exit_code=1
      fi
    else
      log "✗ Certificado SSL não encontrado"
      exit_code=1
    fi
    
    if [[ -f "ssl/key.pem" ]]; then
      log "✓ Chave privada SSL encontrada"
      
      # Verificar validade da chave privada
      if openssl rsa -in ssl/key.pem -check >/dev/null 2>&1; then
        log "✓ Chave privada SSL é válida"
      else
        log "✗ Chave privada SSL é inválida"
        exit_code=1
      fi
    else
      log "✗ Chave privada SSL não encontrada"
      exit_code=1
    fi
  else
    log "✗ Diretório ssl/ não encontrado"
    exit_code=1
  fi
  
  return $exit_code
}

# Função para testar configuração de backup
test_backup_config() {
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
  
  if [[ -f "scripts/monitor-backups.sh" ]]; then
    log "✓ Script de monitoramento de backups encontrado"
  else
    log "✗ Script de monitoramento de backups não encontrado"
    exit_code=1
  fi
  
  # Verificar se scripts são executáveis
  if [[ -x "scripts/backup-postgres.sh" ]]; then
    log "✓ Script de backup do PostgreSQL é executável"
  else
    log "✗ Script de backup do PostgreSQL não é executável"
    exit_code=1
  fi
  
  if [[ -x "scripts/backup-redis.sh" ]]; then
    log "✓ Script de backup do Redis é executável"
  else
    log "✗ Script de backup do Redis não é executável"
    exit_code=1
  fi
  
  return $exit_code
}

# Função principal de teste
main() {
  log "=== Iniciando testes de configuração de segurança ==="
  
  local exit_code=0
  
  # Executar testes
  if ! test_nginx_security; then
    exit_code=1
  fi
  
  if ! test_redis_security; then
    exit_code=1
  fi
  
  if ! test_docker_security; then
    exit_code=1
  fi
  
  if ! test_system_security; then
    exit_code=1
  fi
  
  if ! test_ssl_config; then
    exit_code=1
  fi
  
  if ! test_backup_config; then
    exit_code=1
  fi
  
  if [[ $exit_code -eq 0 ]]; then
    log "=== Todos os testes de segurança passaram ==="
  else
    log "=== Alguns testes de segurança falharam ==="
  fi
  
  exit $exit_code
}

# Executar testes
main "$@"
