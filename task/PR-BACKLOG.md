# PR-BACKLOG - Items Identificados em Code Reviews

**Versão:** 1.0.0
**Última Atualização:** 2025-10-20
**Propósito:** Backlog de melhorias, refatorações e correções identificadas durante code reviews de PRs

---

## 📋 Como Usar Este Backlog

Este arquivo centraliza **todos** os itens identificados em code reviews que ficaram **fora de escopo** da PR original.

### Workflow:

1. **Durante Code Review:** Reviewer identifica item fora de escopo
2. **Registrar aqui:** Adicionar nova entrada neste arquivo (não criar arquivo separado)
3. **Priorizar:** Classificar por urgência (1-5)
4. **Implementar:** Quando tiver capacidade, pegar item do backlog
5. **Marcar concluído:** Atualizar status quando implementado

### Formato de Entrada:

```markdown
## [PRXX] Título Curto

**Origem:** PR #XX
**Severidade:** CRITICAL | MODERATE | SUGGESTION
**Urgência:** 1-5 (1 = mais urgente)
**Status:** 🔴 Pendente | 🟡 Em Progresso | ✅ Concluído
**Responsável:** [Nome/Time]

### Contexto
Breve descrição do que foi identificado e por quê ficou fora de escopo.

### O que precisa ser feito
- [ ] Item 1
- [ ] Item 2

### Detalhes Técnicos
[Arquivos afetados, snippets de código, referências]

### Dependências / Riscos
- Dependências: [listar]
- Riscos: [listar]
```

---

## 🎯 Índice por Status

