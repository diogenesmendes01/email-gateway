# Regras para Ajustes da PR

## 📚 Documentos de Referência

Antes de fazer ajustes, **SEMPRE** consultar:

- [CODE-QUALITY-STANDARDS.md](./CODE-QUALITY-STANDARDS.md) - Padrões de qualidade obrigatórios
- [TESTING-STANDARDS.md](./testing/TESTING-STANDARDS.md) - Padrões de testes obrigatórios
- [PR_REVIEW_RULES.md](./PR_REVIEW_RULES.md) - Critérios de revisão

---

## Ordem de tratamento

### 1. **Critical** → Corrigir IMEDIATAMENTE (bloqueia merge)

**Exemplos de Critical:**
- 🔴 Quebra funcional (sistema não funciona)
- 🔴 Vulnerabilidade de segurança (secrets expostos, encryption errado)
- 🔴 Compliance (LGPD, PII exposta)
- 🔴 Performance grave (N+1 queries, memory leaks)
- 🔴 Ausência de testes (cobertura < 70%)
- 🔴 Exception handling ausente ou incorreto

**Como corrigir:**
1. Ler documentação relevante (CODE-QUALITY-STANDARDS.md ou TESTING-STANDARDS.md)
2. Implementar correção seguindo os padrões
3. Adicionar testes se aplicável
4. Validar cobertura (`npm run test:cov`)
5. Push e comentar na PR

---

### 2. **Moderate** → Corrigir antes do merge (Deve ser feito)

**Exemplos de Moderate:**
- 🟡 Qualidade de código (falta logging estruturado, request IDs)
- 🟡 Manutenibilidade (código complexo sem comentários)
- 🟡 Testabilidade (faltam testes de edge cases)
- 🟡 Code smell (acoplamento alto, responsabilidades misturadas)
- 🟡 Environment variables sem validação

**Como corrigir:**
1. Consultar CODE-QUALITY-STANDARDS.md para padrão correto
2. Implementar ajuste
3. Adicionar testes para mudança
4. Push e comentar na PR

---

### 3. **Suggestion** → Avaliar

Se **importante** e **aderente ao escopo**, implementar.
Se **fora do escopo** ou **pouco relevante agora**, registrar em `/task`.

**Exemplos de Suggestion:**
- 🟢 Refatoração de estilo
- 🟢 Micro-otimização
- 🟢 Documentação adicional
- 🟢 Feature extra (fora do escopo)

## Itens “Deve ser feito”

- Tudo classificado como **Critical** e os **Moderate** indicados como “Deve ser feito” pelo reviewer são obrigatórios antes do merge.

---

## 🔧 Exemplos Práticos de Correções

### Problema: Falta Exception Handling

**❌ Código com problema:**
```typescript
async sendEmail(dto: SendEmailDto) {
  const email = await this.prisma.emailOutbox.create({ data: dto });
  return email;
}
```

**✅ Correção (seguindo CODE-QUALITY-STANDARDS.md):**
```typescript
async sendEmail(dto: SendEmailDto) {
  try {
    const email = await this.prisma.emailOutbox.create({ data: dto });

    this.logger.log({
      message: 'Email created successfully',
      emailId: email.id,
      requestId: dto.requestId,
    });

    return email;
  } catch (error) {
    this.logger.error({
      message: 'Failed to create email',
      error: error.message,
      requestId: dto.requestId,
    });

    throw new BusinessException('EMAIL_CREATION_FAILED', 'Failed to create email');
  }
}
```

---

### Problema: Logging sem Request ID

**❌ Código com problema:**
```typescript
console.log('Email sent');
```

**✅ Correção (seguindo CODE-QUALITY-STANDARDS.md):**
```typescript
this.logger.log({
  message: 'Email sent successfully',
  emailId: email.id,
  requestId: job.data.requestId,
  messageId: sesResponse.MessageId,
  timestamp: new Date().toISOString(),
});
```

---

### Problema: PII em logs

