# 03-data-retention-privacy

> **Tipo:** Data Governance
> **Status:** Draft
> **Última atualização:** 2025-01-19
> **Responsável:** Equipe de Segurança e Compliance
> **Task:** TASK-01

---

## 📋 Sumário

Este documento detalha as políticas de retenção de dados, proteção de PII (Personally Identifiable Information) e conformidade com LGPD no sistema de envio de emails.

---

## 🔐 PII (Personally Identifiable Information)

### Dados Considerados PII

No contexto deste sistema, os seguintes campos são classificados como **PII sensível**:

| Campo | Tipo PII | Justificativa | Nível de Proteção |
|-------|----------|---------------|-------------------|
| `cpfCnpj` | **Alto** | Documento de identificação único | Hash SHA-256 + mascaramento |
| `to` (email) | **Alto** | Identifica pessoa específica | Mascaramento em logs |
| `cc`, `bcc` | **Alto** | Identifica pessoas específicas | Mascaramento em logs |
| `razaoSocial` | **Médio** | Identifica pessoa jurídica | Armazenado em plaintext |
| `nome` | **Médio** | Identifica pessoa física | Armazenado em plaintext |
| `replyTo` | **Médio** | Pode identificar pessoa | Mascaramento em logs |
| `htmlContent` | **Variável** | Pode conter PII no corpo | Sanitização obrigatória |
| `subject` | **Baixo** | Geralmente não contém PII | Armazenado em plaintext |

---

## 🛡️ Mascaramento de PII

### 1️⃣ CPF/CNPJ

**Estratégias de proteção:**

#### Armazenamento
```typescript
// NÃO armazenar CPF/CNPJ em plaintext!
// ❌ ERRADO:
await prisma.recipient.create({
  data: {
    cpfCnpj: '12345678901', // NUNCA fazer isso!
  },
});

// ✅ CORRETO:
import { hashCpfCnpj } from '@email-gateway/shared';

const cpfCnpjHash = await hashCpfCnpj('12345678901');
await prisma.recipient.create({
  data: {
    cpfCnpjHash, // SHA-256: "5f4dcc3b5aa765d61d8327deb882cf99..."
  },
});
```

#### Logs
```typescript
// ❌ ERRADO:
logger.info('Processing recipient', { cpfCnpj: '12345678901' });

// ✅ CORRETO:
import { maskCpfCnpj } from '@email-gateway/shared';

logger.info('Processing recipient', {
  cpfCnpjMasked: maskCpfCnpj('12345678901'), // "**.123.456-**"
});
```

#### Funções utilitárias

**`packages/shared/src/schemas/email-send.schema.ts`:**
```typescript
/**
 * Mascara CPF (XXX.XXX.XXX-XX)
 * Entrada: "12345678901"
 * Saída: "***.456.789-**"
 */
export function maskCPF(cpf: string): string {
  if (cpf.length !== LIMITS.CPF_LENGTH) return cpf;
  return `***.${cpf.substring(3, 6)}.${cpf.substring(6, 9)}-**`;
}

/**
 * Mascara CNPJ (XX.XXX.XXX/XXXX-XX)
 * Entrada: "12345678000190"
 * Saída: "**.345.678/0001-**"
 */
export function maskCNPJ(cnpj: string): string {
  if (cnpj.length !== LIMITS.CNPJ_LENGTH) return cnpj;
  return `**.${cnpj.substring(2, 5)}.${cnpj.substring(5, 8)}/${cnpj.substring(8, 12)}-**`;
}

/**
 * Gera hash SHA-256 de CPF/CNPJ para busca
 * Entrada: "12345678901"
 * Saída: "5f4dcc3b5aa765d61d8327deb882cf99..."
 */
export async function hashCpfCnpj(cpfCnpj: string): Promise<string> {
  const normalized = normalizeCpfCnpj(cpfCnpj);
  const encoder = new TextEncoder();
  const data = encoder.encode(normalized);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  return hashHex;
}
```

---

### 2️⃣ Email

**Estratégias de proteção:**

#### Logs
```typescript
// ❌ ERRADO:
logger.info('Sending email', { to: 'cliente@example.com' });

// ✅ CORRETO:
function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!local || !domain) return '***@***';

  const maskedLocal = local.length <= 3
    ? '***'
    : `${local.substring(0, 2)}***`;

  return `${maskedLocal}@${domain}`;
}

logger.info('Sending email', {
  to: maskEmail('cliente@example.com'), // "cl***@example.com"
});
```

