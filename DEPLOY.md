# Deploy Guide - Email Gateway

Este guia descreve como fazer deploy do Email Gateway usando Coolify.

## Pré-requisitos

- Coolify instalado e configurado
- Branch `prod` com código estável
- Variáveis de ambiente configuradas
- Acesso ao banco de dados e Redis

## Variáveis de Ambiente

### Obrigatórias

```bash
# Database
DATABASE_URL="postgresql://user:pass@host:5432/db"

# Redis
REDIS_URL="redis://host:6379"

# AWS SES
AWS_ACCESS_KEY_ID="your-access-key"
AWS_SECRET_ACCESS_KEY="your-secret-key"
AWS_SES_REGION="us-east-1"
SES_FROM_ADDRESS="noreply@yourdomain.com"

# Dashboard
DASHBOARD_USERNAME="admin"
DASHBOARD_PASSWORD_HASH="hashed-password"

# Encryption
ENCRYPTION_KEY="your-32-char-encryption-key"
```

### Opcionais

```bash
# Application
NODE_ENV="production"
PORT="3000"
API_PREFIX="v1"
CORS_ORIGIN="*"

# Rate Limiting
RATE_LIMIT_TTL="60"
RATE_LIMIT_MAX="100"

# SES Quota
SES_QUOTA_THRESHOLD="80"
```

## Deploy

### 1. Preparar Branch

```bash
# Fazer checkout da branch prod
git checkout prod

# Verificar se está atualizada
git pull origin prod

# Verificar se não há commits pendentes
git status
```

### 2. Configurar Coolify

1. Acesse o painel do Coolify
2. Crie um novo projeto
3. Configure o repositório Git
4. Defina a branch `prod`
5. Configure as variáveis de ambiente
6. Configure os health checks:
   - Health: `/v1/health/healthz`
   - Readiness: `/v1/health/readyz`

### 3. Executar Deploy

```bash
# Deploy automático via Coolify
# Ou manual usando script
./scripts/deploy.sh
```

### 4. Verificar Deploy

```bash
# Health check
curl http://your-domain/v1/health/healthz

# Readiness check
curl http://your-domain/v1/health/readyz

# Verificar logs
docker logs email-gateway-api
```

## Rollback

### Rollback Automático

Se o deploy falhar, o Coolify pode fazer rollback automático baseado nos health checks.

### Rollback Manual

```bash
# Executar script de rollback
./scripts/rollback.sh

# Ou via Coolify interface
# 1. Acesse o projeto
# 2. Vá para "Deployments"
# 3. Selecione a versão anterior
# 4. Clique em "Rollback"
```

## Monitoramento

### Health Checks

- **Healthz**: Verifica se a aplicação está rodando
- **Readyz**: Verifica dependências (DB, Redis, SES)

### Logs

```bash
# Logs da aplicação
docker logs email-gateway-api

# Logs do worker
docker logs email-gateway-worker

# Logs do Nginx
docker logs email-gateway-nginx
```

### Métricas

- Response time dos health checks
- Uso de quota do SES
- Status das dependências
- Taxa de erro das requisições

## Troubleshooting

### Deploy Falha

1. Verificar logs do Coolify
2. Verificar variáveis de ambiente
3. Verificar conectividade com dependências
4. Executar rollback se necessário

### Health Check Falha

1. Verificar se a aplicação está rodando
2. Verificar logs da aplicação
3. Verificar conectividade com DB/Redis/SES
4. Verificar configurações de rede

### Performance Issues

1. Verificar métricas de CPU/Memória
2. Verificar logs de erro
3. Verificar configurações de rate limiting
4. Escalar recursos se necessário

## Manutenção

### Backup

```bash
# Backup automático diário
# Configurado no coolify.yml
BACKUP_SCHEDULE: "0 2 * * *"
```

### Updates

1. Fazer merge para branch `prod`
2. Executar deploy via Coolify
3. Verificar health checks
4. Monitorar por 24h

### Limpeza

```bash
# Limpar releases antigas
# Automático via script de deploy
MAX_RELEASES=3
```

## Segurança

### SSL/TLS

```bash
# Configurar certificados SSL
SSL_ENABLED=true
SSL_CERT_PATH="/etc/ssl/certs"
SSL_KEY_PATH="/etc/ssl/private"
```

### Rate Limiting

```bash
# Configurar rate limiting
RATE_LIMIT_TTL="60"
RATE_LIMIT_MAX="100"
```

### Secrets

- Nunca commitar variáveis sensíveis
- Usar gerenciamento de secrets do Coolify
- Rotacionar chaves regularmente

## Suporte

Para problemas ou dúvidas:

1. Verificar logs
2. Consultar documentação
3. Abrir issue no repositório
4. Contatar equipe de DevOps
