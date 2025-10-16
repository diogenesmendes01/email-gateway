# Documentação do Projeto - MVP Envio de Boletos

Bem-vindo à documentação do sistema de envio de boletos por e-mail.

## Estrutura da Documentação

```
docs/
├── architecture/          # Documentação de arquitetura geral
├── api/                  # Documentação da API REST
├── queue-redis/          # Documentação do sistema de filas
├── worker/               # Documentação dos workers
├── data/                 # Documentação de modelos de dados
├── frontend/             # Documentação do frontend
├── adrs/                 # Architecture Decision Records
├── runbooks/             # Guias operacionais
├── testing/              # Documentação de testes
└── CONTRIBUTING-docs.md  # Guia de contribuição
```

## Documentos Principais

### Arquitetura
- [Visão Geral do Sistema](./architecture/01-visao-geral-sistema.md) - Arquitetura completa e componentes principais

### ADRs (Architecture Decision Records)
- [ADR-20250116: Escolha do Redis Queue](./adrs/ADR-20250116-escolha-redis-queue.md) - Decisão sobre sistema de filas

## Como Contribuir

Ao adicionar ou modificar documentação, siga as diretrizes em [CONTRIBUTING-docs.md](./CONTRIBUTING-docs.md).

### Convenções de Nomenclatura

- **Documentação geral**: `NN-nome-kebab.md` (ex: `01-visao-geral.md`)
- **ADRs**: `ADR-YYYYMMDD-titulo.md` (ex: `ADR-20250116-escolha-redis-queue.md`)
- **Runbooks**: `nome-descritivo-kebab.md` (ex: `deploy-producao.md`)

### Templates Disponíveis

- [TEMPLATE-DOC.md](./TEMPLATE-DOC.md) - Template para documentação geral
- [TEMPLATE-ADR.md](./TEMPLATE-ADR.md) - Template para Architecture Decision Records

## Validação Automática

Este repositório possui validação automática de documentação em PRs que verifica:

- Nomenclatura de arquivos
- Sintaxe Markdown
- Links quebrados
- Diagramas Mermaid

## Links Úteis

- [Documentação de Arquitetura Principal](./00-pacote-documentos-arquitetura-mvp.md)
- [README Principal do Projeto](../README.md)
- [Guia de Setup](../SETUP-CHECKLIST.md)
- [Estrutura do Projeto](../STRUCTURE.md)

---

**Última atualização:** 2025-10-16
