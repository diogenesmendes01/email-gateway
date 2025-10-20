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

### [PR18-RAFAEL-01] Implementar constant-time comparison para operações de segurança

**Origem:** PR #18 (TASK 8.1) - Rafael's Technical Review
**Severidade:** MODERATE
**Urgência:** 2/5
**Status:** 🔴 Pendente
**Responsável:** Backend/Segurança

#### Contexto
Durante análise técnica do PR #18, identificou-se que a função `isValidHash()` usa comparação de string padrão que pode ser vulnerável a timing attacks. Embora esta função específica seja apenas para validação, o padrão pode ser copiado para comparações críticas de segurança.

#### O que precisa ser feito
- [ ] Criar função `constantTimeCompare()` usando `crypto.timingSafeEqual()`
- [ ] Adicionar testes para a nova função
- [ ] Documentar quando usar constant-time comparison
- [ ] Revisar código existente para identificar outros locais que precisam da função
- [ ] Adicionar ao guia de segurança

#### Detalhes Técnicos

**Arquivo:** `packages/shared/src/utils/encryption.util.ts`

**Implementação:**
```typescript
/**
 * Compare two strings in constant time to prevent timing attacks
 *
 * @param a - First string to compare
 * @param b - Second string to compare
 * @returns True if strings are equal
 */
export function constantTimeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) {
    // Length comparison is safe - length is not secret
    return false;
  }

  const bufferA = Buffer.from(a);
  const bufferB = Buffer.from(b);

  return crypto.timingSafeEqual(bufferA, bufferB);
}

/**
 * Compare hash values in constant time
 *
 * @param hash1 - First hash
 * @param hash2 - Second hash
 * @returns True if hashes match
 */
export function compareHashesSafe(hash1: string, hash2: string): boolean {
  if (!isValidHash(hash1) || !isValidHash(hash2)) {
    return false;
  }

  return constantTimeCompare(hash1, hash2);
}
```

**Testes:**
```typescript
describe('constantTimeCompare', () => {
  it('should return true for equal strings', () => {
    const str = 'a'.repeat(64);
    expect(constantTimeCompare(str, str)).toBe(true);
  });

  it('should return false for different strings', () => {
    const str1 = 'a'.repeat(64);
    const str2 = 'b'.repeat(64);
    expect(constantTimeCompare(str1, str2)).toBe(false);
  });

  it('should return false for different lengths', () => {
    expect(constantTimeCompare('abc', 'abcd')).toBe(false);
  });

  it('should be safe for hash comparison', () => {
    const hash1 = hashCpfCnpjSha256('12345678901');
    const hash2 = hashCpfCnpjSha256('12345678901');
    expect(constantTimeCompare(hash1, hash2)).toBe(true);
  });
});
```

**Casos de uso:**
```typescript
// ❌ INSEGURO - Timing attack vulnerability
if (storedHash === providedHash) {
  // authenticate
}

// ✅ SEGURO - Constant-time comparison
if (constantTimeCompare(storedHash, providedHash)) {
  // authenticate
}
```

#### Dependências / Riscos
- Dependências: Nenhuma (usa crypto nativo do Node.js)
- Riscos: Baixo - função defensiva, não quebra nada

---

### [PR18-RAFAEL-02] Substituir console.log/console.error por structured logging

**Origem:** PR #18 (TASK 8.1) - Rafael's Technical Review
**Severidade:** MODERATE
**Urgência:** 3/5
**Status:** 🔴 Pendente
**Responsável:** Backend

#### Contexto
`email-send.service.ts` usa `console.log` e `console.error` ao invés de NestJS Logger com structured logging. Isso impede correlação de requisições, filtragem por severity e aggregação de logs.

#### O que precisa ser feito
- [ ] Injetar Logger no `EmailSendService`
- [ ] Substituir `console.log` linha 99 por `this.logger.log()`
- [ ] Substituir `console.error` linha 343 por `this.logger.error()`
- [ ] Usar JSON structured format com contexto completo
- [ ] Adicionar requestId, companyId em todos os logs
- [ ] Garantir que nenhum PII é logado
- [ ] Atualizar testes se necessário

#### Detalhes Técnicos

**Arquivo:** `apps/api/src/modules/email/services/email-send.service.ts`

**Linha 99 - ANTES:**
```typescript
console.log(`📧 Email enqueued for processing: ${jobId}`);
```