**❌ Código com problema:**
```typescript
this.logger.log({
  message: 'Recipient validated',
  email: recipient.email,
  cpf: recipient.cpfCnpj,
});
```

**✅ Correção (seguindo CODE-QUALITY-STANDARDS.md):**
```typescript
import { maskEmail, maskCpfCnpj } from '@email-gateway/shared';

this.logger.log({
  message: 'Recipient validated',
  email: maskEmail(recipient.email),
  cpf: recipient.cpfCnpj ? maskCpfCnpj(recipient.cpfCnpj) : undefined,
  requestId: requestId,
});
```

---

### Problema: Encryption incorreto

**❌ Código com problema:**
```typescript
const cipher = crypto.createCipher('aes-256-cbc', key);
const encrypted = cipher.update(data, 'utf8', 'hex') + cipher.final('hex');
```

**✅ Correção (seguindo CODE-QUALITY-STANDARDS.md):**
```typescript
import { encryptCpfCnpj, decryptCpfCnpj } from '@email-gateway/shared';

const { encrypted, salt } = encryptCpfCnpj(cpfCnpj, process.env.ENCRYPTION_KEY);
// Salvar encrypted E salt no banco
```

---

### Problema: Faltam testes

**❌ Código sem testes:**
```typescript
// email.service.ts
async sendEmail(dto: SendEmailDto) {
  // implementação
}
```

**✅ Adicionar testes (seguindo TESTING-STANDARDS.md):**
```typescript
// email.service.spec.ts
describe('EmailService', () => {
  let service: EmailService;
  let prisma: DeepMockProxy<PrismaClient>;

  beforeEach(() => {
    prisma = mockDeep<PrismaClient>();
    service = new EmailService(prisma);
  });

  describe('sendEmail', () => {
    it('should create email and return outbox record', async () => {
      // Arrange
      const dto = { recipient: 'test@example.com', subject: 'Test', body: 'Test' };
      const mockEmail = { id: '123', status: 'PENDING' };
      prisma.emailOutbox.create.mockResolvedValue(mockEmail as any);

      // Act
      const result = await service.sendEmail(dto);

      // Assert
      expect(result).toEqual(mockEmail);
      expect(prisma.emailOutbox.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ recipient: dto.recipient }),
      });
    });

    it('should throw error for invalid recipient', async () => {
      // Arrange
      const dto = { recipient: 'invalid-email', subject: 'Test', body: 'Test' };

      // Act & Assert
      await expect(service.sendEmail(dto)).rejects.toThrow(InvalidRecipientException);
    });
  });
});
```

---

### Problema: Environment variables sem validação

**❌ Código com problema:**
```typescript
const port = process.env.PORT || 3000;
const redisHost = process.env.REDIS_HOST;
```

**✅ Correção (seguindo CODE-QUALITY-STANDARDS.md):**
```typescript
// config/env.validation.ts
import { IsNumber, IsString, Min, Max } from 'class-validator';

class EnvironmentVariables {
  @IsNumber()
  @Min(1024)
  @Max(65535)
  PORT: number;

  @IsString()
  REDIS_HOST: string;

  @IsString()
  ENCRYPTION_KEY: string;
}

export function validate(config: Record<string, unknown>) {
  const validatedConfig = plainToClass(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });

  const errors = validateSync(validatedConfig, { skipMissingProperties: false });

  if (errors.length > 0) {
    throw new Error(`Config validation error: ${errors.toString()}`);
  }

  return validatedConfig;
}
```

---

## 📋 Registro do que fica para depois (fora de escopo)

### Novo Processo (a partir de 2025-10-20):

- **Onde:** `task/PR-BACKLOG.md` (arquivo consolidado)
- **Quando:** sempre que surgir algo que **não** faça parte do escopo atual ou **não** seja importante o suficiente agora.
- **Por quê:** garante rastreabilidade e planejamento centralizado, sem criar múltiplos arquivos.

