# Título da PR
<!-- Use um título claro. Sugestão: Conventional Commits, ex.: feat: implementa X no módulo Y -->

## 📋 Resumo do que foi pedido (escopo)
<!-- Cole aqui, em 3–5 linhas, o que a tarefa/issue solicitou (o "pedido do escopo"). -->

## ✅ O que foi feito
- [ ] Item 1
- [ ] Item 2
- [ ] Item 3

## 🎯 Critérios de aceite (marque o que foi cumprido)
- [ ] Critério 1
- [ ] Critério 2
- [ ] Critério 3

---

## 🔍 Review Areas (para agentes especializados)

### 🔒 Security (@pr-security-reviewer)

**Mudanças de Segurança:**
<!-- Liste mudanças relacionadas a segurança ou escreva "N/A" -->
-

**Checklist:**
- [ ] Sem secrets hardcoded
- [ ] PII criptografado adequadamente
- [ ] Validação de input implementada
- [ ] Rate limiting configurado (se aplicável)

---

### 🧪 Testing (@pr-test-reviewer)

**Cobertura de Testes:**
- Overall: __% (mínimo 70%)
- Código Novo/Alterado: __%

**Testes Adicionados:**
<!-- Liste os testes adicionados -->
-

**Checklist:**
- [ ] Testes unitários adicionados/atualizados
- [ ] Testes de integração (se aplicável)
- [ ] Cobertura >= 70%
- [ ] Todos os testes passando localmente

---

### 🗄️ Database (@pr-database-reviewer)

**Mudanças no Schema:**
<!-- Liste mudanças no schema ou escreva "N/A" -->
-

**Migrations:**
<!-- Liste migrations criadas ou escreva "N/A" -->
-

**Checklist:**
- [ ] Migration é reversível
- [ ] Índices adicionados para novas queries
- [ ] Sem breaking changes (ou documentado)
- [ ] Testado em ambiente de dev

---

### 📝 Code Quality (@pr-code-quality-reviewer)

**Melhorias de Qualidade:**
<!-- Liste melhorias ou escreva "N/A" -->
-

**Checklist:**
- [ ] Sem tipos `any` (ou exceções documentadas)
- [ ] Logging estruturado (formato JSON)
- [ ] Error handling com exceções customizadas
- [ ] Dependency injection usado corretamente

---

### ⚡ Performance (@pr-performance-reviewer)

**Impacto de Performance:**
<!-- Descreva impacto ou escreva "N/A" -->
-

**Otimizações:**
<!-- Liste otimizações implementadas -->
-

**Checklist:**
- [ ] Queries de banco otimizadas
- [ ] Paginação implementada (se necessário)
- [ ] Sem queries N+1
- [ ] Async/await usado corretamente

---

### 📚 Documentation (@pr-docs-reviewer)

**Documentação Atualizada:**
<!-- Liste docs atualizados ou escreva "N/A" -->
-

**Checklist:**
- [ ] README atualizado (se API pública mudou)
- [ ] Docs de API atualizados (se endpoints mudaram)
- [ ] Comentários inline para lógica complexa
- [ ] .env.example atualizado (se novas env vars)

---

## Impacto técnico
- **Migrations:** (sim/não; quais)
- **Env vars:** (sim/não; quais)
- **Breaking changes:** (sim/não; explique brevemente)
- **Observabilidade (logs/métricas):** (lista curta, se relevante)
- **Documentação de arquitetura relacionada:** (link para seção do doc) <!-- (Req. #17) -->

## Testes & validações (mínimo necessário)
- **Como validar manualmente:** passos curtos
- **Evidências:** prints, logs, curl etc. (se aplicável)

## Riscos / rollback
- **Riscos:** lista curta
- **Rollback:** como desfazer de forma segura
- **Feature flag:** (se existir)

## Escopo x Fora de escopo
- **Escopo atendido:** bullets do que entrou
- **Fora de escopo (registrado em /task):** se houve, informe o arquivo criado em `/task/PR<numero>-TASK<id>.md`

## Labels sugeridas
- `tipo:feature` | `tipo:bug` | `tipo:refactor`
- `prioridade:1-urgente` … `prioridade:5-baixa`
- `escopo:aderente` | `escopo:fora`

## Branch & commits
- **Branch:** `feature/*`, `fix/*`, `hotfix/*`, `release/*`
- **Commits:** Conventional Commits (ex.: `feat: ...`, `fix: ...`)

## Hotfix (quando aplicável)
- PRs `hotfix/*` podem pular itens não críticos, **mas segurança continua obrigatória**.
