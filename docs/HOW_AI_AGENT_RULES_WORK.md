# Como Funciona o Sistema de Regras para Agentes de IA

## 🎯 Objetivo

Este documento explica **como** os agentes de IA (Claude Code, GitHub Copilot, ChatGPT, etc.) vão seguir as regras do projeto.

## 🔍 Métodos Implementados

### 1️⃣ CONTRIBUTING.md (✅ Funciona Nativamente)

**Arquivo:** [CONTRIBUTING.md](../CONTRIBUTING.md)

**Como funciona:**

- Padrão **universal** do GitHub/GitLab/Bitbucket
- Agentes de IA são **treinados** para procurar e ler este arquivo
- Claude Code, GitHub Copilot, ChatGPT **automaticamente** consideram este arquivo

**Quando é lido:**

- Quando o agente explora o repositório pela primeira vez
- Antes de fazer commits (em agentes bem treinados)
- Quando solicitado a contribuir com código

**Garantia:** ⭐⭐⭐⭐⭐ (Alta - é o método mais confiável)

---

### 2️⃣ README.md (✅ Funciona Nativamente)

**Arquivo:** [README.md](../README.md)

**Como funciona:**

- **Primeiro** arquivo lido por qualquer pessoa ou IA
- Contém destaque visual para agentes de IA:

  ```markdown
  ## 📋 Para Contribuidores (Humanos e IAs)

  **🤖 ATENÇÃO AGENTES DE IA:** Antes de criar commits...
  ```

**Quando é lido:**

- **Sempre** ao abrir o repositório
- Primeiro contexto que o agente recebe

**Garantia:** ⭐⭐⭐⭐⭐ (Alta - sempre é lido)

---

### 3️⃣ .claude/commands/*.md (✅ Funciona - Claude Code Específico)

**Arquivos criados:**

- [.claude/commands/rules.md](../.claude/commands/rules.md)
- [.claude/commands/pre-commit-check.md](../.claude/commands/pre-commit-check.md)
- [.claude/commands/pre-pr-check.md](../.claude/commands/pre-pr-check.md)

**Como funciona:**

- Claude Code permite criar **slash commands** customizados
- Você ou outro agente pode executar `/rules`, `/pre-commit-check`, `/pre-pr-check`
- Esses comandos exibem as regras diretamente no contexto

**Como usar:**

```bash
# No Claude Code, digite:
/rules                # Ver regras gerais
/pre-commit-check     # Checklist antes de commitar
/pre-pr-check         # Checklist antes de abrir PR
```

**Quando usar:**

- **Manualmente:** Quando você quiser revisar as regras
- **Antes de commits:** Execute `/pre-commit-check`
- **Antes de PRs:** Execute `/pre-pr-check`

**Garantia:** ⭐⭐⭐⭐ (Alta para Claude Code - requer execução manual)

---

### 4️⃣ .claude/settings.json (⚠️ Convenção - Não Nativo)

**Arquivo:** [.claude/settings.json](../.claude/settings.json)

**Como funciona:**

- **Convenção** que você pode usar para documentar regras em formato JSON
- Não é lido **automaticamente** pelo Claude Code (ainda)
- Serve como **documentação estruturada** das regras

**Quando é útil:**

- Para ferramentas que você criar que processem JSON
- Como referência rápida estruturada
- Para futuras integrações

**Garantia:** ⭐⭐ (Baixa - é documentação, não é executado)

---

### 5️⃣ .clauderc (⚠️ Convenção - Não Nativo)

**Arquivo:** [.clauderc](../.clauderc)

**Como funciona:**

- **NÃO é lido automaticamente** pelo Claude Code nativamente
- É uma **convenção/prática recomendada** similar a `.editorconfig`
- Você precisa **instruir manualmente** o agente para lê-lo

**Limitações:**

- Claude Code não tem (ainda) suporte nativo para `.clauderc`
- Funciona apenas se você explicitamente pedir: "Leia o arquivo .clauderc"

**Garantia:** ⭐ (Muito baixa - requer ação manual)

**Por que criar então?**

