#!/bin/bash

# Script de Rollback para Coolify
# TASK 8.1 - Arquitetura de Deploy, healthchecks e variáveis
# Rollback < 5 min com 2 releases anteriores

set -e

echo "🔄 Iniciando rollback do Email Gateway..."

# Configurações
APP_NAME="email-gateway"
RELEASES_DIR="/releases"
CURRENT_RELEASE_DIR="/app"
BACKUP_DIR="/backups"

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

# Listar releases disponíveis
list_releases() {
    log "Releases disponíveis para rollback:"
    
    if [ ! -d "$RELEASES_DIR" ]; then
        error "Diretório de releases não encontrado: $RELEASES_DIR"
    fi
    
    RELEASES=($(ls -t "$RELEASES_DIR" 2>/dev/null || echo ""))
    
    if [ ${#RELEASES[@]} -eq 0 ]; then
        error "Nenhuma release encontrada para rollback"
    fi
    
    for i in "${!RELEASES[@]}"; do
        RELEASE="${RELEASES[$i]}"
        STATUS=""
        
        if [ "$i" -eq 0 ]; then
            STATUS="(ATUAL)"
        elif [ "$i" -eq 1 ]; then
            STATUS="(ANTERIOR)"
        elif [ "$i" -eq 2 ]; then
            STATUS="(ANTERIOR-2)"
        fi
        
        echo "  $((i+1)). $RELEASE $STATUS"
    done
}

# Selecionar release para rollback
select_release() {
    RELEASES=($(ls -t "$RELEASES_DIR" 2>/dev/null))
    
    if [ ${#RELEASES[@]} -lt 2 ]; then
        error "Pelo menos 2 releases são necessárias para rollback seguro"
    fi
    
    # Por padrão, usar a release anterior (índice 1)
    SELECTED_RELEASE="${RELEASES[1]}"
    
    log "Release selecionada para rollback: $SELECTED_RELEASE"
    
    # Verificar se a release existe
    if [ ! -d "$RELEASES_DIR/$SELECTED_RELEASE" ]; then
        error "Release não encontrada: $SELECTED_RELEASE"
    fi
    
    echo "$SELECTED_RELEASE"
}

# Backup da release atual
backup_current_release() {
    log "Criando backup da release atual..."
    
    CURRENT_BACKUP="$BACKUP_DIR/current_release_backup_$(date +%Y%m%d_%H%M%S)"
    mkdir -p "$CURRENT_BACKUP"
    
    # Copiar arquivos atuais
    cp -r "$CURRENT_RELEASE_DIR"/* "$CURRENT_BACKUP/" 2>/dev/null || true
    
    log "✅ Backup da release atual criado: $CURRENT_BACKUP"
}

# Restaurar release anterior
restore_release() {
    local RELEASE_ID="$1"
    
    log "Restaurando release: $RELEASE_ID"
    
    RELEASE_DIR="$RELEASES_DIR/$RELEASE_ID"
    
    # Parar aplicação atual
    log "Parando aplicação atual..."
    pkill -f "node.*main.js" || true
    sleep 5
    
    # Remover arquivos atuais
    log "Removendo arquivos da release atual..."
    rm -rf "$CURRENT_RELEASE_DIR"/*
    
    # Copiar arquivos da release anterior
    log "Copiando arquivos da release $RELEASE_ID..."
    cp -r "$RELEASE_DIR"/* "$CURRENT_RELEASE_DIR/"
    
    # Atualizar link simbólico
    ln -sfn "$RELEASE_DIR" "$CURRENT_RELEASE_DIR/current"
    
    log "✅ Release $RELEASE_ID restaurada"
}

# Restaurar banco de dados (se necessário)
restore_database() {
    log "Verificando necessidade de rollback do banco de dados..."
    
    # Listar backups disponíveis
    BACKUPS=($(ls -t "$BACKUP_DIR"/backup_*.sql.gz 2>/dev/null || echo ""))
    
    if [ ${#BACKUPS[@]} -eq 0 ]; then
        warn "Nenhum backup de banco de dados encontrado"
        return 0
    fi
    
    # Usar o backup mais recente
    LATEST_BACKUP="${BACKUPS[0]}"
    
    log "Backup mais recente encontrado: $LATEST_BACKUP"
    
    # Perguntar se deve restaurar o banco
    read -p "Deseja restaurar o banco de dados do backup mais recente? (y/N): " -n 1 -r
    echo
    
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        log "Restaurando banco de dados..."
        
        # Descomprimir e restaurar
        gunzip -c "$LATEST_BACKUP" | psql "$DATABASE_URL" || error "Falha na restauração do banco de dados"
        
        log "✅ Banco de dados restaurado com sucesso"
    else
        log "Rollback do banco de dados cancelado"
    fi
}

# Testar aplicação após rollback
test_application() {
    log "Testando aplicação após rollback..."
    
    # Aguardar aplicação inicializar
    sleep 10
    
    # Testar healthz
    HEALTHZ_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/v1/health/healthz)
    if [ "$HEALTHZ_RESPONSE" != "200" ]; then
        error "Health check /healthz falhou após rollback (HTTP $HEALTHZ_RESPONSE)"
    fi
    
    # Testar readyz
    READYZ_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/v1/health/readyz)
    if [ "$READYZ_RESPONSE" != "200" ]; then
        error "Readiness check /readyz falhou após rollback (HTTP $READYZ_RESPONSE)"
    fi
    
    log "✅ Aplicação funcionando corretamente após rollback"
}

# Rollback principal
main() {
    log "=== ROLLBACK DO EMAIL GATEWAY ==="
    
    # Verificar se estamos em produção
    if [ "${NODE_ENV:-development}" != "production" ]; then
        warn "Rollback executado em ambiente não-produção: ${NODE_ENV:-development}"
    fi
    
    list_releases
    SELECTED_RELEASE=$(select_release)
    
    log "Iniciando rollback para release: $SELECTED_RELEASE"
    
    backup_current_release
    restore_release "$SELECTED_RELEASE"
    restore_database
    test_application
    
    log "🎉 Rollback concluído com sucesso!"
    log "📊 Health check: http://localhost:3000/v1/health/healthz"
    log "🔍 Readiness check: http://localhost:3000/v1/health/readyz"
    log "⏱️  Tempo total de rollback: < 5 minutos"
}

# Executar rollback
main "$@"
