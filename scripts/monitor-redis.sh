#!/usr/bin/env bash
set -euo pipefail

# TASK 8.2 - Monitoramento de saúde do Redis
# Verifica persistência, memória, conexões e performance do Redis

REDIS_HOST=${1:-"localhost"}
REDIS_PORT=${2:-"6379"}
REDIS_PASSWORD=${3:-""}
LOG_FILE="./redis-monitor.log"

# Função de logging
log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
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

# Função de verificação de conectividade
check_connectivity() {
  log "Verificando conectividade com Redis..."
  
  if ! redis_cmd "ping" >/dev/null 2>&1; then
    log "ERRO: Não foi possível conectar ao Redis em $REDIS_HOST:$REDIS_PORT"
    return 1
  fi
  
  log "OK: Conectividade com Redis estabelecida"
  return 0
}

# Função de verificação de persistência
check_persistence() {
  log "Verificando configurações de persistência..."
  
  local aof_enabled=$(redis_cmd "CONFIG GET appendonly" | tail -1)
  local aof_fsync=$(redis_cmd "CONFIG GET appendfsync" | tail -1)
  local rdb_saves=$(redis_cmd "CONFIG GET save" | tail -1)
  
  log "AOF habilitado: $aof_enabled"
  log "AOF fsync: $aof_fsync"
  log "RDB saves: $rdb_saves"
  
  # Verificar se AOF está habilitado
  if [[ "$aof_enabled" != "yes" ]]; then
    log "ALERTA: AOF não está habilitado"
    return 1
  fi
  
  # Verificar se fsync está configurado corretamente
  if [[ "$aof_fsync" != "everysec" ]]; then
    log "ALERTA: AOF fsync não está configurado como 'everysec' (atual: $aof_fsync)"
    return 1
  fi
  
  log "OK: Configurações de persistência corretas"
  return 0
}

# Função de verificação de memória
check_memory() {
  log "Verificando uso de memória..."
  
  local used_memory=$(redis_cmd "INFO memory" | grep "used_memory:" | cut -d: -f2 | tr -d '\r')
  local used_memory_human=$(redis_cmd "INFO memory" | grep "used_memory_human:" | cut -d: -f2 | tr -d '\r')
  local max_memory=$(redis_cmd "INFO memory" | grep "maxmemory:" | cut -d: -f2 | tr -d '\r')
  local max_memory_human=$(redis_cmd "INFO memory" | grep "maxmemory_human:" | cut -d: -f2 | tr -d '\r')
  local mem_fragmentation_ratio=$(redis_cmd "INFO memory" | grep "mem_fragmentation_ratio:" | cut -d: -f2 | tr -d '\r')
  
  log "Memória usada: $used_memory_human ($used_memory bytes)"
  log "Memória máxima: $max_memory_human ($max_memory bytes)"
  log "Taxa de fragmentação: $mem_fragmentation_ratio"
  
  # Verificar se há limite de memória configurado
  if [[ "$max_memory" == "0" ]]; then
    log "AVISO: Nenhum limite de memória configurado"
  else
    # Calcular percentual de uso
    local usage_percent=$(( (used_memory * 100) / max_memory ))
    log "Uso de memória: $usage_percent%"
    
    if [[ $usage_percent -gt 90 ]]; then
      log "ALERTA: Uso de memória crítico ($usage_percent%)"
      return 1
    elif [[ $usage_percent -gt 80 ]]; then
      log "AVISO: Uso de memória alto ($usage_percent%)"
    fi
  fi
  
  # Verificar fragmentação
  local frag_ratio=$(echo "$mem_fragmentation_ratio" | cut -d. -f1)
  if [[ $frag_ratio -gt 2 ]]; then
    log "AVISO: Fragmentação de memória alta ($mem_fragmentation_ratio)"
  fi
  
  log "OK: Verificação de memória concluída"
  return 0
}