### ❌ Processo Antigo (NÃO usar mais):
- ~~Criar arquivo separado `/task/PR<numero>-TASK<id>.md`~~
- ~~Arquivos individuais por PR~~

### ✅ Processo Novo (usar sempre):

**1. Adicione entrada no PR-BACKLOG.md:**

```markdown
## [PRXX-SHORT-TITLE] Título Curto e Descritivo

**Origem:** PR #XX
**Severidade:** CRITICAL | MODERATE | SUGGESTION
**Urgência:** 1-5 (1 = mais urgente)
**Status:** 🔴 Pendente
**Responsável:** [Nome/Time]

### Contexto
Breve descrição do que foi identificado e por quê ficou fora de escopo.

### O que precisa ser feito
- [ ] Item 1 específico
- [ ] Item 2 específico

### Detalhes Técnicos
[Arquivos afetados, snippets de código, referências]

### Dependências / Riscos
- Dependências: [listar ou "Nenhuma"]
- Riscos: [listar ou "Baixo/Médio/Alto - descrição"]
```

**2. Classifique corretamente a severidade:**

| Severidade | Quando usar |
|------------|-------------|
| **CRITICAL** | Segurança, quebra funcional, compliance, dados corrompidos |
| **MODERATE** | Qualidade de código, manutenibilidade, testabilidade, performance |
| **SUGGESTION** | Melhorias opcionais, refatorações, documentação, estilo |

**3. Defina urgência (1-5):**

| Urgência | Significado | Quando fazer |
|----------|-------------|--------------|
| **1** | Crítico - fazer ASAP | Esta sprint |
| **2** | Alta - fazer em breve | Próximas 2 sprints |
| **3** | Média - fazer quando possível | Backlog prioritário |
| **4** | Baixa - fazer se sobrar tempo | Backlog secundário |
| **5** | Muito baixa - nice to have | Backlog futuro |

**4. Comente na PR:**

```markdown
### ✅ Itens Fora de Escopo Registrados

Os seguintes itens foram identificados mas estão fora do escopo desta PR:

1. **[PRXX-HEALTH-CHECK-SES]** Adicionar health check de quota SES
   - Severidade: MODERATE
   - Urgência: 3/5
   - Registrado em: [PR-BACKLOG.md#prxx-health-check-ses](../task/PR-BACKLOG.md#prxx-health-check-ses)

2. **[PRXX-CIRCUIT-BREAKER]** Implementar circuit breaker para SES
   - Severidade: MODERATE
   - Urgência: 2/5
   - Registrado em: [PR-BACKLOG.md#prxx-circuit-breaker](../task/PR-BACKLOG.md#prxx-circuit-breaker)

Estes itens podem ser priorizados e implementados em futuras PRs.
```

**5. Atualizar estatísticas do PR-BACKLOG.md:**

Ao final do arquivo `PR-BACKLOG.md`, atualizar contadores:

```markdown
## 📊 Estatísticas

**Total de Itens:** XX
**Pendentes:** XX
**Em Progresso:** X
**Concluídos:** X

**Por Severidade:**
- CRITICAL: X
- MODERATE: X
- SUGGESTION: X
```

---

## ⚠️ Importante: Arquivos Antigos

Arquivos individuais de PR (`task/PR<numero>-TASK-<id>.md`) criados antes de 2025-10-20 ainda existem no repositório.

**O que fazer com eles:**
1. **Não criar novos** - usar apenas PR-BACKLOG.md
2. **Migrar gradualmente** - copiar conteúdo para PR-BACKLOG.md quando trabalhar neles
3. **Arquivar depois** - mover para `task/archive/` após migração

**Exemplo de migração:**
```bash
# 1. Copiar conteúdo do arquivo antigo para PR-BACKLOG.md
# 2. Mover arquivo antigo
mv task/PR11-MAJOR-01.md task/archive/
```

---

## 🔄 Workflow de Correção (Passo a Passo)

### Etapa 1: Priorizar Correções

