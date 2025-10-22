# Regras do Projeto - LEIA ANTES DE AGIR

## 🚨 INSTRUÇÕES OBRIGATÓRIAS

Antes de criar **qualquer** commit, branch ou PR, você DEVE ler:

1. **[CONTRIBUTING.md](../../CONTRIBUTING.md)** - Guia completo
2. **[docs/AI_AGENT_GUIDE.md](../../docs/AI_AGENT_GUIDE.md)** - Guia detalhado para IAs
3. **[.github/pull_request_template.md](../../.github/pull_request_template.md)** - Template de PR
4. **[docs/PR_REVIEW_RULES.md](../../docs/PR_REVIEW_RULES.md)** - Regras de review
5. **[docs/PR_ADJUSTMENTS.md](../../docs/PR_ADJUSTMENTS.md)** - Como ajustar PRs

## 🔒 Segurança - NUNCA

- ❌ Commitar `.env` ou arquivos com credenciais
- ❌ Expor API keys, secrets, tokens
- ❌ Commitar `node_modules/`, `dist/`, `*.log`

## 🌿 Branches (OBRIGATÓRIO)

Use APENAS: `feature/*`, `fix/*`, `hotfix/*`, `refactor/*`, `chore/*`, `docs/*`

Exemplo: `feature/add-email-validation`

## 📝 Commits (OBRIGATÓRIO)

Conventional Commits:
```
<tipo>: <descrição>

```

Tipos: `feat`, `fix`, `chore`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`

## 📋 Pull Request (OBRIGATÓRIO)

- Preencher **TODO** o template em `.github/pull_request_template.md`
- Documentar impacto técnico (migrations, env vars, breaking changes)
- Validar manualmente antes de abrir
- Registrar itens fora de escopo em `/task/PR<numero>-TASK<id>.md`

## ✅ Checklist Antes de Commitar

- [ ] Li CONTRIBUTING.md e docs/AI_AGENT_GUIDE.md
- [ ] Branch usa nomenclatura correta
- [ ] Commits seguem Conventional Commits
- [ ] Verifiquei `git status` (sem .env ou credenciais)
- [ ] Validei manualmente as mudanças
- [ ] Não há scope creep

## ✅ Checklist Antes de Abrir PR

- [ ] Template de PR preenchido completamente
- [ ] Documentei impacto técnico
- [ ] Documentei riscos e rollback
- [ ] Registrei itens fora de escopo em /task
- [ ] Título segue Conventional Commits

Execute `/rules` sempre que precisar revisar essas regras.
