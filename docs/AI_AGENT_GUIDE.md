# Guia para Agentes de IA

## 🎯 Objetivo

Este documento garante que agentes de IA (como Claude, GitHub Copilot, ChatGPT) sigam as regras do projeto ao criar commits, branches e Pull Requests.

---

## ⚡ LEIA ISTO PRIMEIRO

**Se você está implementando uma nova feature ou task:**

### 🚀 Comece por aqui:
1. **PRIMEIRO:** Leia [../NEW-FEATURES.md](../NEW-FEATURES.md) - Guia rápido de início
2. Use a decision tree para identificar seu tipo de tarefa (API, Worker, Bug Fix, etc.)
3. Siga apenas os documentos essenciais listados para seu tipo de tarefa
4. Use os quick patterns e checklists fornecidos

**Economia de tempo:** 70% menos documentos para ler, contexto focado.

---

## 📚 Documentos Obrigatórios - LEIA ANTES DE TUDO

Você **DEVE** ler e seguir **TODOS** esses documentos antes de qualquer ação:

### 0️⃣ **Guia de Início Rápido (COMECE AQUI)** ⚡

- [../NEW-FEATURES.md](../NEW-FEATURES.md) - **LEIA PRIMEIRO** - Decision tree, quick patterns, troubleshooting

### 1️⃣ Configuração Básica

- [CONTRIBUTING.md](../CONTRIBUTING.md) - Guia completo de contribuição
- [README.md](../README.md) - Visão geral do projeto
- [.clauderc](../.clauderc) - Configurações específicas para Claude

### 2️⃣ **Padrões de Código e Testes (CRÍTICO)** ⚠️

- [CODE-QUALITY-STANDARDS.md](CODE-QUALITY-STANDARDS.md) - **OBRIGATÓRIO** - Exception handling, logging, configuration
- [testing/03-testing-standards.md](testing/03-testing-standards.md) - **OBRIGATÓRIO** - Cobertura mínima 70%, padrões de testes

### 3️⃣ Regras de PR e Review

- [.github/pull_request_template.md](../.github/pull_request_template.md) - Template obrigatório de PR
- [PR_REVIEW_RULES.md](PR_REVIEW_RULES.md) - Como revisar PRs (severidades, eixos)
- [PR_ADJUSTMENTS.md](PR_ADJUSTMENTS.md) - Como tratar comentários de review

### 4️⃣ Templates e Automações

- [task/TEMPLATE-PR-TASK.md](../task/TEMPLATE-PR-TASK.md) - Template para registrar tarefas fora de escopo
- [.github/workflows/semantic-pr.yml](../.github/workflows/semantic-pr.yml) - Validação de título de PR
- [.github/labeler.yml](../.github/labeler.yml) - Aplicação automática de labels

## 🔒 Regras Críticas de Segurança

### ❌ NUNCA FAÇA ISSO

- Commitar arquivos `.env`, `.env.local`, `.env.*.local`
- Expor secrets, API keys, tokens no código
- Commitar `node_modules/`, `dist/`, arquivos de build
- Commitar credenciais em qualquer formato
- Fazer push de arquivos temporários (`nul`, `*.tmp`, `*.log`)

### ✅ SEMPRE FAÇA ISSO

- Verificar `.gitignore` está configurado corretamente
- Executar `git status` antes de commitar
- Validar que não há informações sensíveis
- Usar `.env.example` como referência

## 🌿 Convenções de Branch (OBRIGATÓRIO)

Use **APENAS** esses prefixos:

| Prefixo | Uso | Exemplo |
|---------|-----|---------|
| `feature/*` | Nova funcionalidade | `feature/add-rate-limiting` |
| `fix/*` | Correção de bug | `fix/email-validation-error` |
| `hotfix/*` | Correção urgente em produção | `hotfix/security-patch` |
| `refactor/*` | Refatoração de código | `refactor/simplify-queue-logic` |
| `chore/*` | Tarefas de manutenção | `chore/update-dependencies` |
| `docs/*` | Documentação | `docs/add-api-examples` |
| `release/*` | Release | `release/v1.0.0` |

## 📝 Conventional Commits (OBRIGATÓRIO)

**Formato:**

```
<tipo>(<escopo-opcional>): <descrição curta em minúsculo>

<corpo opcional - descreve o "porquê" não o "o quê">

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>
```

**Tipos permitidos:**

- `feat` - Nova funcionalidade
- `fix` - Correção de bug
- `chore` - Tarefas de manutenção
- `docs` - Documentação
- `style` - Formatação (sem mudança de lógica)
- `refactor` - Refatoração
- `perf` - Melhorias de performance
- `test` - Adição/correção de testes
- `build` - Build system
- `ci` - CI/CD

**Exemplos:**

```bash
feat(api): adiciona endpoint de health check

Implementa /health para monitoramento de infraestrutura.
Retorna status do Redis e PostgreSQL.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>
```