**Linha 99 - DEPOIS:**
```typescript
this.logger.log({
  message: 'Email enqueued for processing',
  jobId,
  outboxId,
  companyId,
  recipientId,
  requestId: requestId || 'unknown',
  status: EmailStatus.ENQUEUED,
});
```

**Linha 343 - ANTES:**
```typescript
} catch (error) {
  console.error('Error decrypting CPF/CNPJ:', error);
  throw new Error('Failed to decrypt sensitive data');
}
```

**Linha 343 - DEPOIS:**
```typescript
} catch (error) {
  this.logger.error({
    message: 'Failed to decrypt CPF/CNPJ',
    error: error.message,
    stack: error.stack,
    // DO NOT log: encryptedCpfCnpj, salt, key
  });

  throw new InternalServerErrorException({
    code: 'DECRYPTION_FAILED',
    message: 'Unable to decrypt sensitive data',
  });
}
```

**Injeção do Logger:**
```typescript
import { Injectable, Logger, InternalServerErrorException } from '@nestjs/common';

@Injectable()
export class EmailSendService {
  private readonly logger = new Logger(EmailSendService.name);

  // ... rest of the class
}
```

#### Dependências / Riscos
- Dependências: NestJS Logger (já disponível)
- Riscos: Baixo - melhoria de observabilidade

---

### [PR18-RAFAEL-03] Adicionar monitoramento de performance de criptografia

**Origem:** PR #18 (TASK 8.1) - Rafael's Technical Review
**Severidade:** SUGGESTION
**Urgência:** 4/5
**Status:** 🔴 Pendente
**Responsável:** Backend

#### Contexto
PBKDF2 com 100k iterações pode adicionar 50-100ms de latência por CPF/CNPJ. É importante monitorar para detectar degradação de performance em escala.

#### O que precisa ser feito
- [ ] Adicionar timer antes/depois de `encryptCpfCnpj()`
- [ ] Logar warning se duração > 200ms
- [ ] Adicionar métrica Prometheus `encryption_duration_seconds`
- [ ] Criar alerta se P95 > 200ms
- [ ] Documentar threshold em runbook

#### Detalhes Técnicos

**Arquivo:** `apps/api/src/modules/email/services/email-send.service.ts`

**Linhas 202-208 - Adicionar monitoramento:**
```typescript
if (recipient.cpfCnpj) {
  const startTime = Date.now();

  const hash = hashCpfCnpjSha256(recipient.cpfCnpj);
  const { encrypted, salt } = encryptCpfCnpj(recipient.cpfCnpj, this.getEncryptionKey());

  const duration = Date.now() - startTime;

  // Log slow encryption
  if (duration > 200) {
    this.logger.warn({
      message: 'Slow CPF/CNPJ encryption detected',
      duration,
      threshold: 200,
      requestId,
      companyId,
    });
  }

  // Emit metric (if using Prometheus)
  // this.metricsService.recordHistogram('encryption_duration_seconds', duration / 1000, {
  //   operation: 'encrypt_cpf_cnpj',
  // });

  recipientData.cpfCnpjHash = hash;
  recipientData.cpfCnpjEnc = encrypted;
  recipientData.cpfCnpjSalt = salt;
}
```

**Métricas Prometheus (future):**
```typescript
# HELP encryption_duration_seconds Time to encrypt CPF/CNPJ
# TYPE encryption_duration_seconds histogram
encryption_duration_seconds_bucket{operation="encrypt_cpf_cnpj",le="0.05"} 245
encryption_duration_seconds_bucket{operation="encrypt_cpf_cnpj",le="0.1"} 892
encryption_duration_seconds_bucket{operation="encrypt_cpf_cnpj",le="0.2"} 995
encryption_duration_seconds_bucket{operation="encrypt_cpf_cnpj",le="+Inf"} 1000
```

**Alerta (future):**
```yaml
- alert: SlowEncryption
  expr: histogram_quantile(0.95, encryption_duration_seconds_bucket) > 0.2
  for: 5m
  annotations:
    summary: "P95 encryption latency > 200ms"
    description: "Consider scaling or optimizing encryption"
```

#### Dependências / Riscos
- Dependências: Nenhuma (logging básico), Prometheus (opcional)
- Riscos: Nenhum - apenas observabilidade

---

### [PR18-TASK-8.1-01] Adicionar testes unitários para integração de criptografia no email-send.service

**Origem:** PR #18 (TASK 8.1)
**Severidade:** MODERATE
**Urgência:** 3/5
**Status:** 🔴 Pendente
**Responsável:** Backend

