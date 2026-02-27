#!/bin/bash

# Script de Deploy para Coolify
# TASK 8.1 - Arquitetura de Deploy, healthchecks e variáveis

set -e

echo "🚀 Iniciando deploy do Email Gateway..."

# Configurações
APP_NAME="email-gateway"
BRANCH="prod"
BACKUP_DIR="/backups"
RELEASES_DIR="/releases"
CURRENT_RELEASE_DIR="/app"
MAX_RELEASES=3

# Cores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1"
}

warn() {
    echo -e "${YELLOW}[$(date +'%Y-%m-%d %H:%M:%S')] WARNING:${NC} $1"
}

error() {
    echo -e "${RED}[$(date +'%Y-%m-%d %H:%M:%S')] ERROR:${NC} $1"
    exit 1
}

# Verificar se estamos na branch correta
check_branch() {
    log "Verificando branch atual..."
    CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
    if [ "$CURRENT_BRANCH" != "$BRANCH" ]; then
        error "Deploy deve ser feito na branch '$BRANCH', branch atual: '$CURRENT_BRANCH'"
    fi
    log "✅ Branch '$BRANCH' confirmada"
}

# Verificar variáveis de ambiente críticas
check_environment() {
    log "Verificando variáveis de ambiente..."
    
    REQUIRED_VARS=(
        "DATABASE_URL"
        "REDIS_URL"
        "DASHBOARD_USERNAME"
        "DASHBOARD_PASSWORD_HASH"
        "ENCRYPTION_KEY"
    )
    
    for var in "${REQUIRED_VARS[@]}"; do
        if [ -z "${!var}" ]; then
            error "Variável de ambiente obrigatória não definida: $var"
        fi
    done
    
    # Verificar tamanho da chave de criptografia
    if [ ${#ENCRYPTION_KEY} -lt 32 ]; then
        error "ENCRYPTION_KEY deve ter pelo menos 32 caracteres"
    fi
    
    log "✅ Variáveis de ambiente validadas"
}

# Backup do banco de dados
backup_database() {
    log "Criando backup do banco de dados..."
    
    BACKUP_FILE="$BACKUP_DIR/backup_$(date +%Y%m%d_%H%M%S).sql"
    mkdir -p "$BACKUP_DIR"
    
    # Extrair informações de conexão do DATABASE_URL
    DB_URL="$DATABASE_URL"
    
    pg_dump "$DB_URL" > "$BACKUP_FILE" || error "Falha no backup do banco de dados"
    
    # Comprimir backup
    gzip "$BACKUP_FILE"
    
    log "✅ Backup criado: ${BACKUP_FILE}.gz"
    
    # Manter apenas os últimos 5 backups
    ls -t "$BACKUP_DIR"/backup_*.sql.gz | tail -n +6 | xargs -r rm
}

# Build da aplicação
build_application() {
    log "Construindo aplicação..."
    
    # Instalar dependências
    pnpm install --frozen-lockfile --prod || error "Falha na instalação de dependências"

    # Build
    pnpm build || error "Falha no build da aplicação"
    
    log "✅ Aplicação construída com sucesso"
}

# Executar migrações
run_migrations() {
    log "Executando migrações do banco de dados..."
    
    pnpm exec prisma migrate deploy || error "Falha na execução das migrações"
    
    log "✅ Migrações executadas com sucesso"
}

# Testes de health check
test_health_checks() {
    log "Testando health checks..."
    
    # Aguardar aplicação inicializar
    sleep 10
    
    # Testar healthz
    HEALTHZ_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/v1/health/healthz)
    if [ "$HEALTHZ_RESPONSE" != "200" ]; then
        error "Health check /healthz falhou (HTTP $HEALTHZ_RESPONSE)"
    fi
    
    # Testar readyz
    READYZ_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/v1/health/readyz)
    if [ "$READYZ_RESPONSE" != "200" ]; then
        error "Readiness check /readyz falhou (HTTP $READYZ_RESPONSE)"
    fi
    
    log "✅ Health checks passaram com sucesso"
}

# Criar release
create_release() {
    log "Criando nova release..."
    
    RELEASE_ID=$(date +%Y%m%d_%H%M%S)
    RELEASE_DIR="$RELEASES_DIR/$RELEASE_ID"
    
    mkdir -p "$RELEASE_DIR"
    
    # Copiar arquivos da aplicação
    cp -r "$CURRENT_RELEASE_DIR"/* "$RELEASE_DIR/"
    
    # Criar link simbólico para a release atual
    ln -sfn "$RELEASE_DIR" "$CURRENT_RELEASE_DIR/current"
    
    log "✅ Release $RELEASE_ID criada"
}

# Limpar releases antigas
cleanup_old_releases() {
    log "Limpando releases antigas..."
    
    # Manter apenas as últimas MAX_RELEASES releases
    ls -t "$RELEASES_DIR" | tail -n +$((MAX_RELEASES + 1)) | xargs -r -I {} rm -rf "$RELEASES_DIR/{}"
    
    log "✅ Releases antigas removidas"
}

# Deploy principal
main() {
    log "=== DEPLOY DO EMAIL GATEWAY ==="
    
    check_branch
    check_environment
    backup_database
    build_application
    run_migrations
    create_release
    test_health_checks
    cleanup_old_releases
    
    log "🎉 Deploy concluído com sucesso!"
    log "📊 Health check: http://localhost:3000/v1/health/healthz"
    log "🔍 Readiness check: http://localhost:3000/v1/health/readyz"
}

# Executar deploy
main "$@"