```bash
fix(worker): corrige retry infinito na fila

Adiciona limite máximo de tentativas conforme QUEUE_MAX_RETRIES.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>
```

## 🔄 Workflow Completo para Criar uma PR

### Fase 1: Planejamento

1. **Ler o escopo** da tarefa/issue completamente
2. **Consultar documentação** de arquitetura relacionada
3. **Identificar impactos:**
   - Migrations necessárias?
   - Novas variáveis de ambiente?
   - Breaking changes?
4. **Criar TODO list** mental ou no código do que será feito

### Fase 2: Desenvolvimento

1. **Criar branch** com nomenclatura correta:

   ```bash
   git checkout -b feature/nome-descritivo
   ```

2. **Desenvolver mantendo escopo aderente:**
   - Fazer **APENAS** o que foi solicitado
   - Evitar scope creep (adicionar coisas extras)
   - Se surgir algo importante fora do escopo, registrar em `/task`

3. **Fazer commits incrementais:**

   ```bash
   git add <arquivos>
   git commit -m "feat: descrição clara"
   ```

### Fase 3: Validação

1. **Validar manualmente:**
   - Testar todas as mudanças
   - Verificar se não quebrou nada
   - Validar critérios de aceite

2. **Verificar segurança:**

   ```bash
   git status  # Ver o que será commitado
   git diff    # Ver mudanças exatas
   ```

3. **Verificar qualidade:**
   - Código legível e bem estruturado?
   - Logs apropriados (sem vazar dados sensíveis)?
   - Documentação atualizada se necessário?

### Fase 4: Abrir PR

1. **Push da branch:**

   ```bash
   git push -u origin feature/nome-descritivo
   ```

2. **Criar PR preenchendo TODO o template:**
   - Resumo do que foi pedido (3-5 linhas)
   - Lista de "O que foi feito"
   - Critérios de aceite (marcados)
   - **Impacto técnico completo:**
     - Migrations (sim/não; quais)
     - Env vars (sim/não; quais)
     - Breaking changes (sim/não; explique)
     - Observabilidade (logs/métricas)
     - Link para doc de arquitetura
   - **Como validar manualmente** (passos)
   - **Riscos e rollback**
   - **Escopo vs Fora de escopo**

3. **Se houver itens fora de escopo:**
   - Criar arquivo `/task/PR<numero>-TASK<id>.md`
   - Usar template de [task/TEMPLATE-PR-TASK.md](../task/TEMPLATE-PR-TASK.md)

## 📋 Template de Pull Request - Checklist

Antes de abrir a PR, verifique:

- [ ] Título segue Conventional Commits (ex: `feat: adiciona X`)
- [ ] Branch usa prefixo correto (`feature/*`, `fix/*`, etc)
- [ ] Preencheu "Resumo do que foi pedido"
- [ ] Listou "O que foi feito"
- [ ] Marcou "Critérios de aceite"
- [ ] Documentou "Impacto técnico" (migrations, env vars, breaking changes)
- [ ] Adicionou "Como validar manualmente"
- [ ] Documentou "Riscos / rollback"
- [ ] Indicou "Escopo x Fora de escopo"
- [ ] Sugeriu labels apropriadas
- [ ] Commits seguem Conventional Commits
- [ ] Sem arquivos `.env` ou credenciais commitados
- [ ] Validou manualmente as mudanças

## 🏷️ Sistema de Labels

Labels são aplicadas **automaticamente** via [.github/labeler.yml](../.github/labeler.yml) baseado em:

- Caminho dos arquivos modificados
- Prefixo da branch

Você pode **sugerir** labels na PR:

### Tipo

- `tipo:feature` - Nova funcionalidade
- `tipo:bug` - Correção de bug
- `tipo:refactor` - Refatoração

### Prioridade

- `prioridade:1-urgente` - Crítico, resolver imediatamente
- `prioridade:2-alta` - Alta prioridade
- `prioridade:3-media` - Prioridade média
- `prioridade:4-baixa` - Baixa prioridade
- `prioridade:5-baixa` - Muito baixa prioridade

### Escopo

- `escopo:aderente` - Mudanças dentro do escopo
- `escopo:fora` - Mudanças fora do escopo (registrar em `/task`)

## ⚠️ Hotfix - Regras Especiais

PRs com branch `hotfix/*` têm processo **acelerado**, mas:

### ✅ Pode ter requisitos reduzidos

- Documentação pode ser mínima
- Testes podem ser adicionados depois

### ❌ NÃO pode comprometer

- **Segurança** - continua obrigatória
- **Riscos documentados** - devem estar explícitos
- **Plano de rollback** - obrigatório e claro

### 📝 Template hotfix simplificado

