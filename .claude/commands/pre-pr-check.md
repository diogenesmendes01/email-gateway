# Pre-PR Check

Execute esta checklist ANTES de abrir uma Pull Request:

## 1. Validações Básicas

```bash
# Ver commits que serão incluídos
git log origin/main..HEAD --oneline

# Ver diff completo
git diff origin/main...HEAD

# Status atual
git status
```

**Checklist:**
- [ ] Todos os commits seguem Conventional Commits
- [ ] Nenhum commit contém .env ou credenciais
- [ ] Branch usa nomenclatura correta (feature/*, fix/*, etc)

## 2. Template de PR - OBRIGATÓRIO

Você DEVE preencher **TODO** o template em `.github/pull_request_template.md`:

### Seções Obrigatórias:

#### ✅ Resumo do que foi pedido (escopo)
- Cole em 3-5 linhas o que a tarefa solicitou

#### ✅ O que foi feito
- [ ] Item 1
- [ ] Item 2
- [ ] Item 3

#### ✅ Critérios de aceite
- [ ] Critério 1
- [ ] Critério 2

#### ✅ Impacto técnico (CRÍTICO)
- **Migrations:** (sim/não; quais)
- **Env vars:** (sim/não; quais)
- **Breaking changes:** (sim/não; explique)
- **Observabilidade:** (logs/métricas adicionadas)
- **Documentação de arquitetura:** (link para doc relacionado)

#### ✅ Testes & validações
- **Como validar manualmente:** passos claros
- **Evidências:** prints, logs, curl (se aplicável)

#### ✅ Riscos / rollback
- **Riscos:** lista de riscos conhecidos
- **Rollback:** como desfazer de forma segura
- **Feature flag:** (se houver)

#### ✅ Escopo x Fora de escopo
- **Escopo atendido:** o que entrou
- **Fora de escopo:** se houver, arquivo criado em `/task/PR<numero>-TASK<id>.md`

#### ✅ Labels sugeridas
- Tipo: `tipo:feature` | `tipo:bug` | `tipo:refactor`
- Prioridade: `prioridade:1-urgente` ... `prioridade:5-baixa`
- Escopo: `escopo:aderente` | `escopo:fora`

## 3. Validação Manual

- [ ] Testei TODAS as mudanças manualmente
- [ ] Validei os critérios de aceite
- [ ] Não quebrei funcionalidades existentes
- [ ] Código está funcionando em ambiente local

## 4. Documentação

- [ ] Se mudei APIs, atualizei documentação
- [ ] Se adicionei env vars, atualizei `.env.example`
- [ ] Se mudei arquitetura, atualizei docs de arquitetura

## 5. Segurança

- [ ] Nenhum secret/credential exposto
- [ ] Validações de entrada implementadas
- [ ] Logs não vazam dados sensíveis (PII, tokens, senhas)

## 6. Itens Fora de Escopo

Se identificou algo importante fora do escopo atual:

1. **Criar arquivo:** `/task/PR<numero>-TASK<id>.md`
2. **Usar template:** `task/TEMPLATE-PR-TASK.md`
3. **Mencionar na PR:** seção "Escopo x Fora de escopo"

## 7. Título da PR

Deve seguir Conventional Commits:

```
feat: adiciona validação de email
fix: corrige retry infinito na fila
chore: atualiza dependências
```

O workflow `semantic-pr.yml` vai validar automaticamente.

## 8. Push e Criar PR

```bash
# Push da branch
git push -u origin <nome-da-branch>

# Criar PR via GitHub CLI (recomendado)
gh pr create --title "feat: título aqui" --body "$(cat <<'EOF'
# Cole aqui o template preenchido
EOF
)"
```

## 9. Após Criar a PR

- [ ] Verificar se labels foram aplicadas automaticamente
- [ ] Verificar se semantic-pr passou
- [ ] Adicionar reviewers se necessário

## ⚠️ Hotfix

Se for `hotfix/*`, pode simplificar algumas seções, **MAS**:
- Segurança continua obrigatória
- Riscos devem estar explícitos
- Rollback é obrigatório
