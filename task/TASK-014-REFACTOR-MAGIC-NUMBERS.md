# TASK-014 — Refatorar Magic Numbers (Refatoração)

## Contexto
- Origem: PR-BACKLOG (PR8-TASK-3.2)
- Resumo: Schema `email-job.schema.ts` contém diversos magic numbers. Iniciamos refatoração criando `EMAIL_JOB_VALIDATION`, mas refatoração completa ficou fora de escopo

## O que precisa ser feito
- [ ] Substituir todos números literais em `email-job.schema.ts` por constantes
- [ ] Revisar `email-send.schema.ts` para identificar magic numbers
- [ ] Garantir mensagens de erro usam template strings com constantes
- [ ] Atualizar testes para usar constantes
- [ ] Validar sem regressões

## Urgência
- **Nível (1–5):** 4 (NICE TO HAVE - Manutenibilidade)

## Responsável sugerido
- Backend

## Dependências / Riscos
- Dependências: Nenhuma
- Riscos:
  - Baixo: Refatoração interna sem mudança de comportamento
  - Testes existentes devem passar sem alterações

## Detalhes Técnicos

**Atualizar:** `packages/shared/src/schemas/email-job.schema.ts`

```typescript
// Constantes de validação (já existe parcialmente)
export const EMAIL_JOB_VALIDATION = {
  // Subject
  SUBJECT_MAX_LENGTH: 200,
  SUBJECT_MIN_LENGTH: 1,

  // Email addresses
  EMAIL_MAX_LENGTH: 254, // RFC 5321

  // Recipients
  MAX_TO_RECIPIENTS: 50,
  MAX_CC_RECIPIENTS: 20,
  MAX_BCC_RECIPIENTS: 20,

  // Body
  HTML_MAX_LENGTH: 500000, // 500 KB
  TEXT_MAX_LENGTH: 500000,

  // Attachments
  MAX_ATTACHMENTS: 10,
  MAX_ATTACHMENT_SIZE: 10485760, // 10 MB
  ATTACHMENT_FILENAME_MAX_LENGTH: 255,

  // Headers
  MAX_CUSTOM_HEADERS: 50,
  HEADER_NAME_MAX_LENGTH: 100,
  HEADER_VALUE_MAX_LENGTH: 1000,

  // Tags
  MAX_TAGS: 50,
  TAG_NAME_MAX_LENGTH: 128,
  TAG_VALUE_MAX_LENGTH: 256,

  // External ID
  EXTERNAL_ID_MAX_LENGTH: 255,

  // Request ID
  REQUEST_ID_MAX_LENGTH: 128,

  // Recipient CPF/CNPJ
  CPF_LENGTH: 11,
  CNPJ_LENGTH: 14,
} as const;

// Schema usando constantes
export class EmailJobSchema {
  @IsString()
  @MinLength(EMAIL_JOB_VALIDATION.SUBJECT_MIN_LENGTH, {
    message: `Subject must be at least ${EMAIL_JOB_VALIDATION.SUBJECT_MIN_LENGTH} character`,
  })
  @MaxLength(EMAIL_JOB_VALIDATION.SUBJECT_MAX_LENGTH, {
    message: `Subject must be at most ${EMAIL_JOB_VALIDATION.SUBJECT_MAX_LENGTH} characters`,
  })
  subject: string;

  @IsEmail({}, {
    message: 'Invalid recipient email format',
  })
  @MaxLength(EMAIL_JOB_VALIDATION.EMAIL_MAX_LENGTH, {
    message: `Email address too long (max ${EMAIL_JOB_VALIDATION.EMAIL_MAX_LENGTH} chars per RFC 5321)`,
  })
  to: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(EMAIL_JOB_VALIDATION.MAX_CC_RECIPIENTS, {
    message: `Maximum ${EMAIL_JOB_VALIDATION.MAX_CC_RECIPIENTS} CC recipients allowed`,
  })
  @IsEmail({}, { each: true })
  cc?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(EMAIL_JOB_VALIDATION.MAX_BCC_RECIPIENTS, {
    message: `Maximum ${EMAIL_JOB_VALIDATION.MAX_BCC_RECIPIENTS} BCC recipients allowed`,
  })
  @IsEmail({}, { each: true })
  bcc?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(EMAIL_JOB_VALIDATION.HTML_MAX_LENGTH, {
    message: `HTML body too large (max ${EMAIL_JOB_VALIDATION.HTML_MAX_LENGTH} characters)`,
  })
  html?: string;

  @IsOptional()
  @IsString()
  @MaxLength(EMAIL_JOB_VALIDATION.TEXT_MAX_LENGTH, {
    message: `Text body too large (max ${EMAIL_JOB_VALIDATION.TEXT_MAX_LENGTH} characters)`,
  })
  text?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(EMAIL_JOB_VALIDATION.MAX_ATTACHMENTS, {
    message: `Maximum ${EMAIL_JOB_VALIDATION.MAX_ATTACHMENTS} attachments allowed`,
  })
  @ValidateNested({ each: true })
  @Type(() => AttachmentSchema)
  attachments?: AttachmentSchema[];

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => CustomHeadersSchema)
  headers?: CustomHeadersSchema;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(EMAIL_JOB_VALIDATION.MAX_TAGS, {
    message: `Maximum ${EMAIL_JOB_VALIDATION.MAX_TAGS} tags allowed`,
  })
  @ValidateNested({ each: true })
  @Type(() => TagSchema)
  tags?: TagSchema[];
}

export class AttachmentSchema {
  @IsString()
  @MaxLength(EMAIL_JOB_VALIDATION.ATTACHMENT_FILENAME_MAX_LENGTH, {
    message: `Attachment filename too long (max ${EMAIL_JOB_VALIDATION.ATTACHMENT_FILENAME_MAX_LENGTH} characters)`,
  })
  filename: string;

  @IsString()
  content: string; // Base64 encoded

  @IsString()
  mimeType: string;

  // Validar tamanho após decode base64
  @ValidateBy({
    name: 'maxAttachmentSize',
    validator: {
      validate: (value: string) => {
        const sizeBytes = Buffer.from(value, 'base64').length;
        return sizeBytes <= EMAIL_JOB_VALIDATION.MAX_ATTACHMENT_SIZE;
      },
      defaultMessage: () =>
        `Attachment too large (max ${EMAIL_JOB_VALIDATION.MAX_ATTACHMENT_SIZE / 1048576} MB)`,
    },
  })
  content: string;
}

export class TagSchema {
  @IsString()
  @MaxLength(EMAIL_JOB_VALIDATION.TAG_NAME_MAX_LENGTH, {
    message: `Tag name too long (max ${EMAIL_JOB_VALIDATION.TAG_NAME_MAX_LENGTH} characters)`,
  })
  name: string;

  @IsString()
  @MaxLength(EMAIL_JOB_VALIDATION.TAG_VALUE_MAX_LENGTH, {
    message: `Tag value too long (max ${EMAIL_JOB_VALIDATION.TAG_VALUE_MAX_LENGTH} characters)`,
  })
  value: string;
}
```

