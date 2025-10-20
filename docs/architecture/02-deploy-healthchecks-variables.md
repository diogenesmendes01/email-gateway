# Arquitetura de Deploy, Healthchecks e Variáveis

> **Tipo:** Arquitetura  
> **Status:** Aprovado  
> **Última atualização:** 2025-01-20  
> **Responsável:** Equipe de DevOps  
> **TASK:** 8.1

## Visão Geral

Este documento descreve a arquitetura de deploy, sistema de healthchecks e gerenciamento de variáveis de ambiente implementados para o Email Gateway MVP.

## Arquitetura de Deploy

### Topologia do Sistema

```
┌─────────┐    ┌─────────┐    ┌─────────┐
│  Nginx  │───▶│   API   │───▶│Postgres │
│(Load Bal)│    │(NestJS) │    │Database │
└─────────┘    └─────────┘    └─────────┘
     │              │              │
     │              ▼              │
     │         ┌─────────┐          │
     └────────▶│ Worker  │──────────┘
               │(BullMQ) │
               └─────────┘
                    │
                    ▼
               ┌─────────┐
               │  Redis  │
               │(Queue)  │
               └─────────┘
                    │
                    ▼
               ┌─────────┐
               │ AWS SES │
               │(Email)  │
               └─────────┘
```

### Componentes

1. **Nginx**: Load balancer e reverse proxy
2. **API**: Aplicação NestJS com endpoints REST
3. **Worker**: Processador de jobs BullMQ
4. **PostgreSQL**: Banco de dados principal
5. **Redis**: Cache e fila de jobs
6. **AWS SES**: Serviço de envio de emails

## Healthchecks

### Endpoints Implementados

#### `/v1/health/healthz` (Health Check Leve)
- **Propósito**: Verificar se a aplicação está rodando
- **Uso**: Load balancers e monitors básicos
- **Dependências**: Nenhuma (apenas processo)
- **Timeout**: < 100ms
- **Resposta**:
```json
{
  "status": "ok",
  "timestamp": "2025-01-20T10:30:00.000Z",
  "uptime": 3600,
  "version": "1.0.0"
}
```

#### `/v1/health/readyz` (Readiness Check)
- **Propósito**: Verificar se a aplicação está pronta para receber tráfego
- **Uso**: Kubernetes readiness probes, deploy gates
- **Dependências**: Database, Redis, SES quota
- **Timeout**: < 5s
- **Resposta**:
```json
{
  "status": "ready",
  "checks": {
    "database": {
      "status": "ok",
      "message": "Database connection successful",
      "responseTime": 15
    },
    "redis": {
      "status": "ok", 
      "message": "Redis connection successful",
      "responseTime": 8
    },
    "ses": {
      "status": "ok",
      "message": "SES quota is healthy",
      "responseTime": 120,
      "details": {
        "usagePercent": 25.5,
        "sentLast24Hours": 510,
        "max24HourSend": 2000,
        "maxSendRate": 14,
        "threshold": 80
      }
    }
  },
  "timestamp": "2025-01-20T10:30:00.000Z"
}
```

### Verificações de Readiness

1. **Database**: Teste de conectividade com `SELECT 1`
2. **Redis**: Teste de ping e informações de memória
3. **SES**: Verificação de quota e conectividade AWS

## Deploy via Coolify

### Configuração

- **Branch de Deploy**: `prod`
- **Estratégia**: Rolling deployment
- **Replicas**: 2-3 instâncias
- **Rollback**: < 5 minutos
- **Releases Mantidas**: 2 anteriores

### Arquivos de Configuração

#### `Dockerfile`
```dockerfile
# Multi-stage build otimizado
FROM node:18-alpine AS base
# ... configurações de build
FROM node:18-alpine AS production
# ... configurações de produção
```

#### `docker-compose.prod.yml`
```yaml
version: '3.8'
services:
  nginx:
    image: nginx:alpine
    ports: ['80:80', '443:443']
    
  api:
    build: .
    environment:
      NODE_ENV: production
      # ... variáveis de ambiente
      
  worker:
    build:
      dockerfile: Dockerfile.worker
    # ... configurações do worker
```

#### `coolify.yml`
```yaml
PROJECT_NAME: "email-gateway"
DEPLOY_BRANCH: "prod"
HEALTH_CHECK_PATH: "/v1/health/healthz"
READINESS_CHECK_PATH: "/v1/health/readyz"
ROLLBACK_ENABLED: true
MAX_ROLLBACK_RELEASES: 2
```

