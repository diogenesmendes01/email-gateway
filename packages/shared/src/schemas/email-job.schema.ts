/**
 * @email-gateway/shared - Email Job Schema
 *
 * Schemas Zod para validação do contrato do Job `email:send`
 *
 * TASK 3.1 — Contrato do Job `email:send`
 */

import { z } from 'zod';
import { EMAIL_JOB_CONFIG, EMAIL_JOB_VALIDATION } from './email-job.types';

/**
 * Schema de validação para informações do destinatário no job
 */
export const emailJobRecipientSchema = z.object({
  recipientId: z
    .string()
    .cuid('recipientId deve ser um CUID válido')
    .optional()
    .describe('CUID do destinatário no banco'),

  externalId: z
    .string()
    .min(1, 'externalId não pode ser vazio')
    .max(
      EMAIL_JOB_VALIDATION.MAX_EXTERNAL_ID_LENGTH,
      `externalId deve ter no máximo ${EMAIL_JOB_VALIDATION.MAX_EXTERNAL_ID_LENGTH} caracteres`,
    )
    .optional()
    .describe('ID externo do destinatário no sistema do parceiro'),

  cpfCnpjHash: z
    .string()
    .length(
      EMAIL_JOB_VALIDATION.SHA256_HEX_LENGTH,
      `cpfCnpjHash deve ser SHA-256 (${EMAIL_JOB_VALIDATION.SHA256_HEX_LENGTH} chars hex)`,
    )
    .regex(/^[a-f0-9]{64}$/, 'cpfCnpjHash deve ser um hash SHA-256 válido')
    .optional()
    .describe('Hash SHA-256 do CPF/CNPJ normalizado'),

  razaoSocial: z
    .string()
    .min(1)
    .max(
      EMAIL_JOB_VALIDATION.MAX_RAZAO_SOCIAL_LENGTH,
      `razaoSocial deve ter no máximo ${EMAIL_JOB_VALIDATION.MAX_RAZAO_SOCIAL_LENGTH} caracteres`,
    )
    .optional()
    .describe('Razão social (pessoa jurídica)'),

  nome: z
    .string()
    .min(1)
    .max(
      EMAIL_JOB_VALIDATION.MAX_NAME_LENGTH,
      `nome deve ter no máximo ${EMAIL_JOB_VALIDATION.MAX_NAME_LENGTH} caracteres`,
    )
    .optional()
    .describe('Nome (pessoa física)'),

  email: z
    .string()
    .email('Email do destinatário deve ser válido')
    .max(
      EMAIL_JOB_VALIDATION.MAX_EMAIL_LENGTH,
      `Email deve ter no máximo ${EMAIL_JOB_VALIDATION.MAX_EMAIL_LENGTH} caracteres`,
    )
    .describe('Endereço de email do destinatário'),
});

/**
 * Schema de validação para dados do job email:send
 */
