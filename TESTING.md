# 🧪 Guia de Testes - Track 1

Este documento descreve como testar a implementação do Track 1 - Drivers & Infrastructure.

## 📋 Índice

1. [Testes Automatizados](#testes-automatizados)
2. [Testes de Integração](#testes-de-integração)
3. [Testes Manuais](#testes-manuais)
4. [Resultados Esperados](#resultados-esperados)

---

## 🤖 Testes Automatizados

### Script de Validação Completa

Execute o script principal de testes:

```bash
./test-track1.sh
```

Este script verifica:
- ✅ Build de todos os workspaces
- ✅ Estrutura de arquivos (drivers, services, modules)
- ✅ Schema Prisma (8 modelos)
- ✅ Exports corretos
- ✅ Dependências instaladas
- ✅ Integração no App Module
- ✅ TypeScript Config

**Resultado Esperado:**
```
🎉 TESTES CONCLUÍDOS
Track 1 - Drivers & Infrastructure: 100% ✅
```

### Testes Unitários

Os testes unitários estão localizados em `apps/worker/src/services/__tests__/`:

1. **IP Pool Selector** (`ip-pool-selector.service.spec.ts`)
   - Seleção de pool por ID
   - Fallback por tipo
   - Ordenação por reputação
   - Retorno null quando nenhum pool disponível

2. **MX Rate Limiter** (`mx-rate-limiter.service.spec.ts`)
   - Limites por segundo
   - Limites por minuto
   - Extração de domínio
   - Limites diferentes por domínio
   - Fallback quando Redis falha

3. **Error Mapping** (`error-mapping.service.spec.ts`)
   - Mapeamento de erros SES
   - Mapeamento de erros Postal
   - Erros de rate limit
   - Classificação de erros (retryable vs permanent)

**Executar testes unitários:**
```bash
npm test --workspace=apps/worker
```

---

## 🔗 Testes de Integração

### Script de Teste da API

Execute o script de integração:

```bash
./test-api-integration.sh
```

Este script testa os endpoints HTTP:

#### Provider Module
- `GET /providers` - Listar providers
- `GET /providers/:id` - Buscar provider
- `POST /providers` - Criar provider
- `PUT /providers/:id` - Atualizar provider
- `DELETE /providers/:id` - Deletar provider
- `POST /providers/:id/test` - Testar provider

#### IP Pool Module
- `GET /ip-pools` - Listar IP pools
- `GET /ip-pools/:id` - Buscar IP pool
- `POST /ip-pools` - Criar IP pool
- `PUT /ip-pools/:id` - Atualizar IP pool
- `DELETE /ip-pools/:id` - Deletar IP pool

#### Rate Limit Module
- `GET /rate-limits` - Listar rate limits
- `GET /rate-limits/:id` - Buscar rate limit
- `POST /rate-limits` - Criar rate limit
- `PUT /rate-limits/:id` - Atualizar rate limit
- `DELETE /rate-limits/:id` - Deletar rate limit

**Pré-requisitos:**
```bash
# 1. Iniciar a API
npm run start:dev --workspace=apps/api

# 2. Em outro terminal, executar os testes
./test-api-integration.sh
```

---

## 🖐️ Testes Manuais

### 1. Testar Criação de Provider

```bash
curl -X POST http://localhost:3000/providers \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "AWS_SES",
    "name": "Production SES",
    "isActive": true,
    "priority": 0,
    "config": {
      "region": "us-east-1",
      "accessKeyId": "YOUR_KEY",
      "secretAccessKey": "YOUR_SECRET"
    },
    "maxPerSecond": 14,
    "maxPerMinute": 1000
  }'
```

### 2. Testar Criação de IP Pool

```bash
curl -X POST http://localhost:3000/ip-pools \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Production Pool",
    "type": "TRANSACTIONAL",
    "ipAddresses": ["192.168.1.1", "192.168.1.2"],
    "isActive": true,
    "dailyLimit": 100000,
    "hourlyLimit": 5000
  }'
```

### 3. Testar Criação de Rate Limit

```bash
curl -X POST http://localhost:3000/rate-limits \
  -H "Content-Type: application/json" \
  -d '{
    "scope": "MX_DOMAIN",
    "target": "gmail.com",
    "perMinute": 600,
    "perHour": 10000,
    "perDay": 100000
  }'
```

### 4. Testar Drivers (Requer configuração)

```typescript
// Em apps/worker/src/index.ts ou em um script de teste

import { SESDriver } from './drivers/aws-ses/ses-driver';
import { PostalSMTPDriver } from './drivers/postal/postal-smtp-driver';

// Testar SES Driver
const sesDriver = new SESDriver();
const sesResult = await sesDriver.sendEmail(
  {
    to: 'test@example.com',
    from: 'sender@yourdomain.com',
    subject: 'Test Email',
    // ... outros campos
  },
  {
    provider: 'AWS_SES',
    region: 'us-east-1',
    credentials: { /* ... */ }
  },
  {
    htmlContent: '<p>Test</p>',
  }
);

console.log('SES Result:', sesResult);

// Testar Postal Driver
const postalDriver = new PostalSMTPDriver();
const postalResult = await postalDriver.sendEmail(
  {
    to: 'test@example.com',
    from: 'sender@yourdomain.com',
    subject: 'Test Email',
    // ... outros campos
  },
  {
    provider: 'POSTAL_SMTP',
    host: 'smtp.postal.example.com',
    port: 587,
    // ... outros campos
  },
  {
    htmlContent: '<p>Test</p>',
  }
);

console.log('Postal Result:', postalResult);
```

---

## ✅ Resultados Esperados

### Build System
```
✅ @email-gateway/api - 0 erros
✅ @email-gateway/worker - 0 erros
✅ @email-gateway/shared - 0 erros
✅ @email-gateway/database - 0 erros
```

### Estrutura de Arquivos
```
✅ 9 Drivers implementados
✅ 21 Services implementados
✅ 18 Módulos API
```

### Schema Prisma
```
✅ EmailProviderConfig
✅ IPPool
✅ RateLimit
✅ Suppression
✅ DNSRecord
✅ DomainOnboarding
✅ EmailTracking
✅ ReputationMetric
```

### Exports
```
✅ EmailProvider enum
✅ IPPoolType enum
✅ RateLimitScope enum
✅ SuppressionReason enum
✅ DomainOnboardingStatus enum
```

### Dependências
```
✅ nodemailer
✅ @nestjs/bullmq
✅ @types/nodemailer
```

---

## 🐛 Troubleshooting

### Erro: "Cannot find module '@email-gateway/database'"

```bash
# Rebuild o workspace database
npm run build --workspace=packages/database
```

### Erro: "Prisma Client not generated"

```bash
# Regenerar Prisma Client
cd packages/database
npx prisma generate
```

### Erro: "Redis connection failed"

```bash
# Verificar se Redis está rodando
redis-cli ping

# Ou iniciar Redis
redis-server
```

### Erro: "Database connection failed"

```bash
# Verificar variáveis de ambiente
cat .env | grep DATABASE_URL

# Executar migrações
npx prisma migrate dev
```

---

## 📊 Cobertura de Testes

### Componentes Testados

| Componente | Tipo | Status |
|------------|------|--------|
| IPPoolSelectorService | Unit | ✅ |
| MXRateLimiterService | Unit | ✅ |
| ErrorMappingService | Unit | ✅ |
| SESDriver | Integration | ⚠️ Manual |
| PostalSMTPDriver | Integration | ⚠️ Manual |
| EmailDriverService | Integration | ⚠️ Manual |
| ProviderModule API | Integration | ✅ |
| IpPoolModule API | Integration | ✅ |
| RateLimitModule API | Integration | ✅ |

**Legenda:**
- ✅ Automatizado
- ⚠️ Manual (requer configuração externa)

---

## 🚀 Próximos Passos

1. **Adicionar mais testes unitários:**
   - EmailDriverService
   - DriverFactory
   - Bounce/Complaint parsers

2. **Adicionar testes E2E:**
   - Fluxo completo de envio de email
   - Fallback entre drivers
   - Rate limiting em ação

3. **Adicionar testes de carga:**
   - Performance do rate limiter
   - Seleção de IP pools sob carga
   - Throughput dos drivers

4. **Adicionar testes de integração com serviços reais:**
   - AWS SES (sandbox)
   - Postal (instância de teste)
   - Redis (container Docker)

---

## 📝 Notas

- Os testes unitários usam mocks para isolar componentes
- Os testes de integração requerem API rodando
- Os testes manuais requerem credenciais reais
- Sempre teste em ambiente de desenvolvimento primeiro

---

**Última atualização:** Track 1 - 100% Implementado ✅

