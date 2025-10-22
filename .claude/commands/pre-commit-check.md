# Pre-Commit Check

Execute esta checklist ANTES de criar qualquer commit:

## 1. Leia a Documentação (se ainda não leu)

Use os comandos:
- `cat CONTRIBUTING.md` - Guia de contribuição
- `cat docs/AI_AGENT_GUIDE.md` - Guia completo para IAs
- `cat docs/PR_REVIEW_RULES.md` - Regras de review

## 2. Verifique o que será commitado

```bash
git status
git diff --cached
```

**Checklist:**
- [ ] Não há arquivos `.env`
- [ ] Não há credenciais/secrets
- [ ] Não há `node_modules/` ou `dist/`
- [ ] Apenas arquivos relevantes ao escopo

## 3. Valide o nome da branch

Branch atual deve usar um desses prefixos:
- `feature/*` - Nova funcionalidade
- `fix/*` - Correção de bug
- `hotfix/*` - Correção urgente
- `refactor/*` - Refatoração
- `chore/*` - Manutenção
- `docs/*` - Documentação

Verificar com: `git branch --show-current`

## 4. Valide a mensagem de commit

Deve seguir Conventional Commits:

```
<tipo>(<escopo-opcional>): <descrição>

<corpo opcional>

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>
```

**Tipos válidos:** `feat`, `fix`, `chore`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`

## 5. Validação Manual

- [ ] Testei as mudanças manualmente
- [ ] Código está funcionando
- [ ] Não quebrei nada existente
- [ ] Estou fazendo APENAS o que foi pedido (sem scope creep)

## 6. Se tudo estiver OK

Pode commitar com:
```bash
git commit -m "tipo: descrição"
```

## 7. Itens Fora de Escopo?

Se você identificou algo importante mas fora do escopo:
- **NÃO** implemente agora
- Registre em `/task/PR<numero>-TASK<id>.md`
- Use o template: `task/TEMPLATE-PR-TASK.md`