- Pode ser útil no futuro se Claude adicionar suporte
- Serve como documentação consolidada
- Você pode instruir agentes: "Sempre leia .clauderc antes de commitar"

---

### 6️⃣ docs/AI_AGENT_GUIDE.md (✅ Funciona - Manual)

**Arquivo:** [docs/AI_AGENT_GUIDE.md](AI_AGENT_GUIDE.md)

**Como funciona:**

- Guia **completo e detalhado** para agentes de IA
- Referenciado pelo CONTRIBUTING.md e README.md
- Contém workflows passo-a-passo, exemplos, checklists

**Quando é lido:**

- Quando o agente segue links do CONTRIBUTING.md
- Quando você explicitamente pede: "Leia docs/AI_AGENT_GUIDE.md"

**Garantia:** ⭐⭐⭐⭐ (Alta - se referenciado)

---

### 7️⃣ Git Hooks (.husky/pre-commit) (✅ Funciona - Validação Automática)

**Arquivo:** [.husky/pre-commit](../.husky/pre-commit)

**Como funciona:**

- Hook do Git que **executa automaticamente** antes de cada commit
- **Bloqueia** commits que violam regras (ex: tentar commitar `.env`)
- Funciona para **humanos e IAs** que usam `git commit`

**Quando é executado:**

- **Automaticamente** antes de CADA `git commit`
- Valida segurança (sem .env, sem credenciais)

**Garantia:** ⭐⭐⭐⭐⭐ (Altíssima - é automático e bloqueia)

**Como ativar:**

```bash
npm install --save-dev husky
npx husky install
chmod +x .husky/pre-commit
```

---

### 8️⃣ GitHub Actions Workflows (✅ Funciona - Validação em PRs)

**Arquivos:**

- [.github/workflows/semantic-pr.yml](../.github/workflows/semantic-pr.yml)
- [.github/workflows/labeler.yml](../.github/workflows/labeler.yml)

**Como funciona:**

- Executam **automaticamente** quando uma PR é aberta
- **Validam:**
  - Título da PR segue Conventional Commits
  - Aplicam labels automaticamente
- **Bloqueiam merge** se validação falhar

**Quando executam:**

- Ao abrir PR
- Ao atualizar título da PR
- Ao fazer push na branch da PR

**Garantia:** ⭐⭐⭐⭐⭐ (Altíssima - valida e bloqueia)

---

## 📊 Resumo: O que Funciona Automaticamente?