1. Ler **todos** os comentários de review
2. Classificar por severidade:
   - 🔴 **Critical** → Corrigir PRIMEIRO
   - 🟡 **Moderate** → Corrigir SEGUNDO
   - 🟢 **Suggestion** → Avaliar TERCEIRO

### Etapa 2: Consultar Documentação

Antes de cada correção:

1. Abrir documento relevante:
   - **Qualidade/Logs/Config:** [CODE-QUALITY-STANDARDS.md](./CODE-QUALITY-STANDARDS.md)
   - **Testes:** [TESTING-STANDARDS.md](./testing/TESTING-STANDARDS.md)
2. Ler seção específica do problema
3. Copiar exemplo de código correto

### Etapa 3: Implementar Correção

1. Criar branch local ou continuar na mesma
2. Fazer correção seguindo o padrão do documento
3. **SEMPRE adicionar/atualizar testes**
4. Rodar testes localmente:
   ```bash
   npm run test
   npm run test:cov
   npm run lint
   ```

### Etapa 4: Validar Correção

Antes de fazer push:

- [ ] Correção implementada conforme padrão
- [ ] Testes adicionados/atualizados
- [ ] Todos os testes passando
- [ ] Cobertura >= 70%
- [ ] Linting sem erros
- [ ] Build compilando

### Etapa 5: Comunicar na PR

```bash
git add .
git commit -m "fix: resolve critical issue with exception handling"
git push
```

Comentar na PR:

```markdown
## ✅ Correção Implementada

**Issue:** [CRITICAL] Falta exception handling em EmailService

**Solução:**
- Adicionado global exception filter conforme CODE-QUALITY-STANDARDS.md
- Implementadas custom exceptions para erros de negócio
- Adicionado logging estruturado com request IDs
- Criados testes unitários para casos de erro

**Cobertura:**
- Antes: 45%
- Depois: 78%

**Commits:**
- abc123: fix: add global exception filter
- def456: test: add unit tests for error scenarios
```

---

## 📊 Checklist de Validação Final

Antes de solicitar re-review:

- [ ] **Todos os Critical resolvidos**
- [ ] **Todos os Moderate "Deve ser feito" resolvidos**
- [ ] **CI passando** (testes, lint, build)
- [ ] **Cobertura >= 70%**
- [ ] **Padrões seguidos:**
  - [ ] Exception handling (global filter)
  - [ ] Logging estruturado (JSON, request IDs)
  - [ ] Environment variables validadas
  - [ ] TypeScript strict (sem `any`)
  - [ ] Testes adicionados/atualizados
- [ ] **Suggestions avaliadas:**
  - [ ] Implementadas se importantes
  - [ ] Registradas em `/task` se fora de escopo
- [ ] **Comunicado na PR:**
  - [ ] Comentário explicando correções
  - [ ] Referência a commits específicos

---

## Regras de merge

- Merge permitido **apenas** quando **não houver Critical** e todos os **Deve ser feito** (Critical/Moderate) estiverem resolvidos.
- **CI deve estar passando** (testes, cobertura, lint, build)
- **Aprovação de pelo menos 1 reviewer**

---

## Hotfix

- Para `hotfix/*`, foque em resolver o problema com segurança.
- Itens não críticos que surgirem durante a revisão devem ir para `/task` conforme template.
- **Segurança e testes continuam obrigatórios mesmo em hotfix**

---

## 🆘 Quando Pedir Ajuda

Se após ler a documentação você ainda tiver dúvidas:

1. **Re-ler a seção específica** do CODE-QUALITY-STANDARDS.md ou TESTING-STANDARDS.md
2. **Buscar exemplos similares** no código existente
3. **Perguntar no comentário da PR:**
   ```markdown
   @reviewer Não tenho certeza de como implementar o exception handling para este caso específico.
   Li CODE-QUALITY-STANDARDS.md seção 1.2, mas meu caso tem X diferença.
   Pode me orientar?
   ```
4. **Não fazer "chute"** - é melhor perguntar do que implementar errado
