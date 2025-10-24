# TASK-013 — Melhorar .env.example com Placeholders Seguros (DevOps)

## Contexto
- Origem: PR-BACKLOG (PR11-MAJOR-01)
- Resumo: `.env.example` usa placeholders genéricos (`your_access_key_id`) que podem levar desenvolvedores a commitar credenciais reais acidentalmente

## O que precisa ser feito
- [ ] Substituir placeholders genéricos por EXAMPLE credentials oficiais da AWS
- [ ] Adicionar comentários de aviso sobre nunca commitar credenciais reais
- [ ] Recomendar IAM roles para produção
- [ ] Recomendar AWS_PROFILE para desenvolvimento local
- [ ] Adicionar exemplos de como gerar valores seguros
- [ ] Documentar cada variável com comentários explicativos

## Urgência
- **Nível (1–5):** 3 (MODERADO - Segurança Preventiva)

## Responsável sugerido
- DevOps/Segurança

## Dependências / Riscos
- Dependências: Nenhuma
- Riscos:
  - Baixo: Apenas documentação
  - Previne commits acidentais de credenciais

## Detalhes Técnicos

**Atualizar:** `.env.example`

```bash
# ==============================================================================
# EMAIL GATEWAY - Environment Variables
# ==============================================================================
# IMPORTANTE: Este é um arquivo de EXEMPLO. NUNCA commite credenciais reais!
#
# Setup:
# 1. Copie este arquivo: cp .env.example .env
# 2. Substitua todos os valores EXAMPLE por valores reais
# 3. Adicione .env ao .gitignore (já deve estar)
# ==============================================================================

# ------------------------------------------------------------------------------
# Application
# ------------------------------------------------------------------------------
NODE_ENV=development                    # development | staging | production
API_PORT=3000                          # Porta da API REST
WORKER_PORT=3001                       # Porta do worker (health checks)

# ------------------------------------------------------------------------------
# Database (PostgreSQL)
# ------------------------------------------------------------------------------
# IMPORTANTE: Nunca commite connection strings de produção!
# Em produção, use secrets manager (AWS Secrets, HashiCorp Vault, etc.)
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/email_gateway?schema=public"

# ------------------------------------------------------------------------------
# Redis (Queue & Cache)
# ------------------------------------------------------------------------------
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=                         # Deixe vazio se sem senha (dev apenas)
REDIS_DB=0

# ------------------------------------------------------------------------------
# BullMQ Queue Configuration
# ------------------------------------------------------------------------------
QUEUE_NAME=email:send
QUEUE_CONCURRENCY=2                     # Número de workers processando simultaneamente
QUEUE_MAX_RETRIES=5                     # Máximo de tentativas por job

# Worker Configuration
WORKER_CONCURRENCY=16                   # min(CPU*2, 16) por padrão

# ------------------------------------------------------------------------------
# AWS SES (Simple Email Service)
# ------------------------------------------------------------------------------
# IMPORTANTE: NUNCA commite credenciais AWS reais!
#
# DESENVOLVIMENTO LOCAL:
# - Opção 1: Use AWS CLI profile (aws configure --profile email-gateway)
# - Opção 2: Use variáveis de ambiente (abaixo)
#
# PRODUÇÃO:
# - Use IAM roles (ECS Task Role, EC2 Instance Profile, Lambda Execution Role)
# - NUNCA hardcode access keys em produção
#
# Os valores abaixo são EXEMPLOS OFICIAIS DA AWS e NÃO FUNCIONAM:
# Referência: https://docs.aws.amazon.com/general/latest/gr/aws-sec-cred-types.html

AWS_REGION=us-east-1                    # Região SES: us-east-1, us-west-2, eu-west-1, etc.

# ATENÇÃO: Estes são exemplos oficiais da AWS documentation - NÃO FUNCIONAM!
AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE
AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY

# SES Configuration
SES_FROM_ADDRESS=noreply@example.com    # Email verificado no SES
SES_REPLY_TO_ADDRESS=support@example.com
SES_CONFIGURATION_SET_NAME=email-gateway # Nome do Configuration Set no SES

# ------------------------------------------------------------------------------
# Security - Encryption
# ------------------------------------------------------------------------------
# CRÍTICO: Esta chave criptografa CPF/CNPJ em repouso
#
# COMO GERAR UMA CHAVE FORTE:
#   openssl rand -base64 32
#   OU
#   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
#
# REQUISITOS:
# - Mínimo 32 caracteres (256 bits)
# - Deve ser criptograficamente aleatória
# - NUNCA use valores como "changeme", "test", "00000...", "aaaa..."
# - Guarde em secrets manager em produção
# - Se perder a chave, dados criptografados serão irrecuperáveis!
#
# NUNCA COMMITE A CHAVE REAL! O valor abaixo é placeholder:
ENCRYPTION_KEY=EXAMPLE_GENERATE_WITH_OPENSSL_RAND_BASE64_32_NEVER_COMMIT_THIS

# ------------------------------------------------------------------------------
# Security - API Authentication
# ------------------------------------------------------------------------------
API_KEY_HEADER=x-api-key               # Nome do header HTTP para API key

# ------------------------------------------------------------------------------
# Security - CORS
# ------------------------------------------------------------------------------
# Em desenvolvimento: http://localhost:3000
# Em produção: https://dashboard.seudominio.com (sem trailing slash)
CORS_ORIGIN=http://localhost:3000

# Opcional: Lista de IPs permitidos (separados por vírgula)
# Exemplo: ALLOWED_IPS=203.0.113.0,198.51.100.0
ALLOWED_IPS=127.0.0.1,::1

# ------------------------------------------------------------------------------
# Dashboard Authentication (Basic Auth)
# ------------------------------------------------------------------------------
DASHBOARD_USERNAME=admin

# IMPORTANTE: Gere um hash bcrypt, NÃO use senha em plaintext!
# Como gerar:
#   node -e "const bcrypt=require('bcrypt'); bcrypt.hash('sua-senha', 10).then(console.log)"
#
# O hash abaixo é de "admin123" - MUDE EM PRODUÇÃO!
DASHBOARD_PASSWORD_HASH=$2b$10$X2xYz...ExampleHashNeverUseThis

# ------------------------------------------------------------------------------
# Logging
# ------------------------------------------------------------------------------
LOG_LEVEL=info                          # debug | info | warn | error
LOG_FORMAT=json                         # json | pretty

# ------------------------------------------------------------------------------
# Rate Limiting
# ------------------------------------------------------------------------------
RATE_LIMIT_TTL=60                       # Janela de tempo em segundos
RATE_LIMIT_LIMIT=100                    # Máximo de requisições por janela

# Opcional: Limites específicos
MAX_PAYLOAD_SIZE=1mb                    # Tamanho máximo do payload

# ------------------------------------------------------------------------------
# Retry & Backoff Configuration
# ------------------------------------------------------------------------------
RETRY_BASE_DELAY=1000                   # Delay inicial de retry (ms)
RETRY_MAX_DELAY=60000                   # Delay máximo de retry (ms)
RETRY_EXPONENTIAL_FACTOR=2              # Fator de crescimento exponencial

# ------------------------------------------------------------------------------
# Optional: Monitoring & Observability
# ------------------------------------------------------------------------------
# SES_QUOTA_WARNING_THRESHOLD=80        # % de quota para warning
# SES_QUOTA_CRITICAL_THRESHOLD=95       # % de quota para critical
# ENCRYPTION_SLOW_THRESHOLD_MS=200      # Log se encryption > 200ms

# ------------------------------------------------------------------------------
# Optional: Circuit Breaker (se implementar TASK-009)
# ------------------------------------------------------------------------------
# CIRCUIT_BREAKER_TIMEOUT=5000
# CIRCUIT_BREAKER_ERROR_THRESHOLD=50
# CIRCUIT_BREAKER_RESET_TIMEOUT=30000

# ==============================================================================
# CHECKLIST PRÉ-PRODUÇÃO
# ==============================================================================
# [ ] DATABASE_URL aponta para database de produção
# [ ] REDIS_HOST aponta para Redis de produção
# [ ] AWS credentials configuradas via IAM Role (NÃO via access keys)
# [ ] SES_FROM_ADDRESS verificado e fora do sandbox
# [ ] ENCRYPTION_KEY gerada com openssl rand -base64 32
# [ ] DASHBOARD_PASSWORD_HASH gerado com bcrypt (não senha plaintext)
# [ ] CORS_ORIGIN configurado com URL do dashboard de produção
# [ ] LOG_LEVEL=info ou warn (não debug)
# [ ] LOG_FORMAT=json (para aggregação de logs)
# [ ] Todas as secrets movidas para secrets manager
# [ ] .env NÃO commitado no git (verificar .gitignore)
# ==============================================================================
```