#### Contexto
Durante review do PR #18, identificou-se que a integração de criptografia em `email-send.service.ts` não possui testes unitários. Enquanto as funções utilitárias em `@email-gateway/shared` têm 100% de cobertura, a integração no serviço não está testada.

#### O que precisa ser feito
- [ ] Criar `apps/api/src/modules/email/services/__tests__/email-send.service.encryption.spec.ts`
- [ ] Testar `getEncryptionKey()` validation
- [ ] Testar `decryptCpfCnpj()` com inputs válidos/inválidos
- [ ] Testar integração na criação de recipients com CPF/CNPJ
- [ ] Testar error handling quando `ENCRYPTION_KEY` inválida
- [ ] Garantir cobertura >= 80% para serviços

#### Detalhes Técnicos

**Arquivo:** `apps/api/src/modules/email/services/email-send.service.ts`

**Casos de teste necessários:**
```typescript
describe('EmailSendService - Encryption', () => {
  describe('getEncryptionKey', () => {
    it('should throw error if ENCRYPTION_KEY not set', () => {
      delete process.env.ENCRYPTION_KEY;
      expect(() => service.getEncryptionKey()).toThrow('ENCRYPTION_KEY must be set');
    });

    it('should throw error if ENCRYPTION_KEY too short', () => {
      process.env.ENCRYPTION_KEY = 'short';
      expect(() => service.getEncryptionKey()).toThrow('at least 32 characters');
    });

    it('should return key if valid', () => {
      process.env.ENCRYPTION_KEY = 'a'.repeat(32);
      expect(service.getEncryptionKey()).toBe('a'.repeat(32));
    });
  });

  describe('decryptCpfCnpj', () => {
    it('should decrypt valid encrypted CPF/CNPJ', () => {
      const { encrypted, salt } = encryptCpfCnpj('12345678901', 'password');
      const decrypted = service.decryptCpfCnpj(encrypted, salt);
      expect(decrypted).toBe('12345678901');
    });

    it('should throw error with wrong key', () => {
      const { encrypted, salt } = encryptCpfCnpj('12345678901', 'password1');
      expect(() => service.decryptCpfCnpj(encrypted, salt)).toThrow();
    });
  });

  describe('createRecipient - with CPF/CNPJ', () => {
    it('should encrypt and hash CPF/CNPJ when creating recipient', async () => {
      const result = await service.createRecipient({
        email: 'test@example.com',
        cpfCnpj: '12345678901',
      }, 'company-1');

      const recipient = await prisma.recipient.findUnique({ where: { id: result } });
      expect(recipient.cpfCnpjEnc).toBeDefined();
      expect(recipient.cpfCnpjSalt).toBeDefined();
      expect(recipient.cpfCnpjHash).toBeDefined();
    });
  });
});
```

#### Dependências / Riscos
- Dependências: jest, @nestjs/testing
- Riscos: Baixo - apenas testes, não afeta produção

---

### [PR18-TASK-8.1-02] Documentar estratégia de migração de dados criptografados

**Origem:** PR #18 (TASK 8.1)
**Severidade:** MODERATE
**Urgência:** 2/5
**Status:** 🔴 Pendente
**Responsável:** Backend/DevOps

#### Contexto
PR #18 substitui algoritmo de criptografia (de `crypto.createCipher` deprecated para AES-256-CBC+PBKDF2). Se existirem dados já criptografados em produção com algoritmo antigo, será necessário re-encriptar.

#### O que precisa ser feito
- [ ] Verificar se existem dados criptografados em produção
- [ ] Se sim, criar script de migração para re-encriptar
- [ ] Documentar procedimento em runbook
- [ ] Adicionar rollback plan
- [ ] Testar em staging antes de produção
- [ ] Definir janela de manutenção se necessário

#### Detalhes Técnicos

**Verificação:**
```sql
-- Verificar se há dados criptografados
SELECT COUNT(*) FROM recipients WHERE cpf_cnpj_enc IS NOT NULL;
```

