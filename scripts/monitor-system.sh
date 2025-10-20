#!/usr/bin/env bash
set -euo pipefail

# TASK 8.2 - Monitoramento de sistema (CPU/memória/disco/I/O)
# Monitora recursos do sistema e gera alertas

LOG_FILE="./system-monitor.log"
ALERT_CPU_THRESHOLD=${1:-80}      # % CPU para alerta
ALERT_MEMORY_THRESHOLD=${2:-85}   # % memória para alerta
ALERT_DISK_THRESHOLD=${3:-90}     # % disco para alerta

# Função de logging
log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

# Função para obter uso de CPU
get_cpu_usage() {
  # Usar top para obter uso de CPU (compatível com Linux e macOS)
  if command -v top >/dev/null 2>&1; then
    # Linux
    if [[ "$OSTYPE" == "linux-gnu"* ]]; then
      top -bn1 | grep "Cpu(s)" | sed "s/.*, *\([0-9.]*\)%* id.*/\1/" | awk '{print 100 - $1}'
    # macOS
    elif [[ "$OSTYPE" == "darwin"* ]]; then
      top -l 1 | grep "CPU usage" | awk '{print $3}' | sed 's/%//'
    else
      echo "0"
    fi
  else
    echo "0"
  fi
}

# Função para obter uso de memória
get_memory_usage() {
  if command -v free >/dev/null 2>&1; then
    # Linux
    free | grep Mem | awk '{printf "%.1f", ($3/$2) * 100.0}'
  elif command -v vm_stat >/dev/null 2>&1; then
    # macOS
    local vm_stats=$(vm_stat)
    local pages_free=$(echo "$vm_stats" | grep "Pages free" | awk '{print $3}' | sed 's/\.//')
    local pages_active=$(echo "$vm_stats" | grep "Pages active" | awk '{print $3}' | sed 's/\.//')
    local pages_inactive=$(echo "$vm_stats" | grep "Pages inactive" | awk '{print $3}' | sed 's/\.//')
    local pages_wired=$(echo "$vm_stats" | grep "Pages wired down" | awk '{print $4}' | sed 's/\.//')
    
    local total_pages=$((pages_free + pages_active + pages_inactive + pages_wired))
    local used_pages=$((pages_active + pages_inactive + pages_wired))
    
    awk "BEGIN {printf \"%.1f\", ($used_pages / $total_pages) * 100}"
  else
    echo "0"
  fi
}

# Função para obter uso de disco
get_disk_usage() {
  # Verificar uso do disco principal
  if command -v df >/dev/null 2>&1; then
    df -h / | awk 'NR==2 {print $5}' | sed 's/%//'
  else
    echo "0"
  fi
}

# Função para obter estatísticas de I/O
get_io_stats() {
  if command -v iostat >/dev/null 2>&1; then
    # Linux
    iostat -x 1 1 | tail -n +4 | head -n -1 | awk '{print $1, $10, $11}' | while read device await svctm; do
      echo "Device: $device, Await: ${await}ms, Service Time: ${svctm}ms"
    done
  else
    echo "iostat não disponível"
  fi
}

# Função para obter carga do sistema
get_load_average() {
  if command -v uptime >/dev/null 2>&1; then
    uptime | awk -F'load average:' '{print $2}' | awk '{print $1, $2, $3}' | sed 's/,//g'
  else
    echo "0 0 0"
  fi
}

# Função para verificar processos com alto uso de CPU
get_top_cpu_processes() {
  if command -v ps >/dev/null 2>&1; then
    ps aux --sort=-%cpu | head -6 | tail -5 | awk '{printf "%-20s %6.1f%% %s\n", $11, $3, $2}'
  else
    echo "ps não disponível"
  fi
}

# Função para verificar processos com alto uso de memória
get_top_memory_processes() {
  if command -v ps >/dev/null 2>&1; then
    ps aux --sort=-%mem | head -6 | tail -5 | awk '{printf "%-20s %6.1f%% %s\n", $11, $4, $2}'
  else
    echo "ps não disponível"
  fi
}

# Função para verificar conectividade de rede
check_network_connectivity() {
  local connectivity_ok=true
  
  # Verificar conectividade básica
  if command -v ping >/dev/null 2>&1; then
    if ! ping -c 1 8.8.8.8 >/dev/null 2>&1; then
      log "AVISO: Sem conectividade com internet"
      connectivity_ok=false
    fi
  fi
  
  # Verificar portas locais importantes
  local ports=("5432" "6379" "3000")
  for port in "${ports[@]}"; do
    if ! nc -z localhost "$port" >/dev/null 2>&1; then
      log "AVISO: Porta $port não está respondendo"
      connectivity_ok=false
    fi
  done
  
  if [[ "$connectivity_ok" == "true" ]]; then
    log "OK: Conectividade de rede normal"
    return 0
  else
    return 1
  fi
}

# Função para verificar espaço em disco
check_disk_space() {
  local disk_usage=$(get_disk_usage)
  local disk_usage_int=${disk_usage%.*}
  
  log "Uso de disco: ${disk_usage}%"
  
  if [[ $disk_usage_int -gt $ALERT_DISK_THRESHOLD ]]; then
    log "ALERTA: Uso de disco crítico (${disk_usage}% > ${ALERT_DISK_THRESHOLD}%)"
    return 1
  elif [[ $disk_usage_int -gt 80 ]]; then
    log "AVISO: Uso de disco alto (${disk_usage}%)"
  else
    log "OK: Uso de disco normal (${disk_usage}%)"
  fi
  
  return 0
}

