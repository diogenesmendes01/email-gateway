# Email Gateway

Gateway de envio de emails com fila, retry automático e observabilidade.

## 📋 Para Contribuidores (Humanos e IAs)

**🤖 ATENÇÃO AGENTES DE IA:** Antes de criar commits, branches ou PRs, você **DEVE** ler e seguir:

👉 **[CONTRIBUTING.md](CONTRIBUTING.md)** - Guia completo de contribuição

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