#### API Response
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "to": "***@example.com",  // Mascarado
  "status": "SENT",
  "sentAt": "2025-01-19T19:30:05.234Z"
}
```

**Implementação:**
```typescript
// apps/api/src/modules/email/email.service.ts
function sanitizeEmailForResponse(email: EmailOutbox) {
  return {
    ...email,
    to: this.maskEmail(email.to),
    cc: email.cc?.map(this.maskEmail),
    bcc: email.bcc?.map(this.maskEmail),
    replyTo: email.replyTo ? this.maskEmail(email.replyTo) : undefined,
  };
}
```

---

### 3️⃣ HTML Content

**Sanitização obrigatória:**

```typescript
import DOMPurify from 'isomorphic-dompurify';

function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [
      'html', 'head', 'body', 'meta', 'title', 'style',
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'p', 'br', 'hr', 'span', 'div', 'strong', 'em', 'u', 'b', 'i',
      'ul', 'ol', 'li', 'a', 'img', 'table', 'thead', 'tbody', 'tr', 'th', 'td',
    ],
    ALLOWED_ATTR: [
      'href', 'src', 'alt', 'title', 'class', 'style', 'width', 'height',
      'colspan', 'rowspan', 'border', 'cellpadding', 'cellspacing',
    ],
    FORBID_TAGS: ['script', 'iframe', 'embed', 'object', 'form', 'input'],
    FORBID_ATTR: ['onerror', 'onclick', 'onload', 'onmouseover'],
  });
}
```

**Logs:**
```typescript
// ❌ ERRADO: Logar HTML completo
logger.info('Sending email', { html });

// ✅ CORRETO: Logar apenas metadata
logger.info('Sending email', {
  htmlSize: Buffer.byteLength(html, 'utf8'),
  htmlRef: `db:${outboxId}`,
});
```

---

## 📊 Retenção de Dados

### Políticas de Retenção

| Tipo de Dado | Retenção | Justificativa | Ação após TTL |
|--------------|----------|---------------|---------------|
| **email_outbox** | 90 dias | Auditoria e troubleshooting | Mover para cold storage ou deletar |
| **email_outbox (FAILED)** | 180 dias | Análise de falhas recorrentes | Deletar após análise |
| **Redis Queue Jobs** | 24h | Apenas dados transientes | Auto-remoção (TTL) |
| **Redis DLQ** | 7 dias | Reprocessamento manual | Deletar automaticamente |
| **Logs estruturados** | 30 dias | Debugging e compliance | Deletar automaticamente |
| **Métricas agregadas** | 1 ano | Análise de tendências | Agregação mensal |
| **Backup de banco** | 30 dias | Disaster recovery | Rotação automática |

### Implementação de TTL

#### 1. Redis Queue Jobs
```typescript
// packages/shared/src/schemas/email-job.types.ts
export const EMAIL_JOB_CONFIG = {
  DEFAULT_TTL: 86400000, // 24 horas em ms
  MAX_ATTEMPTS: 5,
} as const;

// Ao adicionar job
await emailQueue.add('email:send', data, {
  jobId: outboxId,
  ttl: EMAIL_JOB_CONFIG.DEFAULT_TTL,
  removeOnComplete: true, // Remove ao completar
});
```

#### 2. Redis DLQ
```typescript
// Dead Letter Queue com TTL de 7 dias
export const EMAIL_JOB_RETRY_CONFIG = {
  DLQ_TTL_MS: 604800000, // 7 dias em ms
  DLQ_NAME: 'email:send:dlq',
} as const;

// Ao mover para DLQ
await redis.zadd(
  EMAIL_JOB_RETRY_CONFIG.DLQ_NAME,
  Date.now() + EMAIL_JOB_RETRY_CONFIG.DLQ_TTL_MS,
  JSON.stringify(dlqEntry)
);
```

#### 3. PostgreSQL - Cleanup automático
```sql
-- Criar função de cleanup
CREATE OR REPLACE FUNCTION cleanup_old_email_outbox()
RETURNS void AS $$
BEGIN
  -- Deletar emails com sucesso após 90 dias
  DELETE FROM email_outbox
  WHERE status = 'SENT'
    AND sent_at < NOW() - INTERVAL '90 days';

  -- Deletar emails falhados após 180 dias
  DELETE FROM email_outbox
  WHERE status = 'FAILED'
    AND failed_at < NOW() - INTERVAL '180 days';

  RAISE NOTICE 'Cleanup completed';
