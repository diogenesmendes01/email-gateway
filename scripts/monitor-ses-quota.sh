#!/bin/bash

# =============================================================================
# Monitor SES Quota Script
# 
# Script para monitorar quota SES e alertar quando próxima do limite
# 
# TASK 6.2 — SES, domínio e DNS (SPF/DKIM)
# Monitoramento de quota para prevenção de estouro
# =============================================================================

set -e

# Configurações
REGION="${AWS_REGION:-us-east-1}"
THRESHOLD="${SES_QUOTA_THRESHOLD:-80}"
LOG_FILE="${SES_QUOTA_LOG:-/var/log/ses-quota.log}"
ALERT_EMAIL="${SES_ALERT_EMAIL:-}"

# Cores para output
RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
NC='\033[0m' # No Color

# Função para logging
log() {
    local level=$1
    shift
    local message="$*"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    
    echo "[$timestamp] [$level] $message" | tee -a "$LOG_FILE"
}

log_info() {
    log "INFO" "$@"
}

log_warn() {
    log "WARN" "$@"
}

log_error() {
    log "ERROR" "$@"
}

# Função para verificar se AWS CLI está disponível
check_aws_cli() {
    if ! command -v aws &> /dev/null; then
        log_error "AWS CLI não encontrado. Instale o AWS CLI primeiro."
        exit 1
    fi
}

# Função para verificar credenciais AWS
check_aws_credentials() {
    if ! aws sts get-caller-identity &> /dev/null; then
        log_error "Credenciais AWS não configuradas ou inválidas."
        exit 1
    fi
}

# Função para obter quota SES
get_ses_quota() {
    log_info "Verificando quota SES na região $REGION..."
    
    local quota_output
    quota_output=$(aws sesv2 get-account --region "$REGION" --query 'SendQuota' --output json 2>/dev/null)
    
    if [ $? -ne 0 ]; then
        log_error "Falha ao obter quota SES. Verifique permissões e região."
        exit 1
    fi
    
    echo "$quota_output"
}

# Função para calcular percentual de uso
calculate_usage_percentage() {
    local sent=$1
    local max=$2
    
    if [ "$max" -eq 0 ]; then
        echo "0"
        return
    fi
    
    local percentage=$(echo "scale=2; $sent * 100 / $max" | bc -l)
    echo "$percentage"
}

# Função para formatar números
format_number() {
    local num=$1
    printf "%'d" "$num"
}

# Função para enviar alerta por email
send_alert() {
    local subject="$1"
    local body="$2"
    
    if [ -n "$ALERT_EMAIL" ]; then
        log_info "Enviando alerta para $ALERT_EMAIL..."
        
        # Tenta usar mail se disponível
        if command -v mail &> /dev/null; then
            echo "$body" | mail -s "$subject" "$ALERT_EMAIL" 2>/dev/null || log_warn "Falha ao enviar email via mail"
        # Tenta usar sendmail se disponível
        elif command -v sendmail &> /dev/null; then
            {
                echo "Subject: $subject"
                echo "To: $ALERT_EMAIL"
                echo ""
                echo "$body"
            } | sendmail "$ALERT_EMAIL" 2>/dev/null || log_warn "Falha ao enviar email via sendmail"
        else
            log_warn "Nenhum cliente de email encontrado. Configure mail ou sendmail."
        fi
    fi
}

# Função para exibir status da quota
display_quota_status() {
    local quota_data="$1"
    
    local max_24h=$(echo "$quota_data" | jq -r '.Max24HourSend // 0')
    local sent_24h=$(echo "$quota_data" | jq -r '.SentLast24Hours // 0')
    local max_rate=$(echo "$quota_data" | jq -r '.MaxSendRate // 0')
    
    local percentage=$(calculate_usage_percentage "$sent_24h" "$max_24h")
    local remaining=$((max_24h - sent_24h))
    
    echo ""
    echo "=========================================="
    echo "📊 Status da Quota SES"
    echo "=========================================="
    echo "Região: $REGION"
    echo "Quota máxima (24h): $(format_number $max_24h) emails"
    echo "Enviados (24h): $(format_number $sent_24h) emails"
    echo "Taxa máxima: $max_rate emails/segundo"
    echo "Uso: ${percentage}%"
    echo "Restante: $(format_number $remaining) emails"
    echo "=========================================="
    
    # Determina cor baseada no percentual
    if (( $(echo "$percentage > $THRESHOLD" | bc -l) )); then
        echo -e "${RED}⚠️  QUOTA PRÓXIMA DO LIMITE!${NC}"
        return 1
    elif (( $(echo "$percentage > 60" | bc -l) )); then
        echo -e "${YELLOW}⚠️  Quota em uso moderado${NC}"
        return 0
    else
        echo -e "${GREEN}✅ Quota em uso normal${NC}"
        return 0
    fi
}

# Função para verificar reputação de domínios
check_domain_reputation() {
    log_info "Verificando reputação de domínios..."
    
    local domains
    domains=$(aws sesv2 list-verified-email-addresses --region "$REGION" --output text --query 'VerifiedEmailAddresses' 2>/dev/null || echo "")
    
    if [ -z "$domains" ]; then
        log_warn "Nenhum domínio verificado encontrado."
        return
    fi
    
    echo ""
    echo "=========================================="
    echo "🌐 Reputação de Domínios"
    echo "=========================================="
    
    for domain in $domains; do
        local reputation_output
        reputation_output=$(aws sesv2 get-account --region "$REGION" --query "ReputationMetrics" --output json 2>/dev/null || echo "{}")
        
        local reputation_score=$(echo "$reputation_output" | jq -r '.ReputationScore // "N/A"')
        local bounce_rate=$(echo "$reputation_output" | jq -r '.BounceRate // "N/A"')
        local complaint_rate=$(echo "$reputation_output" | jq -r '.ComplaintRate // "N/A"')
        
        echo "Domínio: $domain"
        echo "  Reputação: $reputation_score"
        echo "  Taxa de bounce: $bounce_rate"
        echo "  Taxa de complaints: $complaint_rate"
        echo ""
    done
    
    echo "=========================================="
}