# Função de verificação de conexões
check_connections() {
  log "Verificando conexões..."
  
  local connected_clients=$(redis_cmd "INFO clients" | grep "connected_clients:" | cut -d: -f2 | tr -d '\r')
  local blocked_clients=$(redis_cmd "INFO clients" | grep "blocked_clients:" | cut -d: -f2 | tr -d '\r')
  local total_connections_received=$(redis_cmd "INFO stats" | grep "total_connections_received:" | cut -d: -f2 | tr -d '\r')
  local rejected_connections=$(redis_cmd "INFO stats" | grep "rejected_connections:" | cut -d: -f2 | tr -d '\r')
  
  log "Clientes conectados: $connected_clients"
  log "Clientes bloqueados: $blocked_clients"
  log "Conexões recebidas: $total_connections_received"
  log "Conexões rejeitadas: $rejected_connections"
  
  # Verificar se há muitas conexões rejeitadas
  if [[ $rejected_connections -gt 0 ]]; then
    log "AVISO: $rejected_connections conexões foram rejeitadas"
  fi
  
  log "OK: Verificação de conexões concluída"
  return 0
}

# Função de verificação de performance
check_performance() {
  log "Verificando performance..."
  
  local ops_per_sec=$(redis_cmd "INFO stats" | grep "instantaneous_ops_per_sec:" | cut -d: -f2 | tr -d '\r')
  local keyspace_hits=$(redis_cmd "INFO stats" | grep "keyspace_hits:" | cut -d: -f2 | tr -d '\r')
  local keyspace_misses=$(redis_cmd "INFO stats" | grep "keyspace_misses:" | cut -d: -f2 | tr -d '\r')
  local total_commands_processed=$(redis_cmd "INFO stats" | grep "total_commands_processed:" | cut -d: -f2 | tr -d '\r')
  
  log "Operações por segundo: $ops_per_sec"
  log "Keyspace hits: $keyspace_hits"
  log "Keyspace misses: $keyspace_misses"
  log "Total de comandos processados: $total_commands_processed"
  
  # Calcular taxa de hit se possível
  if [[ $keyspace_hits -gt 0 || $keyspace_misses -gt 0 ]]; then
    local total_requests=$((keyspace_hits + keyspace_misses))
    local hit_rate=$(( (keyspace_hits * 100) / total_requests ))
    log "Taxa de hit: $hit_rate%"
    
    if [[ $hit_rate -lt 90 ]]; then
      log "AVISO: Taxa de hit baixa ($hit_rate%)"
    fi
  fi
  
  log "OK: Verificação de performance concluída"
  return 0
}

# Função de verificação de arquivos de persistência
check_persistence_files() {
  log "Verificando arquivos de persistência..."
  
  local redis_dir=$(redis_cmd "CONFIG GET dir" | tail -1)
  local aof_file=$(redis_cmd "CONFIG GET appendfilename" | tail -1)
  local rdb_file=$(redis_cmd "CONFIG GET dbfilename" | tail -1)
  
  log "Diretório Redis: $redis_dir"
  log "Arquivo AOF: $aof_file"
  log "Arquivo RDB: $rdb_file"
  
  # Verificar se arquivos existem (via comando Redis)
  local last_save=$(redis_cmd "LASTSAVE")
  log "Último save RDB: $(date -d @$last_save 2>/dev/null || echo "Timestamp: $last_save")"
  
  log "OK: Verificação de arquivos concluída"
  return 0
}

# Função principal de monitoramento
main() {
  log "=== Iniciando monitoramento do Redis ==="
  log "Host: $REDIS_HOST:$REDIS_PORT"
  
  local exit_code=0
  
  # Verificar conectividade
  if ! check_connectivity; then
    exit 1
  fi
  
  # Verificar persistência
  if ! check_persistence; then
    exit_code=1
  fi
  
  # Verificar memória
  if ! check_memory; then
    exit_code=1
  fi
  
  # Verificar conexões
  if ! check_connections; then
    exit_code=1
  fi
  
  # Verificar performance
  if ! check_performance; then
    exit_code=1
  fi
  
  # Verificar arquivos de persistência
  if ! check_persistence_files; then
    exit_code=1
  fi
  
  if [[ $exit_code -eq 0 ]]; then
    log "=== Monitoramento concluído - Tudo OK ==="
  else
    log "=== Monitoramento concluído - PROBLEMAS DETECTADOS ==="
  fi
  
  exit $exit_code
}

# Executar monitoramento
main "$@"
