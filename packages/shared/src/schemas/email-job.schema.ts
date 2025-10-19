/**
 * @email-gateway/shared - Email Job Schema
 *
 * Schemas Zod para validação do contrato do Job `email:send`
 *
 * TASK 3.1 — Contrato do Job `email:send`
 */

import { z } from 'zod';
import { EMAIL_JOB_CONFIG, EMAIL_JOB_VALIDATION } from './email-job.types';

// TODO: [TASK 3.2] Complete magic number refactoring - replace all remaining hardcoded
// validation limits with EMAIL_JOB_VALIDATION constants throughout this file

/**
 * Schema de validação para informações do destinatário no job
 */
export const emailJobRecipientSchema = z.object({
  recipientId: z
    .string()
    .uuid('recipientId deve ser um UUID válido')
    .optional()
    .describe('UUID do destinatário no banco'),

  externalId: z
    .string()
    .min(1, 'externalId não pode ser vazio')
    .max(64, 'externalId deve ter no máximo 64 caracteres')
    .optional()
    .describe('ID externo do destinatário no sistema do parceiro'),

  cpfCnpjHash: z
    .string()
    .length(64, 'cpfCnpjHash deve ser SHA-256 (64 chars hex)')
    .regex(/^[a-f0-9]{64}$/, 'cpfCnpjHash deve ser um hash SHA-256 válido')
    .optional()
    .describe('Hash SHA-256 do CPF/CNPJ normalizado'),

  razaoSocial: z
    .string()
    .min(1)
    .max(150, 'razaoSocial deve ter no máximo 150 caracteres')
    .optional()
    .describe('Razão social (pessoa jurídica)'),

  nome: z
    .string()
    .min(1)
    .max(120, 'nome deve ter no máximo 120 caracteres')
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
      .uuid('outboxId deve ser um UUID válido')
      .describe('UUID do registro em email_outbox (igual ao jobId)'),

    companyId: z
      .string()
      .uuid('companyId deve ser um UUID válido')
      .describe('UUID da empresa (tenant)'),

    requestId: z
      .string()
      .min(1, 'requestId não pode ser vazio')
      .max(128, 'requestId deve ter no máximo 128 caracteres')
      .describe('ID da requisição original para correlação'),

    to: z
      .string()
      .email('Endereço de email "to" deve ser válido')
      .max(254, 'Email deve ter no máximo 254 caracteres')
      .describe('Destinatário principal'),

    cc: z
      .array(
        z
          .string()
          .email('Endereços em "cc" devem ser válidos')
          .max(254),
      )
      .max(5, 'Máximo 5 destinatários em CC')
      .optional()
      .describe('Destinatários em cópia'),

    bcc: z
      .array(
        z
          .string()
          .email('Endereços em "bcc" devem ser válidos')
          .max(254),
      )
      .max(5, 'Máximo 5 destinatários em BCC')
      .optional()
      .describe('Destinatários em cópia oculta'),

    subject: z
      .string()
      .min(1, 'Subject não pode ser vazio')
      .max(150, 'Subject deve ter no máximo 150 caracteres')
      .refine((val) => !val.includes('\n'), {
        message: 'Subject não pode conter quebras de linha',
      })
      .describe('Assunto do email'),

    htmlRef: z
      .string()
      .min(1, 'htmlRef não pode ser vazio')
      .max(512, 'htmlRef deve ter no máximo 512 caracteres')
      .describe('Referência ao HTML armazenado. Formatos aceitos: UUID (para DB), path S3, ou identificador customizado'),

    replyTo: z
      .string()
      .email('replyTo deve ser um email válido')
      .max(254)
      .optional()
      .describe('Endereço de resposta'),

    headers: z
      .record(z.string(), z.string())
      .optional()
      .describe('Headers customizados (safe-listed)'),

    tags: z
      .array(z.string().min(1).max(50))
      .max(5, 'Máximo 5 tags')
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
      .uuid('jobId deve ser um UUID válido (igual ao outboxId)')
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
      .max(128)
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
      .max(64)
      .optional()
      .describe('Código do erro (se falhou)'),

    errorReason: z
      .string()
      .max(500, 'errorReason deve ter no máximo 500 caracteres')
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