| Método | Automático? | Bloqueia? | Garantia | Melhor Para |
|--------|-------------|-----------|----------|-------------|
| **CONTRIBUTING.md** | ✅ Sim | ❌ Não | ⭐⭐⭐⭐⭐ | Todos os agentes |
| **README.md** | ✅ Sim | ❌ Não | ⭐⭐⭐⭐⭐ | Primeira impressão |
| **.claude/commands/** | ⚠️ Manual | ❌ Não | ⭐⭐⭐⭐ | Claude Code |
| **.claude/settings.json** | ❌ Não | ❌ Não | ⭐⭐ | Documentação |
| **.clauderc** | ❌ Não | ❌ Não | ⭐ | Convenção |
| **docs/AI_AGENT_GUIDE.md** | ⚠️ Via link | ❌ Não | ⭐⭐⭐⭐ | Guia detalhado |
| **.husky/pre-commit** | ✅ Sim | ✅ Sim | ⭐⭐⭐⭐⭐ | Segurança |
| **GitHub Actions** | ✅ Sim | ✅ Sim | ⭐⭐⭐⭐⭐ | Validação de PR |

---

## 🎯 Estratégia Recomendada

### Para Garantir Máxima Conformidade

#### **Camada 1: Educação (Leitura)**

1. ✅ **CONTRIBUTING.md** - Agente lê automaticamente
2. ✅ **README.md** - Destaque visual para IAs
3. ✅ **docs/AI_AGENT_GUIDE.md** - Guia detalhado

#### **Camada 2: Ferramentas (Comandos)**

1. ✅ **.claude/commands/** - Slash commands para revisar regras
   - `/rules` - Ver regras
   - `/pre-commit-check` - Antes de commitar
   - `/pre-pr-check` - Antes de abrir PR

#### **Camada 3: Validação (Bloqueio)**

1. ✅ **.husky/pre-commit** - Bloqueia commits ruins
2. ✅ **GitHub Actions** - Valida PRs

---

## 🚀 Como Usar Este Sistema

### Para Agentes de IA (como Claude Code)

**Antes de QUALQUER ação de commit/PR:**

1. **Leia automaticamente:**
   - CONTRIBUTING.md (você provavelmente já leu)
   - README.md (primeira coisa que viu)

2. **Execute comandos:**

   ```
   /pre-commit-check    # Antes de commitar
   /pre-pr-check        # Antes de abrir PR
   ```

3. **Confie nos bloqueios:**
   - Git hook vai impedir commits ruins
   - GitHub Actions vai validar PR

### Para Desenvolvedores Humanos

**Instruindo um agente de IA:**

```
Antes de fazer qualquer commit ou PR, execute:
1. /rules (para revisar regras)
2. /pre-commit-check (antes de commitar)
3. /pre-pr-check (antes de abrir PR)
```

**Ou simplesmente:**

```
Leia CONTRIBUTING.md e siga todas as regras antes de commitar.
```

---

## 🔧 Como Ativar os Git Hooks

Para ativar a validação automática com Husky:

```bash
# 1. Instalar Husky
npm install --save-dev husky

# 2. Inicializar Husky
npx husky install

# 3. Dar permissão de execução (Linux/Mac)
chmod +x .husky/pre-commit

# 4. Windows - funciona automaticamente
```

Agora, **toda vez** que você ou um agente tentar commitar, o hook vai validar:

- ❌ Bloqueia se tentar commitar `.env`
- ❌ Avisa se encontrar arquivos suspeitos de credenciais

---

## 🧪 Testando o Sistema

### Teste 1: Tentar commitar .env (deve falhar)

```bash
# Criar arquivo .env
echo "SECRET=123" > .env

# Tentar commitar (deve ser BLOQUEADO)
git add .env
git commit -m "test"

# Resultado esperado:
# ❌ ERRO: Tentativa de commitar arquivo .env
```

### Teste 2: Comando /rules no Claude Code

```
/rules
```

Deve mostrar todas as regras do projeto.

### Teste 3: Abrir PR com título errado (deve falhar)

```bash
# Criar PR com título não convencional
gh pr create --title "mudanca qualquer"

# GitHub Action vai FALHAR
# Você precisa mudar para: "feat: mudança qualquer"
```

---

## 📝 FAQ

### P: O .clauderc funciona automaticamente?

**R:** Não. É uma convenção que você precisa instruir o agente a ler.

### P: Qual arquivo é mais importante?

**R:** CONTRIBUTING.md - é o padrão universal reconhecido por todos os agentes.

### P: Como garantir que o agente sempre siga as regras?

**R:** Use as 3 camadas:

1. CONTRIBUTING.md (educação)
2. Slash commands (ferramentas)
3. Git hooks + GitHub Actions (bloqueio)

### P: E se o agente não ler CONTRIBUTING.md?

**R:** Os git hooks e GitHub Actions vão bloquear commits/PRs ruins mesmo assim.

### P: Preciso instalar Husky?

**R:** Não é obrigatório, mas **altamente recomendado** para máxima segurança.

---

## ✅ Checklist de Implementação

- [x] CONTRIBUTING.md criado
- [x] README.md com destaque para IAs
- [x] docs/AI_AGENT_GUIDE.md criado
- [x] .claude/commands/rules.md criado
- [x] .claude/commands/pre-commit-check.md criado
- [x] .claude/commands/pre-pr-check.md criado
- [x] .husky/pre-commit criado
- [x] .env.example criado
- [x] Husky instalado e configurado ✅
- [x] GitHub Actions configurados (semantic-pr.yml, labeler.yml)

---

**Status:** ✅ **Sistema completamente implementado e testado!**

### Testes Realizados

- ✅ Hook bloqueia commits de `.env`
- ✅ Hook bloqueia commits de `node_modules/`
- ✅ Hook bloqueia commits de `dist/`
- ✅ Husky v9 instalado e funcionando