**Script de migração (se necessário):**
```typescript
// scripts/migrate-encryption.ts
async function migrateEncryption() {
  const recipients = await prisma.recipient.findMany({
    where: { cpfCnpjEnc: { not: null } },
  });

  for (const recipient of recipients) {
    try {
      // 1. Decrypt with old algorithm (if possible)
      const decrypted = decryptOldAlgorithm(recipient.cpfCnpjEnc);

      // 2. Re-encrypt with new algorithm
      const { encrypted, salt } = encryptCpfCnpj(decrypted, process.env.ENCRYPTION_KEY);

      // 3. Update database
      await prisma.recipient.update({
        where: { id: recipient.id },
        data: {
          cpfCnpjEnc: encrypted,
          cpfCnpjSalt: salt,
        },
      });
    } catch (error) {
      console.error(`Failed to migrate recipient ${recipient.id}:`, error);
    }
  }
}
```

**Documentar em:** `docs/runbooks/encryption-migration.md`

#### Dependências / Riscos
- Dependências: Acesso a dados de produção, janela de manutenção
- Riscos: Alto se não executado corretamente - perda de dados

---

### [PR18-TASK-8.1-03] Melhorar validação de ENCRYPTION_KEY para detectar chaves fracas

**Origem:** PR #18 (TASK 8.1)
**Severidade:** MODERATE
**Urgência:** 3/5
**Status:** 🔴 Pendente
**Responsável:** Backend/Segurança

#### Contexto
A validação atual apenas verifica comprimento (>= 32 caracteres). Chaves como "00000000000000000000000000000000" ou "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" passariam na validação mas são fracas.

#### O que precisa ser feito
- [ ] Adicionar blacklist de padrões fracos
- [ ] Verificar entropia mínima da chave
- [ ] Rejeitar chaves com caracteres repetidos
- [ ] Adicionar sugestão de comando para gerar chave forte
- [ ] Documentar requisitos de segurança da chave
- [ ] Testes para validação

#### Detalhes Técnicos

**Arquivo:** `apps/api/src/main.ts` ou criar `apps/api/src/utils/key-validation.ts`

```typescript
function validateEncryptionKey(key: string): { valid: boolean; error?: string } {
  // 1. Length check
  if (key.length < 32) {
    return { valid: false, error: 'ENCRYPTION_KEY must be at least 32 characters' };
  }

  // 2. Blacklist weak patterns
  const weakPatterns = [
    /^(.)\1+$/,                    // All same character (e.g., "aaaa...")
    /^0+$/,                        // All zeros
    /^(0123456789abcdef)+$/,       // Sequential hex
    /changeme|example|test|demo/i, // Common placeholder words
  ];

  for (const pattern of weakPatterns) {
    if (pattern.test(key)) {
      return { valid: false, error: 'ENCRYPTION_KEY appears to be weak or a placeholder' };
    }
  }

  // 3. Entropy check (simplified)
  const uniqueChars = new Set(key).size;
  if (uniqueChars < 10) {
    return {
      valid: false,
      error: 'ENCRYPTION_KEY has insufficient entropy (too few unique characters)'
    };
  }

  return { valid: true };
}

// In main.ts
const validation = validateEncryptionKey(process.env.ENCRYPTION_KEY);
if (!validation.valid) {
  logger.error(`❌ ${validation.error}`);
  logger.error('Generate a strong key with: openssl rand -base64 32');
  process.exit(1);
}
```

**Testes:**
```typescript
describe('validateEncryptionKey', () => {
  it('should reject all-same-character keys', () => {
    expect(validateEncryptionKey('a'.repeat(32)).valid).toBe(false);
  });

  it('should reject sequential patterns', () => {
    expect(validateEncryptionKey('0123456789abcdef0123456789abcdef').valid).toBe(false);
  });

  it('should reject placeholder words', () => {
    expect(validateEncryptionKey('changeme12345678901234567890').valid).toBe(false);
  });

  it('should accept strong random key', () => {
    const strongKey = 'x7K9mP2vN8qR4tY6wE3sA5dF1gH0jL9z';
    expect(validateEncryptionKey(strongKey).valid).toBe(true);
  });
});
```

#### Dependências / Riscos
- Dependências: Nenhuma
- Riscos: Baixo - apenas validação, não afeta dados existentes

---

### [PR18-TASK-8.1-04] Adicionar testes de integração E2E para fluxo de criptografia

**Origem:** PR #18 (TASK 8.1)
**Severidade:** MODERATE
**Urgência:** 3/5
**Status:** 🔴 Pendente
**Responsável:** Backend

#### Contexto
Testes unitários validam funções isoladas, mas falta teste E2E validando o fluxo completo: API recebe CPF/CNPJ → Encripta → Armazena → Recupera → Decripta.

