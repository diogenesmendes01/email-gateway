#!/bin/bash
###############################################################################
# monitor-ses-quota.sh
#
# Script de monitoramento de quota AWS SES
#
# TASK 4.3 — Falhas espec\u00edficas e troubleshooting
# Runbook de monitoramento de quota SES
#
# Uso:
#   ./monitor-ses-quota.sh [--region REGION] [--alert-threshold PERCENT]
#
# Exemplo:
#   ./monitor-ses-quota.sh --region us-east-1 --alert-threshold 0.8
#
# Vari\u00e1veis de ambiente:
#   SES_REGION - Regi\u00e3o AWS SES (padr\u00e3o: us-east-1)
#   SES_ALERT_THRESHOLD - Limite de alerta (0.0-1.0, padr\u00e3o: 0.8 = 80%)
#   SLACK_WEBHOOK_URL - URL do webhook Slack para alertas (opcional)
#
###############################################################################

set -euo pipefail

# Cores para output
RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configura\u00e7\u00f5es padr\u00e3o
REGION="${SES_REGION:-us-east-1}"
ALERT_THRESHOLD="${SES_ALERT_THRESHOLD:-0.8}"
SLACK_WEBHOOK_URL="${SLACK_WEBHOOK_URL:-}"

# Parse argumentos
while [[ $# -gt 0 ]]; do
  case $1 in
    --region)
      REGION="$2"
      shift 2
      ;;
    --alert-threshold)
      ALERT_THRESHOLD="$2"
      shift 2
      ;;
    --help)
      echo "Uso: $0 [--region REGION] [--alert-threshold PERCENT]"
      echo ""
      echo "Op\u00e7\u00f5es:"
      echo "  --region REGION              Regi\u00e3o AWS SES (padr\u00e3o: us-east-1)"
      echo "  --alert-threshold PERCENT    Limite de alerta 0.0-1.0 (padr\u00e3o: 0.8)"
      echo "  --help                       Mostra esta ajuda"
      exit 0
      ;;
    *)
      echo "Argumento desconhecido: $1"
      exit 1
      ;;
  esac
done

# Verifica se AWS CLI est\u00e1 dispon\u00edvel
if ! command -v aws &> /dev/null; then
  echo -e "${RED}Erro: AWS CLI n\u00e3o encontrado${NC}"
  echo "Instale com: pip install awscli"
  exit 1
fi

# Verifica se jq est\u00e1 dispon\u00edvel
if ! command -v jq &> /dev/null; then
  echo -e "${RED}Erro: jq n\u00e3o encontrado${NC}"
  echo "Instale com: apt-get install jq (Debian/Ubuntu) ou brew install jq (macOS)"
  exit 1
fi

# Fun\u00e7\u00e3o para enviar alerta ao Slack
send_slack_alert() {
  local message="$1"
  local severity="$2" # "warning" ou "critical"

  if [[ -z "$SLACK_WEBHOOK_URL" ]]; then
    return
  fi

  local color="warning"
  local emoji=":warning:"

  if [[ "$severity" == "critical" ]]; then
    color="danger"
    emoji=":rotating_light:"
  fi

  local payload=$(cat <<EOF
{
  "attachments": [
    {
      "color": "$color",
      "title": "$emoji SES Quota Alert",
      "text": "$message",
      "footer": "Email Gateway - SES Monitor",
      "ts": $(date +%s)
    }
  ]
}
EOF
)

  curl -X POST -H 'Content-type: application/json' \
    --data "$payload" \
    "$SLACK_WEBHOOK_URL" \
    --silent --output /dev/null
}

# Fun\u00e7\u00e3o para formatar n\u00fameros com separa\u00e7\u00e3o de milhares
format_number() {
  printf "%'.0f" "$1" 2>/dev/null || echo "$1"
}

