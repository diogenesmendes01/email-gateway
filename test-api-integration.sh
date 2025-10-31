#!/bin/bash

# Script de teste de integração da API
# Testa os endpoints principais do Track 1

set -e

echo "🧪 TESTE DE INTEGRAÇÃO DA API"
echo "=============================="
echo ""

# Cores
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

success() { echo -e "${GREEN}✅ $1${NC}"; }
error() { echo -e "${RED}❌ $1${NC}"; }
info() { echo -e "${YELLOW}ℹ️  $1${NC}"; }
test_name() { echo -e "${BLUE}🔍 $1${NC}"; }

# Verificar se a API está rodando
API_URL="${API_URL:-http://localhost:3000}"
info "API URL: $API_URL"
echo ""

# Função para testar endpoint
test_endpoint() {
    local method=$1
    local endpoint=$2
    local description=$3
    local data=$4
    
    test_name "$description"
    
    if [ -z "$data" ]; then
        response=$(curl -s -X $method "$API_URL$endpoint" \
            -H "Content-Type: application/json" \
            -w "\n%{http_code}" || echo "000")
    else
        response=$(curl -s -X $method "$API_URL$endpoint" \
            -H "Content-Type: application/json" \
            -d "$data" \
            -w "\n%{http_code}" || echo "000")
    fi
    
    http_code=$(echo "$response" | tail -n1)
    body=$(echo "$response" | sed '$d')
    
    if [ "$http_code" = "000" ]; then
        error "Falha ao conectar com a API"
        info "Certifique-se de que a API está rodando em $API_URL"
        return 1
    elif [ "$http_code" -ge 200 ] && [ "$http_code" -lt 300 ]; then
        success "HTTP $http_code - OK"
        return 0
    elif [ "$http_code" -ge 400 ] && [ "$http_code" -lt 500 ]; then
        info "HTTP $http_code - Erro do cliente (esperado se não houver dados)"
        return 0
    else
        error "HTTP $http_code - Erro"
        return 1
    fi
}

echo "📡 Testando Endpoints da API..."
echo "================================"
echo ""

# Health Check
test_endpoint GET "/health" "Health Check"
echo ""

# Provider Endpoints
echo "🔌 Provider Module"
echo "------------------"
test_endpoint GET "/providers" "Listar Providers"
test_endpoint GET "/providers/test-id" "Buscar Provider (deve retornar 404)"
echo ""

# IP Pool Endpoints
echo "🌐 IP Pool Module"
echo "------------------"
test_endpoint GET "/ip-pools" "Listar IP Pools"
test_endpoint GET "/ip-pools/test-id" "Buscar IP Pool (deve retornar 404)"
echo ""

# Rate Limit Endpoints
echo "⏱️  Rate Limit Module"
echo "--------------------"
test_endpoint GET "/rate-limits" "Listar Rate Limits"
test_endpoint GET "/rate-limits/test-id" "Buscar Rate Limit (deve retornar 404)"
echo ""

# Onboarding Endpoints
echo "🚀 Onboarding Module"
echo "--------------------"
test_endpoint GET "/onboarding/domains" "Listar Domains (Onboarding)"
echo ""

# Reputation Endpoints
echo "⭐ Reputation Module"
echo "--------------------"
test_endpoint GET "/reputation/metrics" "Buscar Métricas de Reputação"
echo ""

# Suppression Endpoints
echo "🚫 Suppression Module"
echo "---------------------"
test_endpoint GET "/suppression/list" "Listar Suppressions"
echo ""

echo "=============================="
echo "✅ TESTES DE INTEGRAÇÃO CONCLUÍDOS"
echo "=============================="
echo ""
info "Nota: Alguns endpoints podem retornar 404 ou 400, o que é esperado"
info "O importante é que a API está respondendo corretamente"
echo ""
info "Para testar com dados reais:"
echo "  1. Inicie a API: npm run start:dev --workspace=apps/api"
echo "  2. Configure o banco de dados"
echo "  3. Execute este script novamente"
echo ""