- [Itens Pendentes (🔴)](#itens-pendentes-)
- [Itens em Progresso (🟡)](#itens-em-progresso-)
- [Itens Concluídos (✅)](#itens-concluídos-)

---

## Itens Pendentes (🔴)

### [PR11-MAJOR-01] Melhorar .env.example com placeholders seguros

**Origem:** PR #11
**Severidade:** MODERATE
**Urgência:** 3/5
**Status:** 🔴 Pendente
**Responsável:** DevOps/Segurança

#### Contexto
O `.env.example` usa placeholders genéricos (`your_access_key_id`) que podem levar desenvolvedores a commitar credenciais reais acidentalmente.

#### O que precisa ser feito
- [ ] Substituir placeholders genéricos por EXAMPLE credentials oficiais da AWS
- [ ] Adicionar comentários de aviso sobre nunca commitar credenciais reais
- [ ] Recomendar IAM roles para produção
- [ ] Recomendar AWS_PROFILE para desenvolvimento local

#### Detalhes Técnicos

**Arquivo:** `.env.example` linhas 25-26

```diff
-AWS_ACCESS_KEY_ID=your_access_key_id
-AWS_SECRET_ACCESS_KEY=your_secret_access_key
+# IMPORTANTE: NUNCA commite credenciais reais!
+# Em produção, use IAM roles. Localmente, use AWS_PROFILE ou credenciais temporárias.
+# Credenciais AWS (use placeholders EXAMPLE - não funcionam de verdade)
+AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE
+AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
```

**Referência:** https://docs.aws.amazon.com/general/latest/gr/aws-sec-cred-types.html#access-keys-and-secret-access-keys

#### Dependências / Riscos
- Dependências: Nenhuma
- Riscos: Baixo - apenas documentação

---

### [PR11-MAJOR-02] Adicionar health check de quota SES

**Origem:** PR #11
**Severidade:** MODERATE
**Urgência:** 3/5
**Status:** 🔴 Pendente
**Responsável:** Backend

#### Contexto
Durante revisão do PR #11, identificou-se que o endpoint `/health` não verifica quota disponível do SES. Isso pode causar falhas silenciosas quando a quota for excedida.

#### O que precisa ser feito
- [ ] Adicionar chamada ao SES para obter quota atual
- [ ] Comparar com threshold configurável (ex: 80%)
- [ ] Retornar warning se quota > 80%
- [ ] Retornar unhealthy se quota >= 100%
- [ ] Adicionar métrica `ses_quota_usage_percent`
- [ ] Documentar em runbook

#### Detalhes Técnicos

**Arquivo:** `apps/api/src/modules/health/health.service.ts`

```typescript
async checkSESQuota(): Promise<HealthCheckResult> {
  const quota = await this.sesClient.send(
    new GetSendQuotaCommand({})
  );

  const usagePercent = (quota.SentLast24Hours / quota.Max24HourSend) * 100;

  if (usagePercent >= 100) {
    return { status: 'unhealthy', message: 'SES quota exceeded' };
  }

  if (usagePercent >= 80) {
    return { status: 'warning', message: `SES quota at ${usagePercent}%` };
  }

  return { status: 'healthy', quota: usagePercent };
}
```

#### Dependências / Riscos
- Dependências: AWS SDK @aws-sdk/client-ses
- Riscos: Médio - adiciona latência ao health check

---

### [PR11-MAJOR-03] Implementar circuit breaker para SES

**Origem:** PR #11
**Severidade:** MODERATE
**Urgência:** 2/5
**Status:** 🔴 Pendente
**Responsável:** Backend

#### Contexto
Worker não tem circuit breaker para SES. Se SES ficar indisponível, jobs continuarão falhando e retentando indefinidamente, desperdiçando recursos.

#### O que precisa ser feito
- [ ] Implementar circuit breaker pattern (lib: opossum ou similar)
- [ ] Configurar thresholds: 50% erro rate em 10 requisições → abre circuito
- [ ] Timeout de 30s quando circuito aberto
- [ ] Retry exponencial quando circuito meio-aberto
- [ ] Métricas de estado do circuit breaker
- [ ] Logs quando circuito muda de estado
- [ ] Testes unitários do comportamento

#### Detalhes Técnicos

**Biblioteca:** `npm install opossum`

**Arquivo:** `apps/worker/src/services/ses.service.ts`

```typescript
import CircuitBreaker from 'opossum';

const options = {
  timeout: 5000,
  errorThresholdPercentage: 50,
  resetTimeout: 30000,
};

const breaker = new CircuitBreaker(this.sendEmail, options);

breaker.on('open', () => {
  this.logger.error('Circuit breaker OPEN - SES unavailable');
});

breaker.on('halfOpen', () => {
  this.logger.warn('Circuit breaker HALF-OPEN - testing SES');
});

breaker.on('close', () => {
  this.logger.log('Circuit breaker CLOSED - SES recovered');
});
```

#### Dependências / Riscos
- Dependências: opossum library
- Riscos: Médio - pode impactar throughput durante falhas

---

### [PR11-MAJOR-04] Melhorar tratamento de erros transientes vs permanentes

**Origem:** PR #11
**Severidade:** MODERATE
**Urgência:** 2/5
**Status:** 🔴 Pendente
**Responsável:** Backend

#### Contexto
Worker classifica erros como transientes ou permanentes de forma básica. Falta granularidade para casos específicos do SES.

#### O que precisa ser feito
- [ ] Criar enum `SESErrorType` com categorias detalhadas
- [ ] Mapear códigos de erro SES → categoria
- [ ] Implementar retry policy diferenciada por categoria
- [ ] Documentar cada categoria em runbook
- [ ] Adicionar métricas por categoria de erro
- [ ] Testes para cada tipo de erro

#### Detalhes Técnicos

**Arquivo:** `apps/worker/src/services/email-error-classifier.service.ts`

```typescript
enum SESErrorType {
  // Permanentes - não retry
  INVALID_EMAIL = 'INVALID_EMAIL',
  SUPPRESSED = 'SUPPRESSED',
  MESSAGE_REJECTED = 'MESSAGE_REJECTED',

  // Transientes - retry rápido
  THROTTLING = 'THROTTLING',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',

  // Transientes - retry lento
  QUOTA_EXCEEDED = 'QUOTA_EXCEEDED',

  // Incertos - retry limitado
  UNKNOWN = 'UNKNOWN',
}

class EmailErrorClassifier {
  classify(error: SESError): {
    type: SESErrorType;
    retryable: boolean;
    retryAfter?: number;
  } {
    // Lógica de classificação
  }
}
```

#### Dependências / Riscos
- Dependências: Nenhuma
- Riscos: Baixo - melhoria incremental

---

### [PR11-MAJOR-05] Adicionar observabilidade detalhada de falhas

**Origem:** PR #11
**Severidade:** MODERATE
**Urgência:** 3/5
**Status:** 🔴 Pendente
**Responsável:** Backend

#### Contexto
Logs e métricas de falhas são básicas. Falta correlação e análise para troubleshooting efetivo.

#### O que precisa ser feito
- [ ] Adicionar métricas detalhadas por tipo de erro
- [ ] Logs estruturados com contexto completo (requestId, jobId, attempt)
- [ ] Dashboard Grafana com breakdown de erros
- [ ] Alertas configurados por tipo de erro crítico
- [ ] Trace distribuído end-to-end (API → Worker → SES)
- [ ] Documentar queries úteis no runbook

#### Detalhes Técnicos

**Métricas a adicionar:**
```typescript
// Counter por tipo de erro
email_errors_total{error_type="THROTTLING", company_id="..."}
email_errors_total{error_type="QUOTA_EXCEEDED", company_id="..."}

// Histogram de latência por resultado
email_send_duration_seconds{result="success"}
email_send_duration_seconds{result="permanent_failure"}
email_send_duration_seconds{result="transient_failure"}

// Gauge de taxa de erro por janela de tempo
email_error_rate_5m{company_id="..."}
```

**Logs estruturados:**
```typescript
this.logger.error({
  message: 'Email send failed',
  errorType: 'THROTTLING',
  requestId,
  jobId,
  outboxId,
  attempt: job.attemptsMade,
  sesErrorCode: error.Code,
  sesErrorMessage: error.Message,
  companyId,
  willRetry: true,
  retryAfter: 60,
});
```

#### Dependências / Riscos
- Dependências: Prometheus, Grafana
- Riscos: Baixo - apenas observabilidade

---

### [PR12-TASK-5.2] Adicionar validação de chave de criptografia

**Origem:** PR #12
**Severidade:** CRITICAL
**Urgência:** 2/5
**Status:** 🔴 Pendente
**Responsável:** Backend/Segurança

#### Contexto
Durante implementação de TASK 5.2 (PII encryption), identificou-se que falta validação da chave de criptografia no startup da aplicação.

#### O que precisa ser feito
- [ ] Validar que `ENCRYPTION_KEY` está definida
- [ ] Validar comprimento mínimo (256 bits / 32 bytes)
- [ ] Validar que não é um valor default/exemplo
- [ ] Falhar fast no startup se inválida
- [ ] Adicionar teste de validação
- [ ] Documentar requisitos da chave

#### Detalhes Técnicos

**Arquivo:** `apps/api/src/config/env.validation.ts`

```typescript
import { IsString, MinLength, validate } from 'class-validator';

class EnvironmentVariables {
  @IsString()
  @MinLength(32, {
    message: 'ENCRYPTION_KEY must be at least 32 characters (256 bits)',
  })
  ENCRYPTION_KEY: string;
}

// Custom validator
function validateEncryptionKey(key: string): void {
  const invalidKeys = [
    'changeme',
    'example',
    'test',
    '00000000000000000000000000000000',
  ];

  if (invalidKeys.some(invalid => key.toLowerCase().includes(invalid))) {
    throw new Error(
      'ENCRYPTION_KEY appears to be a default/example value. Use a strong random key.'
    );
  }

  if (key.length < 32) {
    throw new Error('ENCRYPTION_KEY must be at least 32 characters');
  }
}
```

#### Dependências / Riscos
- Dependências: class-validator
- Riscos: Alto se não implementado - dados podem ser encriptados com chave fraca

---

### [PR8-TASK-3.2] Refatoração completa de magic numbers

**Origem:** PR #8
**Severidade:** SUGGESTION
**Urgência:** 4/5
**Status:** 🔴 Pendente
**Responsável:** Backend

#### Contexto
Schema `email-job.schema.ts` contém diversos magic numbers. Iniciamos refatoração criando `EMAIL_JOB_VALIDATION`, mas refatoração completa ficou fora de escopo.

#### O que precisa ser feito
- [ ] Substituir todos números literais em email-job.schema.ts por constantes
- [ ] Revisar email-send.schema.ts para identificar magic numbers
- [ ] Garantir mensagens de erro usam template strings com constantes
- [ ] Atualizar testes para usar constantes
- [ ] Validar sem regressões

#### Detalhes Técnicos

**Exemplo:**
```typescript
// ANTES
@MaxLength(200)
subject: string;

// DEPOIS
@MaxLength(EMAIL_JOB_VALIDATION.SUBJECT_MAX_LENGTH)
subject: string;

// E a mensagem de erro
.withMessage(`Subject must be at most ${EMAIL_JOB_VALIDATION.SUBJECT_MAX_LENGTH} characters`)
```

#### Dependências / Riscos
- Dependências: Nenhuma
- Riscos: Baixo - refatoração interna

---

### [PR8-TASK-3.3] Adicionar validação de MIME type para anexos

**Origem:** PR #8
**Severidade:** SUGGESTION
**Urgência:** 4/5
**Status:** 🔴 Pendente
**Responsável:** Backend

#### Contexto
Schema aceita attachments mas não valida MIME types. Isso pode permitir arquivos maliciosos ou inesperados.

#### O que precisa ser feito
- [ ] Criar lista de MIME types permitidos (allowlist)
- [ ] Validar MIME type de cada attachment
- [ ] Rejeitar attachments com MIME type não permitido
- [ ] Adicionar mensagem de erro clara
- [ ] Documentar MIME types aceitos na API
- [ ] Testes para validação

#### Detalhes Técnicos

```typescript
const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'text/plain',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
];

@IsArray()
@ValidateNested({ each: true })
@ArrayMaxSize(EMAIL_JOB_VALIDATION.MAX_ATTACHMENTS)
@Type(() => AttachmentDto)
attachments?: AttachmentDto[];

class AttachmentDto {
  @IsString()
  @IsIn(ALLOWED_MIME_TYPES, {
    message: `MIME type must be one of: ${ALLOWED_MIME_TYPES.join(', ')}`,
  })
  mimeType: string;
}
```

#### Dependências / Riscos
- Dependências: Nenhuma
- Riscos: Médio - pode quebrar integrações existentes se já enviarem tipos não permitidos

---

### [PR8-TASK-3.4] Melhorar mensagens de validação com exemplos

**Origem:** PR #8
**Severidade:** SUGGESTION
**Urgência:** 5/5
**Status:** 🔴 Pendente
**Responsável:** Backend

#### Contexto
Mensagens de erro de validação são genéricas. Desenvolvedores podem não entender como corrigir.

#### O que precisa ser feito
- [ ] Adicionar exemplos nas mensagens de erro
- [ ] Incluir valores válidos quando aplicável
- [ ] Padronizar formato de mensagens
- [ ] Documentar na API

#### Detalhes Técnicos

```typescript
// ANTES
@IsEmail()
recipient: string;

// DEPOIS
@IsEmail({}, {
  message: 'Invalid email format. Example: user@example.com',
})
recipient: string;

// ANTES
@MaxLength(200)
subject: string;

// DEPOIS
@MaxLength(200, {
  message: 'Subject too long. Maximum 200 characters. Example: "Invoice #12345 - Payment Due"',
})
subject: string;
```

#### Dependências / Riscos
- Dependências: Nenhuma
- Riscos: Nenhum

---

### [PR2-TASK-01] Adicionar índice composto para queries de dashboard

**Origem:** PR #2
**Severidade:** MODERATE
**Urgência:** 3/5
**Status:** 🔴 Pendente
**Responsável:** Backend/DBA

#### Contexto
Queries do dashboard filtram por `companyId + status + createdAt`. Sem índice composto, performance degrada com volume.

#### O que precisa ser feito
- [ ] Criar migration com índice composto
- [ ] Validar impacto em queries existentes
- [ ] Testar performance antes/depois
- [ ] Documentar índice em schema

#### Detalhes Técnicos

```sql
-- Migration
CREATE INDEX idx_email_outbox_dashboard
ON email_outbox(company_id, status, created_at DESC);

-- Prisma schema
@@index([companyId, status, createdAt(sort: Desc)], name: "idx_email_outbox_dashboard")
```

#### Dependências / Riscos
- Dependências: Nenhuma
- Riscos: Baixo - melhoria de performance

---

### [TASK-6-2-TEST-IMPROVEMENTS] Melhorar cobertura de testes TASK 6.2

**Origem:** TASK 6.2 (SES Domain Management)
**Severidade:** MODERATE
**Urgência:** 3/5
**Status:** 🔴 Pendente
**Responsável:** Backend

#### Contexto
TASK 6.2 foi implementada mas testes de integração ficaram pendentes.

#### O que precisa ser feito
- [ ] Adicionar testes de integração para domainService
- [ ] Testar fluxo completo de verificação de domínio
- [ ] Testar tratamento de erros do Route53
- [ ] Mockar AWS SDK corretamente
- [ ] Atingir cobertura >= 70%

#### Detalhes Técnicos

Ver arquivo completo: `task/TASK-6-2-TEST-IMPROVEMENTS.md`

#### Dependências / Riscos
- Dependências: aws-sdk-client-mock
- Riscos: Baixo - apenas testes

---

## Itens em Progresso (🟡)

_Nenhum item em progresso no momento_

---

## Itens Concluídos (✅)

_Nenhum item concluído no momento_

---

## 📊 Estatísticas

**Total de Itens:** 12
**Pendentes:** 12
**Em Progresso:** 0
**Concluídos:** 0

**Por Severidade:**
- CRITICAL: 1
- MODERATE: 8
- SUGGESTION: 3

**Por Urgência:**
- Urgência 1: 0
- Urgência 2: 2
- Urgência 3: 5
- Urgência 4: 2
- Urgência 5: 1

---

## 🔄 Processo de Atualização

### Quando adicionar item:
1. Identificado durante code review
2. Discussão confirma que é fora de escopo da PR atual
3. Adicionar nova entrada seguindo formato
4. Classificar severidade e urgência
5. Assignar responsável
6. Comentar na PR: "Registrado em PR-BACKLOG.md como [PRXX-...]"

### Quando marcar como concluído:
1. Implementação feita e merged
2. Mover item da seção "Pendentes" para "Concluídos"
3. Adicionar link para PR que implementou
4. Atualizar estatísticas

### Quando remover item:
1. Item não é mais relevante
2. Decisão de não implementar
3. Adicionar nota explicando motivo
4. Mover para seção "Arquivados" (no final do arquivo)

---

## 📚 Referências

- [PR_REVIEW_RULES.md](../docs/PR_REVIEW_RULES.md) - Como fazer reviews
- [PR_ADJUSTMENTS.md](../docs/PR_ADJUSTMENTS.md) - Como tratar comentários
- [CORE-BACKLOG.md](./CORE-BACKLOG.md) - Backlog principal do produto
