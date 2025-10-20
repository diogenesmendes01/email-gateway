# 🚀 Instruções de Setup - Email Gateway

## ✅ O que já está pronto

### 1. Estrutura do Monorepo

- ✅ Pastas criadas (`apps/`, `packages/`, `infra/`, etc)
- ✅ Workspaces npm configurado
- ✅ Schemas Zod movidos para `packages/shared/`
- ✅ Documentação de arquitetura completa

### 2. Arquivos Base Criados

#### Root

- ✅ `package.json` (workspaces)
- ✅ `docker-compose.yml` (Postgres + Redis)
- ✅ `.gitignore`
- ✅ `README.md`

#### packages/shared

- ✅ `package.json`
- ✅ `tsconfig.json`
- ✅ `src/schemas/email-send.schema.ts`
- ✅ `src/schemas/email-send.types.ts`
- ✅ `src/schemas/schemas-guide.md`
- ✅ `src/index.ts`

#### packages/database

- ✅ `package.json`
- ✅ `tsconfig.json`
- ✅ `src/client.ts` (Prisma client singleton)
- ✅ `src/index.ts`

#### apps/api

- ✅ `package.json`
- ✅ `tsconfig.json`
- ✅ `nest-cli.json`
- ✅ `.env.example`
- ✅ `src/main.ts`
- ✅ `src/app.module.ts`
- ✅ Estrutura de pastas (modules/, common/, config/)

---

## 📋 Próximos Passos

### Passo 1: Instalar Dependências

```bash
# Na raiz do projeto
npm install

# Isso instalará TODAS as dependências de todos os workspaces
```

### Passo 2: Subir Banco de Dados

```bash
# Subir Postgres + Redis
npm run docker:up

# Verificar se estão rodando
docker ps
```

Você deve ver:

- `email-gateway-postgres` (porta 5432)
- `email-gateway-redis` (porta 6379)

### Passo 3: Criar Prisma Schema (TASK 5.1)

**Localização:** `packages/database/prisma/schema.prisma`

Criar o schema com as tabelas:

- `companies`
- `recipients`
- `email_outbox`
- `email_logs`
- `email_events`
- `idempotency_keys`

Referência: [docs/00-pacote-documentos-arquitetura-mvp.md](./00-pacote-documentos-arquitetura-mvp.md) seção 5

### Passo 4: Gerar Prisma Client

```bash
npm run db:generate
```

### Passo 5: Criar e Rodar Migrations

```bash
npm run db:migrate:dev
```

### Passo 6: Implementar Módulos da API

#### 6.1 Health Module (Simples)

**Localização:** `apps/api/src/modules/health/`

- `controllers/health.controller.ts`
- `health.module.ts`

Endpoints:

- `GET /v1/health` - Health check básico
- `GET /v1/health/ready` - Readiness (verifica DB + Redis)

#### 6.2 Auth Module (Guards)

**Localização:** `apps/api/src/modules/auth/`

- `guards/api-key.guard.ts`
- `guards/ip-allowlist.guard.ts`
- `auth.module.ts`

#### 6.3 Email Module (Principal)

**Localização:** `apps/api/src/modules/email/`

- `controllers/email.controller.ts`
- `services/email.service.ts`
- `services/outbox.service.ts`
- `services/queue.service.ts`
- `dto/` (importar de `@email-gateway/shared`)
- `email.module.ts`

Endpoints:

- `POST /v1/email/send`
- `GET /v1/emails`
- `GET /v1/emails/:id`

#### 6.4 Recipient Module

**Localização:** `apps/api/src/modules/recipient/`

- `services/recipient.service.ts`
- `recipient.module.ts`

Responsável por:

- Upsert de recipients
- Hash de CPF/CNPJ
- Masking

### Passo 7: Implementar Common (Pipes, Filters, etc)

#### 7.1 Pipes

**Localização:** `apps/api/src/common/pipes/`

- `zod-validation.pipe.ts` - Pipe para validação com Zod

#### 7.2 Filters

**Localização:** `apps/api/src/common/filters/`

- `http-exception.filter.ts` - Formata erros no padrão da API

#### 7.3 Interceptors

**Localização:** `apps/api/src/common/interceptors/`

- `logging.interceptor.ts` - Logs de requisições
- `timeout.interceptor.ts` - Timeout de requisições

### Passo 8: Configurar BullMQ

**Referência:** TASK 3.1, 3.2

- Configurar Redis connection
- Criar fila `email-send`
- Configurar retry/backoff
- Configurar DLQ

### Passo 9: Implementar Worker

**Localização:** `apps/worker/`

- Criar package.json, tsconfig
- Implementar processors
- Integração com SES
- Retry strategy

### Passo 10: Testes

- Testes unitários
- Testes de integração
- Testes E2E

---

## 🧪 Testando o Setup Atual

Após instalar dependências:

```bash
# Testar build do shared
cd packages/shared
npm run build

# Testar build do database
cd ../database
npm run build

# Voltar à raiz
cd ../..
```

---

## 🐛 Troubleshooting

### Erro: "Cannot find module @email-gateway/shared"

**Solução:**

```bash
# Rebuild
npm run build

# Ou força reinstalação
rm -rf node_modules packages/*/node_modules apps/*/node_modules
npm install
```

### Erro: "Prisma schema not found"

**Solução:**

```bash
# Criar o schema primeiro (Passo 3)
# Depois:
npm run db:generate
```

### Docker não sobe

**Solução:**

```bash
# Verificar portas
lsof -i :5432
lsof -i :6379

# Se ocupadas, parar ou mudar portas no docker-compose.yml
```

---

## 📚 Referências Úteis

### Documentação do Projeto

- [Arquitetura MVP](./00-pacote-documentos-arquitetura-mvp.md)
- [Contrato POST /v1/email/send](./api/03-email-send-contract.md)
- [Schemas Guide](../packages/shared/src/schemas/schemas-guide.md)

### TASKs (em ordem)

1. ✅ **TASK 0.1** — Estrutura de diretórios ✅ **FEITO**
2. ✅ **TASK 2.1** — POST /v1/email/send (contrato) ✅ **FEITO**
3. 🔄 **TASK 5.1** — Prisma schema ← **PRÓXIMO**
4. 🔄 **TASK 2.2** — GET endpoints
5. 🔄 **TASK 3.1** — Job contract
6. 🔄 **TASK 4.1** — Worker pipeline
7. ... (continua)

### Tecnologias

- [NestJS](https://nestjs.com/)
- [Prisma](https://www.prisma.io/)
- [Zod](https://zod.dev/)
- [BullMQ](https://docs.bullmq.io/)
- [Redis](https://redis.io/)
- [PostgreSQL](https://www.postgresql.org/)

---

## ✅ Checklist de Setup Completo

- [x] Estrutura de pastas criada
- [x] package.json (root) com workspaces
- [x] Schemas movidos para packages/shared
- [x] docker-compose.yml criado
- [ ] npm install executado
- [ ] Docker subiu (Postgres + Redis)
- [ ] Prisma schema criado
- [ ] Migrations rodadas
- [ ] API roda (`npm run dev:api`)
- [ ] Health check funcionando
- [ ] POST /v1/email/send implementado

---

**Status Atual:** 🟡 Setup inicial completo, pronto para implementação

**Próximo:** Criar Prisma Schema (TASK 5.1)
