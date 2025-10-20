# Email Gateway - MVP

Sistema de envio de boletos por e-mail com arquitetura assíncrona baseada em filas.

## 📁 Estrutura do Projeto (Monorepo)

```
email-gateway/
├── apps/                    # Aplicações
│   ├── api/                # API REST NestJS
│   ├── worker/             # Worker de processamento
│   └── dashboard/          # Dashboard React
├── packages/               # Código compartilhado
│   ├── shared/            # Schemas, types, utils
│   └── database/          # Prisma + client
├── docs/                   # Documentação
├── infra/                  # Infraestrutura (Docker, Nginx, etc)
└── scripts/               # Scripts auxiliares
```

## 🔐 Configuração de Segurança

### Chave de Criptografia (OBRIGATÓRIO)

O sistema usa criptografia AES-256-CBC para proteger dados sensíveis (CPF/CNPJ). É **obrigatório** configurar uma chave segura:

```bash
# Gerar chave de 32 bytes (256 bits)
openssl rand -base64 32

# Adicionar ao arquivo .env
ENCRYPTION_KEY="sua-chave-gerada-aqui"
```

**⚠️ IMPORTANTE:**
- A chave deve ter pelo menos 32 caracteres
- Use chaves diferentes para dev/staging/prod
- NUNCA commite a chave no repositório
- A aplicação falhará ao iniciar sem uma chave válida

### Validação de Segurança

Execute o script de teste para validar a implementação:

```bash
npm run test:security
# ou
npx tsx scripts/test-encryption.ts
```

---

## 📋 Para Contribuidores (Humanos e IAs)

### 🤖 Para Agentes de IA Implementando Features

**⚡ COMECE AQUI - Leia isto PRIMEIRO:**

👉 **[NEW-FEATURES.md](NEW-FEATURES.md)** - Guia rápido de início (30 segundos)

**O que este guia oferece:**
- ✅ **Decision tree** para identificar seu tipo de tarefa
- ✅ **Documentos essenciais** específicos (em vez de ler todos os 20+ docs)
- ✅ **Quick patterns** prontos para copiar e adaptar
- ✅ **Checklists** para validação
- ✅ **Troubleshooting** para problemas comuns

**Economia:** 70% menos documentos para ler, contexto focado.

---

### 📚 Documentação Completa

**Para workflow de Git/PRs:**

👉 **[docs/AI_AGENT_GUIDE.md](docs/AI_AGENT_GUIDE.md)** - Regras de commits, branches, PRs

**Para padrões de qualidade:**

- [docs/CODE-QUALITY-STANDARDS.md](docs/CODE-QUALITY-STANDARDS.md) - Exception handling, logging, config
- [docs/testing/TESTING-STANDARDS.md](docs/testing/TESTING-STANDARDS.md) - Testes (cobertura >= 70%)

### Links Rápidos para Regras

- [Template de Pull Request](.github/pull_request_template.md)
- [Regras de Review](docs/PR_REVIEW_RULES.md)
- [Regras de Ajustes](docs/PR_ADJUSTMENTS.md)
- [Template de Tarefas](task/TEMPLATE-PR-TASK.md)

### Convenções Obrigatórias

- **Branches:** `feature/*`, `fix/*`, `hotfix/*`, `refactor/*`, `chore/*`, `docs/*`
- **Commits:** [Conventional Commits](https://www.conventionalcommits.org/)
- **PRs:** Preencher template completo
- **Segurança:** NUNCA commitar `.env` ou credenciais

## 🏗️ Arquitetura

Consulte a [documentação de arquitetura](docs/) para entender a estrutura do projeto.

## 🚀 Como Começar

```bash
# Instalar dependências
npm install

# Configurar variáveis de ambiente
cp .env.example .env

# Subir serviços (Redis, PostgreSQL)
docker-compose up -d

# Rodar API
npm run dev:api

# Rodar Worker
npm run dev:worker
```

## 📖 Documentação

- [Arquitetura MVP](docs/)
- [Regras de Contribuição](CONTRIBUTING.md)
- [Workflows GitHub Actions](.github/workflows/)

## 🧪 Testes

```bash
# Rodar testes
npm test

# Rodar com coverage
npm run test:coverage
```

## 📦 Build

```bash
# Build de produção
npm run build

# Iniciar em produção
npm start
```

## 🤝 Contribuindo

Leia o [CONTRIBUTING.md](CONTRIBUTING.md) antes de fazer qualquer alteração.

## 📝 Licença

[Adicionar licença]