#### O que precisa ser feito
- [ ] Criar `apps/api/test/recipient-encryption.e2e-spec.ts`
- [ ] Testar criação de recipient com CPF/CNPJ
- [ ] Verificar que dados são encriptados no banco
- [ ] Testar recuperação e descriptografia
- [ ] Testar busca por hash funciona corretamente
- [ ] Validar que salt é único por registro

#### Detalhes Técnicos

**Arquivo:** `apps/api/test/recipient-encryption.e2e-spec.ts`

```typescript
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { decryptCpfCnpj, hashCpfCnpjSha256 } from '@email-gateway/shared';

describe('Recipient Encryption (E2E)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = module.createNestApplication();
    prisma = app.get<PrismaService>(PrismaService);
    await app.init();
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await app.close();
  });

  beforeEach(async () => {
    await prisma.recipient.deleteMany();
  });

  it('should encrypt CPF/CNPJ when creating recipient via API', async () => {
    const cpf = '12345678901';

    // 1. Create email with recipient CPF/CNPJ
    const response = await request(app.getHttpServer())
      .post('/v1/email/send')
      .set('x-api-key', 'test-key')
      .send({
        to: 'test@example.com',
        subject: 'Test',
        html: '<p>Test</p>',
        recipient: { cpfCnpj: cpf },
      })
      .expect(201);

    // 2. Verify data is encrypted in database
    const recipient = await prisma.recipient.findFirst({
      where: { email: 'test@example.com' },
    });

    expect(recipient.cpfCnpjEnc).toBeDefined();
    expect(recipient.cpfCnpjSalt).toBeDefined();
    expect(recipient.cpfCnpjHash).toBeDefined();

    // 3. Verify encrypted value is not plaintext
    expect(recipient.cpfCnpjEnc).not.toBe(cpf);

    // 4. Verify hash matches
    const expectedHash = hashCpfCnpjSha256(cpf);
    expect(recipient.cpfCnpjHash).toBe(expectedHash);

    // 5. Verify decryption works
    const decrypted = decryptCpfCnpj(
      recipient.cpfCnpjEnc,
      process.env.ENCRYPTION_KEY,
      recipient.cpfCnpjSalt
    );
    expect(decrypted).toBe(cpf);
  });

  it('should use unique salt for each recipient', async () => {
    const cpf = '12345678901';

    // Create two recipients with same CPF
    await request(app.getHttpServer())
      .post('/v1/email/send')
      .set('x-api-key', 'test-key')
      .send({
        to: 'user1@example.com',
        subject: 'Test',
        html: '<p>Test</p>',
        recipient: { cpfCnpj: cpf },
      });

    await request(app.getHttpServer())
      .post('/v1/email/send')
      .set('x-api-key', 'test-key')
      .send({
        to: 'user2@example.com',
        subject: 'Test',
        html: '<p>Test</p>',
        recipient: { cpfCnpj: cpf },
      });

    // Verify different salts
    const recipients = await prisma.recipient.findMany();
    expect(recipients[0].cpfCnpjSalt).not.toBe(recipients[1].cpfCnpjSalt);
    expect(recipients[0].cpfCnpjEnc).not.toBe(recipients[1].cpfCnpjEnc);

    // But same hash (for searching)
    expect(recipients[0].cpfCnpjHash).toBe(recipients[1].cpfCnpjHash);
  });

  it('should be able to search by CPF hash', async () => {
    const cpf = '12345678901';

    await request(app.getHttpServer())
      .post('/v1/email/send')
      .set('x-api-key', 'test-key')
      .send({
        to: 'test@example.com',
        subject: 'Test',
        html: '<p>Test</p>',
        recipient: { cpfCnpj: cpf },
      });

    // Search by hash
    const hash = hashCpfCnpjSha256(cpf);
    const found = await prisma.recipient.findFirst({
      where: { cpfCnpjHash: hash },
    });

    expect(found).toBeDefined();
    expect(found.email).toBe('test@example.com');
  });
});
```

#### Dependências / Riscos
- Dependências: supertest, jest, test database
- Riscos: Baixo - apenas testes

---

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

**Total de Itens:** 19
**Pendentes:** 19
**Em Progresso:** 0
**Concluídos:** 0

**Por Severidade:**
- CRITICAL: 1
- MODERATE: 14
- SUGGESTION: 4

**Por Urgência:**
- Urgência 1: 0
- Urgência 2: 4
- Urgência 3: 9
- Urgência 4: 3
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