export const emailSendJobDataSchema = z
  .object({
    outboxId: z
      .string()
      .cuid('outboxId deve ser um CUID válido')
      .describe('CUID do registro em email_outbox (igual ao jobId)'),

    companyId: z
      .string()
      .min(1, 'companyId não pode ser vazio')
      .describe('ID da empresa (tenant)'),

    requestId: z
      .string()
      .min(1, 'requestId não pode ser vazio')
      .max(
        EMAIL_JOB_VALIDATION.MAX_REQUEST_ID_LENGTH,
        `requestId deve ter no máximo ${EMAIL_JOB_VALIDATION.MAX_REQUEST_ID_LENGTH} caracteres`,
      )
      .describe('ID da requisição original para correlação'),

    to: z
      .string()
      .email('Endereço de email "to" deve ser válido')
      .max(
        EMAIL_JOB_VALIDATION.MAX_EMAIL_LENGTH,
        `Email deve ter no máximo ${EMAIL_JOB_VALIDATION.MAX_EMAIL_LENGTH} caracteres`,
      )
      .describe('Destinatário principal'),

    cc: z
      .array(
        z
          .string()
          .email('Endereços em "cc" devem ser válidos')
          .max(EMAIL_JOB_VALIDATION.MAX_EMAIL_LENGTH),
      )
      .max(
        EMAIL_JOB_VALIDATION.MAX_CC_BCC_RECIPIENTS,
        `Máximo ${EMAIL_JOB_VALIDATION.MAX_CC_BCC_RECIPIENTS} destinatários em CC`,
      )
      .optional()
      .describe('Destinatários em cópia'),

    bcc: z
      .array(
        z
          .string()
          .email('Endereços em "bcc" devem ser válidos')
          .max(EMAIL_JOB_VALIDATION.MAX_EMAIL_LENGTH),
      )
      .max(
        EMAIL_JOB_VALIDATION.MAX_CC_BCC_RECIPIENTS,
        `Máximo ${EMAIL_JOB_VALIDATION.MAX_CC_BCC_RECIPIENTS} destinatários em BCC`,
      )
      .optional()
      .describe('Destinatários em cópia oculta'),

    subject: z
      .string()
      .min(1, 'Subject não pode ser vazio')
      .max(
        EMAIL_JOB_VALIDATION.MAX_SUBJECT_LENGTH,
        `Subject deve ter no máximo ${EMAIL_JOB_VALIDATION.MAX_SUBJECT_LENGTH} caracteres`,
      )
      .refine((val) => !val.includes('\n'), {
        message: 'Subject não pode conter quebras de linha',
      })
      .describe('Assunto do email'),

    htmlRef: z
      .string()
      .min(1, 'htmlRef não pode ser vazio')
      .max(
        EMAIL_JOB_VALIDATION.MAX_HTML_REF_LENGTH,
        `htmlRef deve ter no máximo ${EMAIL_JOB_VALIDATION.MAX_HTML_REF_LENGTH} caracteres`,
      )
      .describe('Referência ao HTML armazenado. Formatos aceitos: UUID (para DB), path S3, ou identificador customizado'),

    replyTo: z
      .string()
      .email('replyTo deve ser um email válido')
      .max(EMAIL_JOB_VALIDATION.MAX_EMAIL_LENGTH)
      .optional()
      .describe('Endereço de resposta'),

    headers: z
      .record(z.string(), z.string())
      .optional()
      .describe('Headers customizados (safe-listed)'),

    tags: z
      .array(
        z
          .string()
          .min(1)
          .max(EMAIL_JOB_VALIDATION.MAX_TAG_LENGTH),
      )
      .max(
        EMAIL_JOB_VALIDATION.MAX_TAGS,
        `Máximo ${EMAIL_JOB_VALIDATION.MAX_TAGS} tags`,
      )
      .optional()
      .describe('Tags para categorização'),

    recipient: emailJobRecipientSchema.describe(
      'Informações do destinatário',
    ),

    attempt: z
      .number()
      .int('attempt deve ser um inteiro')
      .min(1, 'attempt deve ser >= 1')
      .max(
        EMAIL_JOB_CONFIG.MAX_ATTEMPTS,
        `attempt deve ser <= ${EMAIL_JOB_CONFIG.MAX_ATTEMPTS}`,
      )
      .describe('Contador de tentativas'),

    enqueuedAt: z
      .string()
      .datetime('enqueuedAt deve ser ISO 8601')
      .describe('Timestamp de enfileiramento'),
  })
  .strict()
  .describe('Payload do Job email:send');

/**
 * Schema de validação para opções do job
 */
export const emailSendJobOptionsSchema = z
  .object({
    jobId: z
      .string()
      .cuid('jobId deve ser um CUID válido (igual ao outboxId)')
      .describe('Job ID = Outbox ID (idempotência)'),

    ttl: z
      .number()
      .int('TTL deve ser um inteiro')
      .positive('TTL deve ser positivo')
      .max(
        EMAIL_JOB_CONFIG.DEFAULT_TTL,
        `TTL não pode exceder 24h (${EMAIL_JOB_CONFIG.DEFAULT_TTL}ms)`,
      )
      .default(EMAIL_JOB_CONFIG.DEFAULT_TTL)
      .describe('TTL do job em milissegundos'),

    priority: z
      .number()
      .int('priority deve ser um inteiro')
      .min(
        EMAIL_JOB_VALIDATION.MIN_PRIORITY,
        `priority mínima = ${EMAIL_JOB_VALIDATION.MIN_PRIORITY}`,
      )
      .max(
        EMAIL_JOB_VALIDATION.MAX_PRIORITY,
        `priority máxima = ${EMAIL_JOB_VALIDATION.MAX_PRIORITY}`,
      )
      .default(EMAIL_JOB_CONFIG.DEFAULT_PRIORITY)
      .optional()
      .describe('Prioridade do job no BullMQ (valores menores = maior prioridade; 1=máxima, 10=mínima)'),

    delay: z
      .number()
      .int('delay deve ser um inteiro')
      .nonnegative('delay não pode ser negativo')
      .optional()
      .describe('Delay antes de processar (ms)'),

    removeOnComplete: z
      .boolean()
      .optional()
      .default(true)
      .describe('Remover job após completar'),

    removeOnFail: z
      .boolean()
      .optional()
      .default(false)
      .describe('Remover job após falha permanente'),
  })
  .strict()
  .describe('Opções de configuração do job');