END;
$$ LANGUAGE plpgsql;

-- Agendar execução diária via pg_cron ou cron job externo
-- Exemplo com pg_cron:
SELECT cron.schedule('cleanup-emails', '0 3 * * *', 'SELECT cleanup_old_email_outbox()');
```

**Alternativa com CronJob do Kubernetes:**
```yaml
apiVersion: batch/v1
kind: CronJob
metadata:
  name: email-cleanup
spec:
  schedule: "0 3 * * *" # Todo dia às 3h da manhã
  jobTemplate:
    spec:
      template:
        spec:
          containers:
          - name: cleanup
            image: postgres:15-alpine
            command:
            - psql
            - "-c"
            - "SELECT cleanup_old_email_outbox();"
            env:
            - name: PGHOST
              value: postgres-service
            - name: PGDATABASE
              value: email_gateway
            - name: PGUSER
              valueFrom:
                secretKeyRef:
                  name: db-credentials
                  key: username
            - name: PGPASSWORD
              valueFrom:
                secretKeyRef:
                  name: db-credentials
                  key: password
          restartPolicy: OnFailure
```

---

## 📜 LGPD (Lei Geral de Proteção de Dados)

### Direitos do Titular

O sistema deve suportar os seguintes direitos do titular de dados:

#### 1. Direito de Acesso (Art. 18, II)
**Requisição:** "Quais emails foram enviados para meu endereço?"

**Implementação:**
```typescript
// GET /v1/emails/by-recipient
async getEmailsByRecipient(cpfCnpj: string): Promise<Email[]> {
  // Hash do CPF/CNPJ para busca
  const cpfCnpjHash = await hashCpfCnpj(cpfCnpj);

  return await prisma.emailOutbox.findMany({
    where: {
      recipient: {
        cpfCnpjHash,
      },
    },
    select: {
      id: true,
      to: true,
      subject: true,
      status: true,
      sentAt: true,
      createdAt: true,
      // NÃO retornar htmlContent (pode conter dados de terceiros)
    },
  });
}
```

#### 2. Direito de Correção (Art. 18, III)
**Requisição:** "Meu email está incorreto, preciso atualizá-lo."

**Implementação:**
```typescript
// PATCH /v1/recipients/:id
async updateRecipient(id: string, data: UpdateRecipientDto) {
  // Validar novo email
  const validatedEmail = emailSchema.parse(data.email);

  return await prisma.recipient.update({
    where: { id },
    data: {
      email: validatedEmail,
      updatedAt: new Date(),
    },
  });
}
```

#### 3. Direito de Exclusão (Art. 18, VI)
**Requisição:** "Quero que meus dados sejam deletados."

**Implementação:**
```typescript
// DELETE /v1/recipients/:id/gdpr-delete
async gdprDeleteRecipient(id: string) {
  await prisma.$transaction(async (tx) => {
    // 1. Anonimizar emails enviados (manter para auditoria)
    await tx.emailOutbox.updateMany({
      where: { recipientId: id },
      data: {
        to: 'REDACTED@gdpr-deletion.local',
        metadata: prisma.JsonNull, // Remove dados do recipient
      },
    });

    // 2. Deletar recipient
    await tx.recipient.delete({
      where: { id },
    });

    // 3. Registrar ação de GDPR
    await tx.gdprLog.create({
      data: {
        action: 'DELETE',
        recipientId: id,
        requestedAt: new Date(),
        processedAt: new Date(),
      },
    });
  });
}
```

#### 4. Direito de Portabilidade (Art. 18, V)
**Requisição:** "Quero exportar meus dados."

**Implementação:**
```typescript
// GET /v1/recipients/:id/export
async exportRecipientData(id: string): Promise<Buffer> {
  const recipient = await prisma.recipient.findUniqueOrThrow({
    where: { id },
    include: {
      emails: {
        select: {
          id: true,
          to: true,
          subject: true,
          status: true,
          sentAt: true,
          createdAt: true,
        },
      },
    },
  });

  // Gerar JSON estruturado
  const exportData = {
    recipient: {
      externalId: recipient.externalId,
      email: recipient.email,
      nome: recipient.nome,
      razaoSocial: recipient.razaoSocial,
      createdAt: recipient.createdAt,
    },
    emails: recipient.emails,
    exportedAt: new Date().toISOString(),
  };

  return Buffer.from(JSON.stringify(exportData, null, 2));
}
```

### Registro de Operações com PII

```typescript
// Criar tabela de auditoria
CREATE TABLE pii_access_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  action VARCHAR(50) NOT NULL, -- 'VIEW' | 'EXPORT' | 'UPDATE' | 'DELETE'
  resource_type VARCHAR(50) NOT NULL, -- 'recipient' | 'email'
  resource_id UUID NOT NULL,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Índice para consultas rápidas
