# Guia de Contribuição

## 🤖 Para Agentes de IA e Desenvolvedores

Antes de criar commits, branches ou Pull Requests, você **DEVE** seguir as regras e templates documentados neste projeto.

### 📚 Documentação Obrigatória

Leia e siga **TODOS** esses documentos antes de qualquer ação:

1. **[.github/pull_request_template.md](.github/pull_request_template.md)**
   - Template obrigatório para todas as PRs
   - Define estrutura, critérios de aceite, impacto técnico

2. **[docs/PR_REVIEW_RULES.md](docs/PR_REVIEW_RULES.md)**
   - Regras de revisão (Critical, Moderate, Suggestion)
   - Eixos de avaliação: escopo, qualidade, segurança, performance

3. **[docs/PR_ADJUSTMENTS.md](docs/PR_ADJUSTMENTS.md)**
   - Como tratar comentários de revisão
   - Registrar itens fora de escopo em `/task`

4. **[task/TEMPLATE-PR-TASK.md](task/TEMPLATE-PR-TASK.md)**
   - Template para registrar tarefas fora do escopo da PR

### 🔒 Regras de Segurança Críticas

- ❌ **NUNCA** commitar arquivos `.env` ou credenciais
- ❌ **NUNCA** expor secrets, API keys ou tokens no código
- ✅ **SEMPRE** validar que `.gitignore` está configurado corretamente
- ✅ **SEMPRE** verificar `git status` antes de commitar

### 🌿 Convenções de Branch

Use **obrigatoriamente** um dos seguintes prefixos:

- `feature/*` - Nova funcionalidade
- `fix/*` - Correção de bug
- `hotfix/*` - Correção urgente em produção
- `refactor/*` - Refatoração de código
- `chore/*` - Tarefas de manutenção
- `docs/*` - Documentação
- `release/*` - Releases

**Exemplo:** `feature/add-rate-limiting`

### 📝 Conventional Commits

Todos os commits **DEVEM** seguir o padrão [Conventional Commits](https://www.conventionalcommits.org/):

```
<tipo>(<escopo-opcional>): <descrição curta>

<corpo opcional>

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>
```

**Tipos permitidos:**
- `feat` - Nova funcionalidade
- `fix` - Correção de bug
- `chore` - Tarefas de manutenção
- `docs` - Documentação
- `style` - Formatação de código
- `refactor` - Refatoração
- `perf` - Melhorias de performance
- `test` - Testes
- `build` - Build system
- `ci` - CI/CD

### 🔄 Workflow para Criar uma PR

1. **Antes de começar:**
   - Ler o escopo da tarefa
   - Verificar documentação de arquitetura relacionada

2. **Durante o desenvolvimento:**
   - Criar branch com nomenclatura correta
   - Fazer commits seguindo Conventional Commits
   - Manter escopo aderente ao solicitado

3. **Antes de abrir a PR:**
   - Preencher **TODO** o template de PR
   - Validar manualmente as mudanças
   - Verificar impacto técnico (migrations, env vars, breaking changes)
   - Documentar riscos e plano de rollback

4. **Itens fora de escopo:**
   - Registrar em `/task/PR<numero>-TASK<id>.md`
   - Usar template [task/TEMPLATE-PR-TASK.md](task/TEMPLATE-PR-TASK.md)

### 🏷️ Labels

As labels são aplicadas automaticamente via [.github/labeler.yml](.github/labeler.yml), mas você pode sugerir:

- **Tipo:** `tipo:feature`, `tipo:bug`, `tipo:refactor`
- **Prioridade:** `prioridade:1-urgente` até `prioridade:5-baixa`
- **Escopo:** `escopo:aderente`, `escopo:fora`

### ⚠️ Hotfix

PRs `hotfix/*` podem ter requisitos reduzidos, **MAS**:
- Segurança continua **obrigatória**
- Riscos devem estar **explícitos**
- Plano de rollback **obrigatório**

### 🚫 Bloqueios de Merge

Não pode haver merge com:
- ❌ Itens **Critical** abertos
- ❌ Itens **Moderate** marcados como "Deve ser feito" não resolvidos
- ❌ Validação de Conventional Commits falhando
- ❌ Segurança comprometida

### 📖 Referências

- [Conventional Commits](https://www.conventionalcommits.org/)
- [Semantic Versioning](https://semver.org/)
- [GitHub Actions Workflows](.github/workflows/)

---

**Importante para IAs:** Este arquivo é a **fonte de verdade** para contribuições. Leia todos os documentos referenciados antes de qualquer ação.
