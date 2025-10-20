# Regras para Revisar uma PR

## Objetivo

Padronizar revisões para garantir qualidade, segurança e aderência ao escopo.

## Severidades (em inglês)

- **Critical**: quebra funcional, segurança, compliance ou performance grave. **Bloqueia merge**.  
- **Moderate**: precisa ser ajustado para manter qualidade/manutenibilidade/testabilidade antes do merge.  
- **Suggestion**: melhoria opcional (estilo, micro refactor, docs); **não bloqueia**.

> Observação de segurança (#11): exposição de segredos/credenciais em código é sempre **Critical**.

## Eixos mínimos de revisão

### 1. **Escopo**
Faz exatamente o que foi pedido no "Resumo do que foi pedido". Sem scope creep.

**Verificar:**
- [ ] Implementa apenas o que foi solicitado
- [ ] Itens fora de escopo registrados em `/task`

---

### 2. **Qualidade & Padrões** ⚠️ CRÍTICO
Estrutura, legibilidade, coesão, acoplamento, padrões do projeto.

**Documentos de Referência:**
- [CODE-QUALITY-STANDARDS.md](./CODE-QUALITY-STANDARDS.md) - **OBRIGATÓRIO**

**Verificar:**
- [ ] **Exception Handling:**
  - [ ] Usa global exception filter (`AllExceptionsFilter`)
  - [ ] Exceções customizadas para erros de negócio
  - [ ] Worker classifica erros permanentes vs transientes
- [ ] **Logging Estruturado:**
  - [ ] Logs em formato JSON
  - [ ] Campos obrigatórios: `message`, `requestId`, `timestamp`
  - [ ] NUNCA loga PII sem mascaramento
  - [ ] Níveis de log corretos (error/warn/log/debug)
- [ ] **Request Tracking:**
  - [ ] Request ID propagado (API → Queue → Worker)
  - [ ] Correlation IDs consistentes em logs
- [ ] **Configuration:**
  - [ ] Environment variables validadas (class-validator)
  - [ ] Configuration service pattern usado
- [ ] **TypeScript:**
  - [ ] Strict mode habilitado
  - [ ] Sem uso de `any`
  - [ ] Type guards para valores desconhecidos
- [ ] **Code Organization:**
  - [ ] Single Responsibility Principle
  - [ ] Dependency Injection correta
  - [ ] Estrutura de módulos NestJS adequada

---

### 3. **Testabilidade** ⚠️ OBRIGATÓRIO
Há testes automatizados e instruções para validar manualmente.

**Documentos de Referência:**
- [TESTING-STANDARDS.md](./testing/TESTING-STANDARDS.md) - **OBRIGATÓRIO**

**Verificar:**
- [ ] **Cobertura de Testes:**
  - [ ] Testes unitários para serviços/utilitários (>= 80%)
  - [ ] Testes de integração para APIs/workers (>= 70%)
  - [ ] Cobertura geral >= 70% (`npm run test:cov`)
- [ ] **Qualidade dos Testes:**
  - [ ] Padrão AAA (Arrange, Act, Assert)
  - [ ] Mocks corretos de dependências externas
  - [ ] Edge cases cobertos (validações, erros)
  - [ ] Testes passando no CI
- [ ] **Validação Manual:**
  - [ ] Instruções claras de como validar
  - [ ] Passos de teste documentados na PR

---

### 4. **Segurança & Dados**
Segredos não expostos; validações de entrada; PII/credenciais; uso adequado de permissões.

**Verificar:**
- [ ] **Encryption:**
  - [ ] Usa funções corretas de `@email-gateway/shared`
  - [ ] NUNCA usa `crypto.createCipher()` (deprecated)
  - [ ] AES-256-CBC com PBKDF2
- [ ] **Input Validation:**
  - [ ] DTOs com class-validator
  - [ ] Validação de tipos, tamanhos, formatos
- [ ] **PII Protection:**
  - [ ] PII mascarado em logs (maskEmail, maskCpfCnpj)
  - [ ] Criptografia para dados sensíveis em repouso
  - [ ] Hash HMAC-SHA256 para chaves de busca
- [ ] **Secrets:**
  - [ ] Nenhum secret commitado (.env, keys, tokens)
  - [ ] API keys com hash bcrypt
- [ ] **Rate Limiting:**
  - [ ] Rotas sensíveis protegidas com throttling

---

### 5. **Performance**
Evitar N+1, loops desnecessários, alocações pesadas em caminhos críticos.

**Verificar:**
- [ ] **Database Queries:**
  - [ ] Queries otimizadas com índices
  - [ ] Sem N+1 queries (usar `include` do Prisma)
  - [ ] Paginação implementada (cursor-based)
- [ ] **Caching:**
  - [ ] Cache usado onde apropriado (Redis)
- [ ] **Async/Await:**
  - [ ] Operações assíncronas tratadas corretamente
  - [ ] Sem blocking operations

---

### 6. **Observabilidade**
Logs úteis (sem vazar dados sensíveis), métricas se fizer sentido.

**Verificar:**
- [ ] **Structured Logging:**
  - [ ] Formato JSON consistente
  - [ ] Request/Job IDs em todos os logs
  - [ ] Eventos importantes logados (email sent, job processed)
- [ ] **Metrics:**
  - [ ] Métricas relevantes instrumentadas (se aplicável)
  - [ ] Prometheus format (se aplicável)
- [ ] **Tracing:**
  - [ ] Distributed tracing context propagado

---

### 7. **Documentação**
Link e referência à seção de arquitetura pertinente (quando aplicável).

**Verificar:**
- [ ] **PR Description:**
  - [ ] Link para documentação de arquitetura
  - [ ] Impacto técnico documentado
- [ ] **Code Comments:**
  - [ ] Trechos complexos comentados
  - [ ] Public APIs documentadas
- [ ] **README/Docs:**
  - [ ] Docs atualizadas se necessário

## Sem SLA

Não há SLA obrigatório para tratamento de comentários (conforme alinhado). Use bom senso e priorização do time.

## Bloqueio de merge

- **Não pode** haver itens **Critical** abertos.
- Itens marcados como **Deve ser feito** (sejam Critical ou Moderate) devem estar resolvidos antes do merge.

## Hotfix

- `hotfix/*` pode reduzir exigências não críticas **sem** comprometer segurança.
- Qualquer risco deve estar explícito em **Riscos / rollback** da PR.

## Checklist de Bloqueio Automático (CI/CD)

**OBRIGATÓRIO:** Estes itens são verificados automaticamente pelo CI e **bloqueiam merge** se falharem:

- [ ] **Testes passando** (`npm run test`)
- [ ] **Cobertura >= 70%** (`npm run test:cov`)
- [ ] **Linting sem erros** (`npm run lint`)
- [ ] **TypeScript compilation** (`npm run build`)
- [ ] **Conventional Commits** (validação de título de PR)

---

## Template de comentário (copiar/colar)
>
> Use este bloco no primeiro comentário da revisão para padronizar o feedback.

```text
[REVIEW SUMMARY]

## ✅ Checklist de Padrões

### Qualidade & Padrões (CODE-QUALITY-STANDARDS.md)
- [ ] Exception handling (global filter + custom exceptions)
- [ ] Logging estruturado (JSON, request IDs, sem PII)
- [ ] Request tracking (correlation IDs)
- [ ] Environment variables validadas
- [ ] TypeScript strict (sem `any`)

### Testes (TESTING-STANDARDS.md)
- [ ] Testes unitários (>= 80% para services)
- [ ] Testes de integração (>= 70% para APIs/workers)
- [ ] Cobertura geral >= 70%
- [ ] Testes passando no CI

### Segurança
- [ ] Encryption correto (AES-256-CBC, não usa createCipher)
- [ ] Input validation (class-validator)
- [ ] PII mascarado em logs
- [ ] Sem secrets commitados

---

## 🔴 CRITICAL
- [ ] (descrever claramente o problema e por que é Critical)

## 🟡 MODERATE
- [ ] (descrever o ajuste necessário e por que deve ser feito)

## 🟢 SUGGESTION
- [ ] (descrever sugestão e o benefício)

---

## 📊 Métricas de Cobertura
- **Cobertura atual:** X%
- **Linhas cobertas:** X/Y
- **Branches cobertos:** X/Y

## 🎯 Veredito
- [ ] **APPROVED** - Pode mergear após resolver Critical/Moderate
- [ ] **REQUEST CHANGES** - Necessita correções
- [ ] **COMMENT** - Feedback sem bloquear
```

## 📝 Registrando Itens Fora de Escopo

Quando identificar melhorias/refatorações que estão **fora do escopo** da PR atual:

### ❌ NÃO FAÇA ISSO:
- ~~Criar arquivo separado `task/PR<numero>-TASK-<id>.md`~~
- ~~Deixar no comentário sem registro~~

### ✅ FAÇA ISSO:

1. **Registre no PR-BACKLOG.md centralizado:**

```markdown
## [PRXX-SHORT-TITLE] Título Descritivo

**Origem:** PR #XX
**Severidade:** CRITICAL | MODERATE | SUGGESTION
**Urgência:** 1-5
**Status:** 🔴 Pendente
**Responsável:** [Time]

### Contexto
[Por que ficou fora de escopo]

### O que precisa ser feito
- [ ] Item 1
- [ ] Item 2

### Detalhes Técnicos
[Código, arquivos, exemplos]

### Dependências / Riscos
- Dependências: [listar]
- Riscos: [listar]
```

2. **Comente na PR:**
```markdown
✅ Registrado em task/PR-BACKLOG.md como [PRXX-SHORT-TITLE]
Link: https://github.com/.../PR-BACKLOG.md#prxx-short-title
```

3. **Classifique corretamente:**
- **CRITICAL** = Segurança, quebra funcional, compliance
- **MODERATE** = Qualidade, manutenibilidade, testabilidade
- **SUGGESTION** = Melhorias opcionais, refatorações, docs

---

## Comentário geral obrigatório

Além dos comentários inline, publique **um comentário geral** consolidando:

- Referências a **todos** os pontos levantados (arquivo:linha) com severidade (Critical/Moderate/Suggestion);
- **MUST-FIX checklist** (Critical + Moderate que bloqueiam);
- Sugestões agregadas;
- **Itens registrados em PR-BACKLOG.md** (com links);
- Plano de ação por papel (Autor/Reviewer/Maintainer) e **veredito**.
O comentário geral é a **fonte de verdade** para execução.