**Atualizar testes para usar constantes:**

```typescript
import { EMAIL_JOB_VALIDATION } from '../email-job.schema';

describe('EmailJobSchema Validation', () => {
  it('should reject subject longer than max length', () => {
    const longSubject = 'a'.repeat(EMAIL_JOB_VALIDATION.SUBJECT_MAX_LENGTH + 1);

    expect(() => validate({ subject: longSubject })).toThrow(
      `Subject must be at most ${EMAIL_JOB_VALIDATION.SUBJECT_MAX_LENGTH} characters`
    );
  });

  it('should accept subject at max length', () => {
    const maxSubject = 'a'.repeat(EMAIL_JOB_VALIDATION.SUBJECT_MAX_LENGTH);

    expect(() => validate({ subject: maxSubject })).not.toThrow();
  });

  it('should reject too many CC recipients', () => {
    const ccList = Array(EMAIL_JOB_VALIDATION.MAX_CC_RECIPIENTS + 1)
      .fill('user@example.com');

    expect(() => validate({ cc: ccList })).toThrow(
      `Maximum ${EMAIL_JOB_VALIDATION.MAX_CC_RECIPIENTS} CC recipients allowed`
    );
  });

  it('should reject attachment larger than limit', () => {
    // Criar attachment de 11 MB (acima do limite de 10 MB)
    const largeContent = 'a'.repeat(
      (EMAIL_JOB_VALIDATION.MAX_ATTACHMENT_SIZE / 0.75) + 1000 // Base64 é ~33% maior
    );

    expect(() => validate({
      attachments: [{
        filename: 'large.pdf',
        content: Buffer.from(largeContent).toString('base64'),
        mimeType: 'application/pdf',
      }],
    })).toThrow(
      `Attachment too large (max ${EMAIL_JOB_VALIDATION.MAX_ATTACHMENT_SIZE / 1048576} MB)`
    );
  });
});
```

**Exportar constantes para uso em outros módulos:**

```typescript
// packages/shared/src/index.ts
export { EMAIL_JOB_VALIDATION } from './schemas/email-job.schema';
export { EMAIL_SEND_VALIDATION } from './schemas/email-send.schema';
```

**Benefícios da refatoração:**

1. **Manutenibilidade:** Alterar limite em um lugar apenas
2. **Legibilidade:** Nome descritivo ao invés de número mágico
3. **Consistência:** Mesmos limites usados em validação e testes
4. **Documentação:** Constantes servem como documentação
5. **Type Safety:** TypeScript valida uso das constantes

## Categoria
**Refatoração - Manutenibilidade**

## Bloqueador para Produção?
**NÃO** - Melhoria de qualidade de código. Sistema funciona sem esta refatoração.
