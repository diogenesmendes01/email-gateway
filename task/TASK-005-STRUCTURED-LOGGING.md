# TASK-005 — Substituir console.log por Structured Logging

## Contexto
- Origem: Análise completa do código
- Resumo: Alguns arquivos usam `console.log` e `console.error` ao invés do Logger do NestJS, prejudicando correlação de logs, filtragem e observabilidade

## O que precisa ser feito
- [ ] Identificar todos os `console.log` e `console.error` no código
- [ ] Substituir por `Logger` do NestJS nos services
- [ ] Adicionar contexto estruturado (requestId, companyId, etc.)
- [ ] Garantir que nenhum PII é logado (não logar CPF/CNPJ, emails completos, etc.)
- [ ] Padronizar formato de mensagens
- [ ] Atualizar testes se necessário
- [ ] Documentar padrões de logging

## Urgência
- **Nível (1–5):** 3 (MODERADO - Observabilidade)

## Responsável sugerido
- Backend

## Dependências / Riscos
- Dependências: NestJS Logger (já disponível)
- Riscos:
  - Baixo: Melhoria de qualidade
  - Atenção: Não logar dados sensíveis

## Detalhes Técnicos

**Locais encontrados com console.log/error:**

```typescript
// apps/api/src/modules/email/services/email-send.service.ts:99
console.log(`📧 Email enqueued for processing: ${jobId}`);

// apps/api/src/modules/email/services/email-send.service.ts:343
console.error('Error decrypting CPF/CNPJ:', error);
```

**Padrão de substituição:**

```typescript
// ANTES
console.log(`📧 Email enqueued for processing: ${jobId}`);

// DEPOIS
import { Logger } from '@nestjs/common';

@Injectable()
export class EmailSendService {
  private readonly logger = new Logger(EmailSendService.name);

  // ...

  this.logger.log({
    message: 'Email enqueued for processing',
    jobId,
    outboxId,
    companyId,
    recipientId,
    requestId,
    status: EmailStatus.ENQUEUED,
  });
}
```

```typescript
// ANTES
console.error('Error decrypting CPF/CNPJ:', error);
throw new Error('Failed to decrypt sensitive data');

// DEPOIS
this.logger.error({
  message: 'Failed to decrypt CPF/CNPJ',
  error: error.message,
  stack: error.stack,
  // IMPORTANTE: NÃO logar dados sensíveis
  // Nunca: encryptedCpfCnpj, salt, key
});

throw new InternalServerErrorException({
  code: 'DECRYPTION_FAILED',
  message: 'Unable to decrypt sensitive data',
});
```

**Padrões de logging:**

```typescript
// 1. INFO - Operações normais
this.logger.log({
  message: 'Action completed successfully',
  action: 'create_email',
  entityId: '123',
  companyId: 'abc',
  duration: 150, // ms
});

// 2. WARN - Situações anormais mas recuperáveis
this.logger.warn({
  message: 'Retry scheduled due to throttling',
  attempt: 3,
  maxAttempts: 5,
  retryAfter: 60,
});

// 3. ERROR - Falhas que impedem operação
this.logger.error({
  message: 'Operation failed',
  error: error.message,
  stack: error.stack,
  context: { companyId, jobId },
});

// 4. DEBUG - Informações detalhadas para troubleshooting
this.logger.debug({
  message: 'Processing request',
  payload: sanitizedPayload, // NUNCA logar payload completo em produção
});
```

**Dados que NUNCA devem ser logados:**

```typescript
// ❌ NÃO LOGAR:
- Senhas
- Tokens de autenticação
- CPF/CNPJ não criptografado
- Emails completos (usar masking: u***@example.com)
- Chaves de criptografia
- Dados de cartão de crédito
- API keys

// ✅ PODE LOGAR:
- IDs (companyId, userId, jobId, etc.)
- Request IDs
- Timestamps
- Status codes
- Durations
- Error messages (sem dados sensíveis)
- Hashes (cpfCnpjHash)
```

**Script para encontrar console.log:**

```bash
# Encontrar todos os console.log/error
grep -r "console\." apps/api/src --include="*.ts" -n

# Ou usar ferramenta de linting
npx eslint apps/api/src --rule 'no-console: error'
```

**Configuração ESLint (adicionar ao .eslintrc):**

```json
{
  "rules": {
    "no-console": ["error", {
      "allow": []
    }]
  }
}
```

**Testes:**

Garantir que testes mockam o logger:

```typescript
describe('EmailSendService', () => {
  let service: EmailSendService;
  let logger: Logger;

  beforeEach(() => {
    logger = new Logger();
    jest.spyOn(logger, 'log').mockImplementation();
    jest.spyOn(logger, 'error').mockImplementation();

    service = new EmailSendService(prisma, logger);
  });

  it('should log email enqueued', async () => {
    await service.sendEmail(...);

    expect(logger.log).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Email enqueued for processing',
      })
    );
  });
});
```

## Bloqueador para Produção?
**NÃO** - Melhoria de qualidade, mas não bloqueia deploy. Sistema funciona, apenas com logs menos estruturados. Recomendado implementar para melhor observabilidade em produção.