/**
 * Schema de validação para resultado do job
 */
export const emailSendJobResultSchema = z
  .object({
    sesMessageId: z
      .string()
      .max(
        EMAIL_JOB_VALIDATION.MAX_SES_MESSAGE_ID_LENGTH,
        `sesMessageId deve ter no máximo ${EMAIL_JOB_VALIDATION.MAX_SES_MESSAGE_ID_LENGTH} caracteres`,
      )
      .optional()
      .describe('ID da mensagem no SES'),

    status: z
      .enum(['SENT', 'FAILED', 'RETRYING'])
      .describe('Status final do envio'),

    processedAt: z
      .string()
      .datetime('processedAt deve ser ISO 8601')
      .describe('Timestamp do processamento'),

    durationMs: z
      .number()
      .int('durationMs deve ser um inteiro')
      .nonnegative('durationMs não pode ser negativo')
      .describe('Duração do processamento'),

    errorCode: z
      .string()
      .max(
        EMAIL_JOB_VALIDATION.MAX_ERROR_CODE_LENGTH,
        `errorCode deve ter no máximo ${EMAIL_JOB_VALIDATION.MAX_ERROR_CODE_LENGTH} caracteres`,
      )
      .optional()
      .describe('Código do erro (se falhou)'),

    errorReason: z
      .string()
      .max(
        EMAIL_JOB_VALIDATION.MAX_ERROR_REASON_LENGTH,
        `errorReason deve ter no máximo ${EMAIL_JOB_VALIDATION.MAX_ERROR_REASON_LENGTH} caracteres`,
      )
      .optional()
      .describe('Mensagem de erro (se falhou)'),

    attempt: z
      .number()
      .int('attempt deve ser um inteiro')
      .min(1)
      .max(EMAIL_JOB_CONFIG.MAX_ATTEMPTS)
      .describe('Número da tentativa'),
  })
  .strict()
  .describe('Resultado do processamento');

/**
 * Valida os dados do job email:send com regras de negócio adicionais
 *
 * @param data - Dados do job a serem validados
 * @returns Dados validados e tipados
 * @throws {Error} Se a validação falhar
 *
 * Validações aplicadas:
 * 1. Schema básico via Zod (emailSendJobDataSchema)
 * 2. recipient.email deve coincidir com to
 * 3. Pelo menos um identificador do recipient deve estar presente
 *    (recipientId, externalId ou cpfCnpjHash)
 */
export const validateEmailJobData = (data: unknown) => {
  const parsed = emailSendJobDataSchema.parse(data);

  // Validação adicional: recipient.email deve coincidir com to
  // SECURITY: Sanitized error message to prevent PII exposure (Section 25.2)
  if (parsed.recipient.email !== parsed.to) {
    throw new Error(
      'recipient.email deve coincidir com to',
    );
  }

  // Validação: pelo menos um identificador do recipient deve estar presente
  if (
    !parsed.recipient.recipientId &&
    !parsed.recipient.externalId &&
    !parsed.recipient.cpfCnpjHash
  ) {
    throw new Error(
      'recipient deve ter ao menos um de: recipientId, externalId ou cpfCnpjHash',
    );
  }

  return parsed;
};

/**
 * Type inference helpers
 */
export type EmailJobRecipientInput = z.input<typeof emailJobRecipientSchema>;
export type EmailJobRecipient = z.output<typeof emailJobRecipientSchema>;

export type EmailSendJobDataInput = z.input<typeof emailSendJobDataSchema>;
export type EmailSendJobData = z.output<typeof emailSendJobDataSchema>;

export type EmailSendJobOptionsInput = z.input<
  typeof emailSendJobOptionsSchema
>;
export type EmailSendJobOptions = z.output<typeof emailSendJobOptionsSchema>;

export type EmailSendJobResultInput = z.input<typeof emailSendJobResultSchema>;
export type EmailSendJobResult = z.output<typeof emailSendJobResultSchema>;