### Scripts de Deploy

#### `scripts/deploy.sh`
- Validação de branch (`prod`)
- Verificação de variáveis de ambiente
- Backup do banco de dados
- Build da aplicação
- Execução de migrações
- Testes de health check
- Criação de release
- Limpeza de releases antigas

#### `scripts/rollback.sh`
- Listagem de releases disponíveis
- Backup da release atual
- Restauração da release anterior
- Restauração do banco (opcional)
- Testes pós-rollback
- Tempo total: < 5 minutos

## Gerenciamento de Variáveis

### Sistema de Validação

#### `apps/api/src/config/app.config.ts`
```typescript
class EnvironmentVariables {
  @IsString()
  DATABASE_URL: string;
  
  @IsString()
  REDIS_URL: string;
  
  @IsString()
  AWS_ACCESS_KEY_ID: string;
  
  // ... outras validações
}
```

### Categorização de Variáveis

#### Segredos (Secrets)
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `DASHBOARD_PASSWORD_HASH`
- `ENCRYPTION_KEY`
- `ENCRYPTION_SALT_SECRET`

#### Configurações (Configs)
- `NODE_ENV`
- `PORT`
- `API_PREFIX`
- `CORS_ORIGIN`
- `RATE_LIMIT_TTL`
- `RATE_LIMIT_MAX`
- `SES_QUOTA_THRESHOLD`

### Validação de Ambiente

```typescript
// Validação automática no startup
const config = plainToClass(EnvironmentVariables, process.env);
const errors = validateSync(config);

if (errors.length > 0) {
  throw new Error(`Configuração inválida: ${errorMessages}`);
}
```

### Mascaramento de Dados Sensíveis

```typescript
// Logs seguros
const masked = maskSensitiveValue('secret-key-12345');
// Resultado: "secr***12345"

// Configuração completa (debug)
const allConfig = service.getAll();
// Valores sensíveis são automaticamente mascarados
```

## Monitoramento e Alertas

### Métricas Coletadas

1. **Health Check Response Time**
2. **Readiness Check Status**
3. **Database Connection Time**
4. **Redis Response Time**
5. **SES Quota Usage**

### Alertas Configurados

- SES quota > 80%
- Health check failures
- Database connection failures
- Redis connection failures
- High response times

## Segurança

### Headers de Segurança (Nginx)

```nginx
add_header X-Frame-Options DENY;
add_header X-Content-Type-Options nosniff;
add_header X-XSS-Protection "1; mode=block";
add_header Referrer-Policy "strict-origin-when-cross-origin";
```

### Rate Limiting

```nginx
limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;
limit_req_zone $binary_remote_addr zone=health:10m rate=1r/s;
```

### Validação de Entrada

- Class-validator para DTOs
- Sanitização de dados
- Validação de tipos
- Transformação automática

## Testes

### Cobertura Implementada

- **Testes Unitários**: 80%+ para serviços
- **Testes de Integração**: 70%+ para endpoints
- **Testes E2E**: Health checks completos

### Arquivos de Teste

- `health.controller.spec.ts`
- `health.service.spec.ts`
- `app.config.spec.ts`
- `health.integration.spec.ts`

## Troubleshooting

### Problemas Comuns

#### Health Check Falha
```bash
# Verificar logs
docker logs email-gateway-api

# Testar endpoint manualmente
curl http://localhost:3000/v1/health/healthz
```

#### Readiness Check Falha
```bash
# Verificar dependências
curl http://localhost:3000/v1/health/readyz

# Verificar logs detalhados
docker logs email-gateway-api | grep "health check"
```

#### Deploy Falha
```bash
# Executar rollback
./scripts/rollback.sh

# Verificar releases disponíveis
ls -la /releases/
```

### Logs Importantes

```bash
# Health checks
grep "health check" /var/log/app.log

# Deploy
grep "deploy" /var/log/app.log

# Rollback
grep "rollback" /var/log/app.log
```

## Referências

- [NEW-FEATURES.md](../NEW-FEATURES.md) - Guia de implementação
- [CODE-QUALITY-STANDARDS.md](../docs/CODE-QUALITY-STANDARDS.md) - Padrões de código
- [TESTING-STANDARDS.md](../docs/testing/TESTING-STANDARDS.md) - Padrões de teste
- [Coolify Documentation](https://coolify.io/docs) - Documentação do Coolify

---

**Template version:** 1.0  
**Last updated:** 2025-01-20