**Adicionar ao .gitignore (verificar se já existe):**

```
# Environment
.env
.env.local
.env.production
.env.*.local

# NUNCA commite estes arquivos:
*.pem
*.key
*.crt
credentials.json
secrets.json
```

**Documentação adicional:** `docs/setup/ENVIRONMENT_VARIABLES.md`

```markdown
# Environment Variables Guide

## Sensitive Variables

### Critical (Never Commit)
- `ENCRYPTION_KEY` - Lost key = lost data
- `AWS_SECRET_ACCESS_KEY` - AWS account access
- `DATABASE_URL` - Database credentials
- `DASHBOARD_PASSWORD_HASH` - Admin access

### Best Practices

#### Development
- Use `.env` file (gitignored)
- Use AWS CLI profiles instead of hardcoded keys
- Use test/sandbox SES account

#### Production
- **NEVER** hardcode secrets in code or .env files
- Use secrets manager:
  - AWS Secrets Manager
  - HashiCorp Vault
  - Kubernetes Secrets
- Use IAM roles instead of access keys
- Rotate secrets regularly (every 90 days)
- Audit secret access logs

## AWS Credentials Best Practices

### Development (Local)
```bash
# Option 1: AWS CLI Profile (RECOMMENDED)
aws configure --profile email-gateway
export AWS_PROFILE=email-gateway

# Option 2: Environment variables (if needed)
export AWS_ACCESS_KEY_ID=AKIA...
export AWS_SECRET_ACCESS_KEY=...
```

### Production (ECS/EC2/Lambda)
```yaml
# Use IAM Task Role (ECS)
TaskRoleArn: arn:aws:iam::123456789012:role/EmailGatewayTaskRole

# Or EC2 Instance Profile
IamInstanceProfile: arn:aws:iam::123456789012:instance-profile/EmailGatewayProfile
```

## Generating Secure Values

### ENCRYPTION_KEY
```bash
# Option 1: OpenSSL (recommended)
openssl rand -base64 32

# Option 2: Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

### DASHBOARD_PASSWORD_HASH
```bash
# Install bcrypt if not already
npm install bcrypt

# Generate hash
node -e "require('bcrypt').hash('your-secure-password', 10).then(console.log)"
```

## Verification

Before deploying, verify:
```bash
# Check no secrets in code
git grep -i "aws_secret"
git grep -i "encryption_key"

# Verify .gitignore
cat .gitignore | grep ".env"
```
```

## Categoria
**DevOps - Segurança Preventiva**

## Bloqueador para Produção?
**NÃO** - Mas fortemente recomendado. Previne commits acidentais de segredos.