```markdown
## Problema
<Descrever o problema crítico>

## Solução
<Descrever a correção>

## Como validar
<Passos para testar>

## Riscos
<Listar riscos conhecidos>

## Rollback
<Como reverter se necessário>
```

## 🚫 Bloqueios de Merge

Uma PR **NÃO PODE** ser mergeada se:

- ❌ Houver itens **Critical** abertos
- ❌ Houver itens **Moderate** marcados como "Deve ser feito" não resolvidos
- ❌ Validação de Conventional Commits falhar (semantic-pr.yml)
- ❌ Segurança estiver comprometida
- ❌ Tests falharem (quando houver)

## 📊 Severidades em Reviews

Quando receber comentários de review:

### 🔴 Critical

- **Bloqueia merge**
- Corrigir **imediatamente**
- Exemplos: quebra funcional, segurança, compliance, performance grave

### 🟡 Moderate

- **Deve ser feito** antes do merge
- Corrigir antes de mergar
- Exemplos: qualidade, manutenibilidade, testabilidade

### 🟢 Suggestion

- **Opcional**, não bloqueia
- Avaliar se é importante e aderente ao escopo
- Se não for urgente ou estiver fora do escopo, registrar em `/task`

## 📁 Registrar Itens Fora de Escopo

Quando algo surgir que **não** faz parte do escopo atual:

1. **Criar arquivo:**

   ```
   /task/PR<numero>-TASK<id>.md
   ```

2. **Usar template:** [task/TEMPLATE-PR-TASK.md](../task/TEMPLATE-PR-TASK.md)

3. **Conteúdo mínimo:**

   ```markdown
   # PR<numero> - TASK <id> - <resumo>

   ## Contexto
   - Origem: PR #<numero>
   - Descrição: <por que ficou fora do escopo>

   ## O que precisa ser feito
   - [ ] Item 1
   - [ ] Item 2

   ## Urgência
   - **Nível (1–5):** <número>
   ```

## 🚀 Fluxo de Trabalho Otimizado

### Para Implementar Nova Feature/Task:

```
1. ⚡ Ler NEW-FEATURES.md (30 segundos)
   └─ Identificar tipo de tarefa via decision tree

2. 📚 Ler apenas documentos essenciais (20 minutos)
   └─ NEW-FEATURES.md lista 2-4 docs específicos
   └─ Ignorar resto da documentação

3. 💻 Copiar quick pattern relevante (10 segundos)
   └─ Adaptar para sua tarefa específica

4. ✅ Implementar seguindo checklist (variável)
   └─ Validar cada item do checklist

5. 🧪 Rodar testes e validações
   └─ npm run test:cov (cobertura >= 70%)
   └─ npm run lint
   └─ npm run build

6. 📝 Criar PR seguindo template
   └─ Usar checklist de qualidade

Total: ~70% menos tempo de leitura!
```

---

## 🤖 Checklist Final para Agentes de IA

Antes de **qualquer** ação de commit/push/PR, verifique:

- [ ] **Li NEW-FEATURES.md e identifiquei meu tipo de tarefa**
- [ ] Li todos os documentos essenciais para meu tipo de tarefa
- [ ] Entendi o escopo da tarefa
- [ ] Branch usa nomenclatura correta
- [ ] Commits seguem Conventional Commits
- [ ] Nenhum arquivo sensível será commitado
- [ ] Validei manualmente as mudanças
- [ ] Template de PR será preenchido completamente
- [ ] Itens fora de escopo estão registrados em `/task`
- [ ] Não há scope creep (adicionar coisas extras)

### ⚠️ Checklist de Qualidade de Código (CRÍTICO)

- [ ] **Testes implementados:**
  - [ ] Testes unitários para serviços/utilitários
  - [ ] Testes de integração para APIs/workers
  - [ ] Cobertura >= 70% (verificar com `npm run test:cov`)
- [ ] **Padrões de código seguidos:**
  - [ ] Exception handling com filtro global (ver `CODE-QUALITY-STANDARDS.md`)
  - [ ] Logging estruturado em JSON (sem PII)
  - [ ] Request ID propagado em toda a cadeia
  - [ ] Environment variables validadas
  - [ ] TypeScript strict mode (sem `any`)
  - [ ] Queries otimizadas com índices corretos

## 📖 Referências

- [Conventional Commits](https://www.conventionalcommits.org/)
- [Semantic Versioning](https://semver.org/)
- [GitHub Flow](https://guides.github.com/introduction/flow/)

---

**⚡ TL;DR para IAs:**

1. Leia CONTRIBUTING.md, PR_REVIEW_RULES.md, PR_ADJUSTMENTS.md
2. Use branches `feature/*`, `fix/*`, `hotfix/*`, etc
3. Commits: Conventional Commits
4. NUNCA commite .env ou credenciais
5. Preencha TODO o template de PR
6. Registre itens fora de escopo em /task
7. Não faça scope creep