# Função para verificar CPU
check_cpu() {
  local cpu_usage=$(get_cpu_usage)
  local cpu_usage_int=${cpu_usage%.*}
  
  log "Uso de CPU: ${cpu_usage}%"
  
  if [[ $cpu_usage_int -gt $ALERT_CPU_THRESHOLD ]]; then
    log "ALERTA: Uso de CPU alto (${cpu_usage}% > ${ALERT_CPU_THRESHOLD}%)"
    log "Top processos por CPU:"
    get_top_cpu_processes | while read line; do
      log "  $line"
    done
    return 1
  else
    log "OK: Uso de CPU normal (${cpu_usage}%)"
  fi
  
  return 0
}

# Função para verificar memória
check_memory() {
  local memory_usage=$(get_memory_usage)
  local memory_usage_int=${memory_usage%.*}
  
  log "Uso de memória: ${memory_usage}%"
  
  if [[ $memory_usage_int -gt $ALERT_MEMORY_THRESHOLD ]]; then
    log "ALERTA: Uso de memória alto (${memory_usage}% > ${ALERT_MEMORY_THRESHOLD}%)"
    log "Top processos por memória:"
    get_top_memory_processes | while read line; do
      log "  $line"
    done
    return 1
  else
    log "OK: Uso de memória normal (${memory_usage}%)"
  fi
  
  return 0
}

# Função para verificar carga do sistema
check_load_average() {
  local load_avg=$(get_load_average)
  local cpu_cores=$(nproc 2>/dev/null || sysctl -n hw.ncpu 2>/dev/null || echo "1")
  
  log "Carga do sistema: $load_avg (CPUs: $cpu_cores)"
  
  # Verificar carga média de 1 minuto
  local load_1min=$(echo "$load_avg" | awk '{print $1}')
  local load_threshold=$((cpu_cores * 2))
  
  if (( $(echo "$load_1min > $load_threshold" | bc -l 2>/dev/null || echo "0") )); then
    log "ALERTA: Carga do sistema alta ($load_1min > $load_threshold)"
    return 1
  else
    log "OK: Carga do sistema normal ($load_1min)"
  fi
  
  return 0
}

# Função para verificar I/O
check_io() {
  log "Verificando estatísticas de I/O..."
  
  local io_stats=$(get_io_stats)
  log "I/O Stats: $io_stats"
  
  # Verificar se há dispositivos com alta latência
  if command -v iostat >/dev/null 2>&1; then
    local high_latency=$(iostat -x 1 1 | tail -n +4 | head -n -1 | awk '$10 > 100 {print $1 " (" $10 "ms)"}')
    if [[ -n "$high_latency" ]]; then
      log "AVISO: Dispositivos com alta latência: $high_latency"
    fi
  fi
  
  log "OK: Verificação de I/O concluída"
  return 0
}

# Função para gerar relatório de sistema
generate_system_report() {
  log "=== Relatório de Sistema ==="
  log "Data/Hora: $(date)"
  log "Hostname: $(hostname)"
  log "Sistema: $(uname -a)"
  log "Uptime: $(uptime | awk -F'up ' '{print $2}' | awk -F',' '{print $1}')"
  
  # Informações de CPU
  local cpu_info=$(lscpu 2>/dev/null | grep "Model name" | cut -d: -f2 | xargs || sysctl -n machdep.cpu.brand_string 2>/dev/null || echo "CPU info não disponível")
  log "CPU: $cpu_info"
  
  # Informações de memória
  local total_memory=$(free -h 2>/dev/null | grep "Mem:" | awk '{print $2}' || echo "Memória total não disponível")
  log "Memória Total: $total_memory"
  
  # Informações de disco
  local disk_info=$(df -h / | awk 'NR==2 {print $2 " total, " $3 " usado, " $4 " disponível"}')
  log "Disco: $disk_info"
  
  log "=== Fim do Relatório ==="
}

# Função principal de monitoramento
main() {
  log "=== Iniciando monitoramento de sistema ==="
  log "Limites de alerta: CPU=${ALERT_CPU_THRESHOLD}%, Memória=${ALERT_MEMORY_THRESHOLD}%, Disco=${ALERT_DISK_THRESHOLD}%"
  
  local exit_code=0
  
  # Verificar CPU
  if ! check_cpu; then
    exit_code=1
  fi
  
  # Verificar memória
  if ! check_memory; then
    exit_code=1
  fi
  
  # Verificar disco
  if ! check_disk_space; then
    exit_code=1
  fi
  
  # Verificar carga do sistema
  if ! check_load_average; then
    exit_code=1
  fi
  
  # Verificar I/O
  if ! check_io; then
    exit_code=1
  fi
  
  # Verificar conectividade de rede
  if ! check_network_connectivity; then
    exit_code=1
  fi
  
  # Gerar relatório
  generate_system_report
  
  if [[ $exit_code -eq 0 ]]; then
    log "=== Monitoramento concluído - Tudo OK ==="
  else
    log "=== Monitoramento concluído - PROBLEMAS DETECTADOS ==="
  fi
  
  exit $exit_code
}

# Executar monitoramento
main "$@"