# Função para gerar relatório completo
generate_report() {
    local quota_data="$1"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    
    log_info "Gerando relatório de quota SES..."
    
    local max_24h=$(echo "$quota_data" | jq -r '.Max24HourSend // 0')
    local sent_24h=$(echo "$quota_data" | jq -r '.SentLast24Hours // 0')
    local percentage=$(calculate_usage_percentage "$sent_24h" "$max_24h")
    
    # Salva relatório em arquivo
    local report_file="/tmp/ses-quota-report-$(date +%Y%m%d-%H%M%S).txt"
    
    {
        echo "Relatório de Quota SES - $timestamp"
        echo "=========================================="
        echo "Região: $REGION"
        echo "Quota máxima (24h): $(format_number $max_24h)"
        echo "Enviados (24h): $(format_number $sent_24h)"
        echo "Uso: ${percentage}%"
        echo "=========================================="
    } > "$report_file"
    
    log_info "Relatório salvo em: $report_file"
}

# Função principal
main() {
    log_info "Iniciando monitoramento de quota SES..."
    
    # Verificações prévias
    check_aws_cli
    check_aws_credentials
    
    # Obtém dados da quota
    local quota_data
    quota_data=$(get_ses_quota)
    
    if [ $? -ne 0 ]; then
        log_error "Falha ao obter dados de quota."
        exit 1
    fi
    
    # Exibe status
    local max_24h=$(echo "$quota_data" | jq -r '.Max24HourSend // 0')
    local sent_24h=$(echo "$quota_data" | jq -r '.SentLast24Hours // 0')
    local percentage=$(calculate_usage_percentage "$sent_24h" "$max_24h")
    
    display_quota_status "$quota_data"
    local quota_status=$?
    
    # Verifica se precisa enviar alerta
    if (( $(echo "$percentage > $THRESHOLD" | bc -l) )); then
        local subject="🚨 ALERTA: Quota SES próxima do limite ($percentage%)"
        local body="Quota SES em $REGION está em ${percentage}% de uso. Limite: $(format_number $max_24h), Usado: $(format_number $sent_24h)"
        
        log_warn "Quota próxima do limite! Enviando alerta..."
        send_alert "$subject" "$body"
    fi
    
    # Verifica reputação de domínios
    check_domain_reputation
    
    # Gera relatório
    generate_report "$quota_data"
    
    log_info "Monitoramento concluído."
    
    # Retorna status para uso em cron
    if [ $quota_status -eq 0 ]; then
        exit 0
    else
        exit 1
    fi
}

# Função para mostrar ajuda
show_help() {
    echo "Uso: $0 [opções]"
    echo ""
    echo "Opções:"
    echo "  -h, --help              Mostra esta ajuda"
    echo "  -r, --region REGION     Região AWS (padrão: us-east-1)"
    echo "  -t, --threshold PERCENT Threshold para alerta (padrão: 80)"
    echo "  -l, --log-file FILE     Arquivo de log (padrão: /var/log/ses-quota.log)"
    echo "  -e, --email EMAIL       Email para alertas"
    echo ""
    echo "Variáveis de ambiente:"
    echo "  AWS_REGION              Região AWS"
    echo "  SES_QUOTA_THRESHOLD     Threshold para alerta (padrão: 80)"
    echo "  SES_QUOTA_LOG           Arquivo de log"
    echo "  SES_ALERT_EMAIL         Email para alertas"
    echo ""
    echo "Exemplos:"
    echo "  $0                                    # Monitoramento básico"
    echo "  $0 -r us-west-2 -t 90                # Região específica com threshold 90%"
    echo "  $0 -e admin@example.com              # Com alertas por email"
    echo ""
    echo "Para uso em cron (executa a cada 30 minutos):"
    echo "  */30 * * * * $0 >> /var/log/ses-quota.log 2>&1"
}

# Processa argumentos da linha de comando
while [[ $# -gt 0 ]]; do
    case $1 in
        -h|--help)
            show_help
            exit 0
            ;;
        -r|--region)
            REGION="$2"
            shift 2
            ;;
        -t|--threshold)
            THRESHOLD="$2"
            shift 2
            ;;
        -l|--log-file)
            LOG_FILE="$2"
            shift 2
            ;;
        -e|--email)
            ALERT_EMAIL="$2"
            shift 2
            ;;
        *)
            log_error "Opção desconhecida: $1"
            show_help
            exit 1
            ;;
    esac
done

# Verifica se bc está disponível para cálculos
if ! command -v bc &> /dev/null; then
    log_error "Comando 'bc' não encontrado. Instale o pacote bc para cálculos."
    exit 1
fi

# Verifica se jq está disponível para processamento JSON
if ! command -v jq &> /dev/null; then
    log_error "Comando 'jq' não encontrado. Instale o pacote jq para processamento JSON."
    exit 1
fi

# Executa função principal
main "$@"