CREATE INDEX idx_pii_access_log_resource ON pii_access_log(resource_type, resource_id);
CREATE INDEX idx_pii_access_log_user ON pii_access_log(user_id, created_at DESC);
```

**Implementação:**
```typescript
// Decorator para auditoria automática
@AuditPII('VIEW', 'recipient')
async getRecipient(id: string, req: Request): Promise<Recipient> {
  // Registra automaticamente no pii_access_log
  return await prisma.recipient.findUniqueOrThrow({ where: { id } });
}
```

---

## 🚨 Alertas de Compliance

### Detecção de Vazamento de PII em Logs

```typescript
// Middleware de sanitização de logs
import { Logger } from '@nestjs/common';

const PII_PATTERNS = {
  cpf: /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g,
  cnpj: /\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g,
  email: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
};

function sanitizeLogMessage(message: string): string {
  let sanitized = message;

  sanitized = sanitized.replace(PII_PATTERNS.cpf, '***.***.***-**');
  sanitized = sanitized.replace(PII_PATTERNS.cnpj, '**.***.***/****-**');
  sanitized = sanitized.replace(PII_PATTERNS.email, '***@***.***');

  return sanitized;
}

// Wrapper do logger
class SafeLogger extends Logger {
  log(message: any, context?: string) {
    super.log(sanitizeLogMessage(String(message)), context);
  }

  error(message: any, trace?: string, context?: string) {
    super.error(sanitizeLogMessage(String(message)), trace, context);
  }
}
```

### Alerta de Volume Anormal de Acessos a PII

```yaml
alert: UnusualPIIAccessVolume
expr: |
  sum(rate(pii_access_log_total[5m])) by (user_id) > 100
for: 5m
severity: warning
description: "User {{ $labels.user_id }} accessing PII at unusually high rate"
```

---

## ✅ Checklist de Compliance

### Desenvolvimento

- [x] CPF/CNPJ armazenado apenas como hash SHA-256
- [x] Mascaramento de PII em todos os logs
- [x] Sanitização de HTML antes de armazenar
- [x] Funções utilitárias de mascaramento disponíveis
- [x] TTL configurado em Redis jobs (24h)
- [x] TTL configurado em DLQ (7 dias)

### Operacional

- [ ] Cleanup automático de email_outbox (90 dias)
- [ ] Backup com retenção de 30 dias
- [ ] Logs com retenção de 30 dias
- [ ] Processo de GDPR delete implementado
- [ ] Auditoria de acesso a PII implementada
- [ ] Alertas de vazamento de PII configurados

### Documentação

- [x] Políticas de retenção documentadas
- [x] Procedimentos de GDPR documentados
- [x] Exemplos práticos de mascaramento
- [ ] Treinamento da equipe sobre LGPD

---

## 📚 Referências

- [LGPD - Lei nº 13.709/2018](http://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709.htm)
- [GDPR - Regulamento (UE) 2016/679](https://eur-lex.europa.eu/legal-content/PT/TXT/HTML/?uri=CELEX:32016R0679)
- [OWASP Cheat Sheet - Data Masking](https://cheatsheetseries.owasp.org/cheatsheets/Data_Masking_Cheat_Sheet.html)
- [Contrato da API](../api/03-email-send-contract.md)
- [Segurança](./02-security.md)

---

**Última revisão:** 2025-01-19
**Próxima revisão:** Trimestral ou após mudanças regulatórias