# Fun\u00e7\u00e3o principal
main() {
  echo -e "${BLUE}=== Monitoramento de Quota SES ===${NC}"
  echo -e "Regi\u00e3o: ${GREEN}$REGION${NC}"
  echo -e "Limite de alerta: ${GREEN}$(echo "$ALERT_THRESHOLD * 100" | bc -l | cut -d. -f1)%${NC}"
  echo ""

  # Buscar quota do SES
  echo -e "${BLUE}Buscando quota do SES...${NC}"

  set +e
  QUOTA_JSON=$(aws sesv2 get-account --region "$REGION" --output json 2>&1)
  AWS_EXIT_CODE=$?
  set -e

  if [[ $AWS_EXIT_CODE -ne 0 ]]; then
    echo -e "${RED}Erro: AWS CLI falhou (código de saída: $AWS_EXIT_CODE)${NC}"
    echo "$QUOTA_JSON"
    exit 1
  fi

  # Extrair valores
  MAX_24H=$(echo "$QUOTA_JSON" | jq -r '.SendQuota.Max24HourSend // 0')
  SENT_24H=$(echo "$QUOTA_JSON" | jq -r '.SendQuota.SentLast24Hours // 0')
  MAX_RATE=$(echo "$QUOTA_JSON" | jq -r '.SendQuota.MaxSendRate // 0')

  # Verificar se valores s\u00e3o v\u00e1lidos
  if [[ "$MAX_24H" == "0" ]] || [[ "$MAX_24H" == "null" ]]; then
    echo -e "${RED}Erro: N\u00e3o foi poss\u00edvel obter quota do SES${NC}"
    echo "Verifique suas credenciais AWS e permiss\u00f5es"
    exit 1
  fi

  # Calcular uso percentual
  USAGE_PCT=$(echo "scale=4; $SENT_24H / $MAX_24H" | bc -l)
  USAGE_DISPLAY=$(echo "$USAGE_PCT * 100" | bc -l | cut -d. -f1)

  # Calcular emails restantes
  REMAINING=$(echo "$MAX_24H - $SENT_24H" | bc -l)

  # Determinar status
  STATUS_COLOR="$GREEN"
  STATUS_TEXT="OK"
  ALERT_LEVEL="none"

  if (( $(echo "$USAGE_PCT >= 0.9" | bc -l) )); then
    STATUS_COLOR="$RED"
    STATUS_TEXT="CR\u00cdTICO"
    ALERT_LEVEL="critical"
  elif (( $(echo "$USAGE_PCT >= $ALERT_THRESHOLD" | bc -l) )); then
    STATUS_COLOR="$YELLOW"
    STATUS_TEXT="ALERTA"
    ALERT_LEVEL="warning"
  fi

  # Exibir resultados
  echo -e "${BLUE}--- Status da Quota ---${NC}"
  echo -e "Status: ${STATUS_COLOR}${STATUS_TEXT}${NC}"
  echo ""
  echo -e "Quota di\u00e1ria m\u00e1xima:    ${GREEN}$(format_number $MAX_24H)${NC} emails"
  echo -e "Enviados (\u00faltimas 24h): ${YELLOW}$(format_number $SENT_24H)${NC} emails"
  echo -e "Uso:                   ${STATUS_COLOR}${USAGE_DISPLAY}%${NC}"
  echo -e "Restantes:             ${GREEN}$(format_number $REMAINING)${NC} emails"
  echo ""
  echo -e "Taxa m\u00e1xima de envio:  ${GREEN}${MAX_RATE}${NC} emails/segundo"
  echo ""

  # Barra de progresso visual
  BAR_WIDTH=50
  FILLED=$(echo "$USAGE_PCT * $BAR_WIDTH" | bc -l | cut -d. -f1)
  EMPTY=$((BAR_WIDTH - FILLED))

  echo -n "Progresso: ["
  for ((i=0; i<FILLED; i++)); do echo -n "#"; done
  for ((i=0; i<EMPTY; i++)); do echo -n "-"; done
  echo "] ${USAGE_DISPLAY}%"
  echo ""

  # Recomenda\u00e7\u00f5es
  if [[ "$ALERT_LEVEL" == "critical" ]]; then
    echo -e "${RED}⚠️  ATEN\u00c7\u00c3O: Quota pr\u00f3xima do limite!${NC}"
    echo ""
    echo -e "${YELLOW}Recomenda\u00e7\u00f5es:${NC}"
    echo "  1. Pausar processamento de jobs n\u00e3o urgentes"
    echo "  2. Reduzir concorr\u00eancia do worker"
    echo "  3. Considerar solicitar aumento de quota"
    echo ""

    # Enviar alerta cr\u00edtico
    send_slack_alert "🚨 SES Quota ${USAGE_DISPLAY}% utilizada (${SENT_24H}/${MAX_24H} emails)" "critical"

  elif [[ "$ALERT_LEVEL" == "warning" ]]; then
    echo -e "${YELLOW}⚠️  Quota acima do limite de alerta (${ALERT_THRESHOLD}%)${NC}"
    echo ""
    echo -e "${YELLOW}Recomenda\u00e7\u00f5es:${NC}"
    echo "  1. Monitorar uso com mais frequ\u00eancia"
    echo "  2. Preparar plano de conting\u00eancia se necess\u00e1rio"
    echo ""

    # Enviar alerta
    send_slack_alert "⚠️ SES Quota ${USAGE_DISPLAY}% utilizada (${SENT_24H}/${MAX_24H} emails)" "warning"

  else
    echo -e "${GREEN}✓ Quota saud\u00e1vel${NC}"
    echo ""
  fi

  # Verificar se est\u00e1 em Sandbox
  PRODUCTION_ACCESS=$(echo "$QUOTA_JSON" | jq -r '.ProductionAccessEnabled // false')

  if [[ "$PRODUCTION_ACCESS" == "false" ]]; then
    echo -e "${YELLOW}⚠️  ATEN\u00c7\u00c3O: Conta SES em modo SANDBOX${NC}"
    echo "  - Limite: 200 emails/24h, 1 email/s"
    echo "  - Apenas destinat\u00e1rios verificados"
    echo "  - Solicite acesso de produ\u00e7\u00e3o: https://console.aws.amazon.com/ses/"
    echo ""
  fi

  # Timestamp do relat\u00f3rio
  echo -e "${BLUE}Gerado em: $(date '+%Y-%m-%d %H:%M:%S %Z')${NC}"

  # Exit code baseado no status
  if [[ "$ALERT_LEVEL" == "critical" ]]; then
    exit 2
  elif [[ "$ALERT_LEVEL" == "warning" ]]; then
    exit 1
  else
    exit 0
  fi
}

# Executar
main
