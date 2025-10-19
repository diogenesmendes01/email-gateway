/**
 * @email-gateway/shared - Email Job Retry Schema
 *
 * Schemas Zod para validação de retry, DLQ e fairness
 *
 * TASK 3.2 — Retry/backoff/DLQ e fairness por tenant
 */

import { z } from 'zod';
import {
  EMAIL_JOB_RETRY_CONFIG,
  EMAIL_JOB_FAIRNESS_CONFIG,
} from './email-job-retry.types';

/**
 * Schema para configuração de retry do job
 */
export const emailJobRetryConfigSchema = z
  .object({
    attempts: z
      .number()
      .int('attempts deve ser um inteiro')
      .min(1, 'attempts deve ser >= 1')
      .max(
        EMAIL_JOB_RETRY_CONFIG.MAX_ATTEMPTS,
        `attempts não pode exceder ${EMAIL_JOB_RETRY_CONFIG.MAX_ATTEMPTS}`,
      )
      .default(EMAIL_JOB_RETRY_CONFIG.MAX_ATTEMPTS)
      .describe('Número máximo de tentativas antes de mover para DLQ'),

    backoff: z
      .object({
        type: z.literal('exponential').describe('Tipo de backoff'),

        delay: z
          .number()
          .int('delay deve ser um inteiro')
          .min(
            EMAIL_JOB_RETRY_CONFIG.BASE_DELAY_MS,
            `delay mínimo é ${EMAIL_JOB_RETRY_CONFIG.BASE_DELAY_MS}ms`,
          )
          .default(EMAIL_JOB_RETRY_CONFIG.BASE_DELAY_MS)
          .describe('Delay base em milissegundos'),
      })
      .default({
        type: 'exponential',
        delay: EMAIL_JOB_RETRY_CONFIG.BASE_DELAY_MS,
      })
      .describe('Configuração de backoff exponencial'),

    removeOnComplete: z
      .union([z.boolean(), z.number().int().positive()])
      .default(true)
      .describe('Remove job após sucesso (true ou número de jobs a manter)'),

    removeOnFail: z
      .union([z.boolean(), z.number().int().positive()])
      .default(false)
      .describe('Remove job após falha permanente (false = move para DLQ)'),
  })
  .strict()
  .describe('Configuração de retry para BullMQ');

/**
 * Schema para entrada na Dead Letter Queue
 *
 * TASK 3.2: lastFailureReason é obrigatório
 */
export const emailJobDLQEntrySchema = z
  .object({
    jobId: z
      .string()
      .uuid('jobId deve ser UUID')
      .describe('ID do job (= outboxId)'),

    outboxId: z
      .string()
      .uuid('outboxId deve ser UUID')
      .describe('ID do registro em email_outbox'),

    companyId: z
      .string()
      .uuid('companyId deve ser UUID')
      .describe('ID da empresa (tenant)'),

    originalData: z
      .record(z.unknown())
      .describe('Payload original do job'),

    failedAttempts: z
      .number()
      .int('failedAttempts deve ser inteiro')
      .min(EMAIL_JOB_RETRY_CONFIG.MAX_ATTEMPTS)
      .describe('Número de tentativas falhadas'),

    lastFailureReason: z
      .string()
      .min(1, 'lastFailureReason é obrigatório')
      .max(500, 'lastFailureReason deve ter no máximo 500 caracteres')
      .refine(
        (val) => val.trim().length > 0,
        'lastFailureReason não pode ser apenas espaços em branco',
      )
      .describe(
        'OBRIGATÓRIO (TASK 3.2): Razão da última falha antes de mover para DLQ',
      ),

    lastFailureCode: z
      .string()
      .max(64, 'lastFailureCode deve ter no máximo 64 caracteres')
      .optional()
      .describe('Código do último erro (SMTP ou AWS SES)'),

    lastFailureTimestamp: z
      .string()
      .datetime('lastFailureTimestamp deve ser ISO 8601')
      .describe('Timestamp da última falha'),

    enqueuedAt: z
      .string()
      .datetime('enqueuedAt deve ser ISO 8601')
      .describe('Timestamp de enfileiramento original'),

    movedToDLQAt: z
      .string()
      .datetime('movedToDLQAt deve ser ISO 8601')
      .describe('Timestamp de movimentação para DLQ'),

    ttl: z
      .number()
      .int('ttl deve ser inteiro')
      .positive('ttl deve ser positivo')
      .default(EMAIL_JOB_RETRY_CONFIG.DLQ_TTL_MS)
      .describe('TTL na DLQ em milissegundos (7 dias)'),
  })
  .strict()
  .describe('Entrada na Dead Letter Queue');

/**
 * Schema para métricas de fairness por tenant
 */
export const tenantFairnessMetricsSchema = z
  .object({
    companyId: z
      .string()
      .uuid('companyId deve ser UUID')
      .describe('ID da empresa (tenant)'),

    lastProcessedAt: z
      .string()
      .datetime('lastProcessedAt deve ser ISO 8601')
      .optional()
      .describe('Timestamp do último job processado desta empresa'),

    roundsWithoutProcessing: z
      .number()
      .int('roundsWithoutProcessing deve ser inteiro')
      .nonnegative('roundsWithoutProcessing não pode ser negativo')
      .default(0)
      .describe('Número de rodadas sem processar jobs desta empresa'),

    currentPriority: z
      .number()
      .int('currentPriority deve ser inteiro')
      .min(
        EMAIL_JOB_FAIRNESS_CONFIG.MAX_ROUND_ROBIN_PRIORITY,
        `currentPriority mínima = ${EMAIL_JOB_FAIRNESS_CONFIG.MAX_ROUND_ROBIN_PRIORITY}`,
      )
      .max(10, 'currentPriority máxima = 10')
      .default(EMAIL_JOB_FAIRNESS_CONFIG.ROUND_ROBIN_BASE_PRIORITY)
      .describe('Prioridade atual calculada para round-robin'),

    totalProcessed: z
      .number()
      .int('totalProcessed deve ser inteiro')
      .nonnegative('totalProcessed não pode ser negativo')
      .default(0)
      .describe('Total de jobs processados desta empresa'),

    consecutiveBatchCount: z
      .number()
      .int('consecutiveBatchCount deve ser inteiro')
      .nonnegative('consecutiveBatchCount não pode ser negativo')
      .default(0)
      .describe('Jobs processados consecutivamente no batch atual'),
  })
  .strict()
  .describe('Métricas de fairness para round-robin por tenant');

/**
 * Schema para histórico de retry do job
 */
export const jobRetryHistorySchema = z
  .object({
    attempt: z
      .number()
      .int('attempt deve ser inteiro')
      .min(1, 'attempt deve ser >= 1')
      .describe('Número da tentativa'),

    failedAt: z
      .string()
      .datetime('failedAt deve ser ISO 8601')
      .describe('Timestamp da falha'),

    errorCode: z
      .string()
      .max(64, 'errorCode deve ter no máximo 64 caracteres')
      .optional()
      .describe('Código do erro'),

    errorReason: z
      .string()
      .max(500, 'errorReason deve ter no máximo 500 caracteres')
      .describe('Razão da falha'),

    delayUntilNextAttempt: z
      .number()
      .int('delayUntilNextAttempt deve ser inteiro')
      .nonnegative('delayUntilNextAttempt não pode ser negativo')
      .optional()
      .describe('Delay calculado até próxima tentativa (ms)'),

    isRetryable: z
      .boolean()
      .describe('Indica se o erro justifica retry'),
  })
  .strict()
  .describe('Entrada no histórico de retry do job');

/**
 * Validação de entrada na DLQ
 *
 * @param data - Dados da entrada na DLQ
 * @returns Dados validados
 * @throws {Error} Se validação falhar
 *
 * Validações:
 * 1. Schema básico via Zod (inclui lastFailureReason obrigatório - TASK 3.2)
 * 2. failedAttempts deve ser >= MAX_ATTEMPTS
 *
 * NOTA: Validação de lastFailureReason não-vazio já é feita pelo schema Zod (linha 98)
 */
export function validateDLQEntry(data: unknown) {
  const parsed = emailJobDLQEntrySchema.parse(data);

  // Valida que job falhou número suficiente de vezes
  // NOTA: Esta validação já está no schema (linha 93), mas mantida aqui
  // para clareza e mensagem de erro mais específica
  if (parsed.failedAttempts < EMAIL_JOB_RETRY_CONFIG.MAX_ATTEMPTS) {
    throw new Error(
      `Job deve falhar pelo menos ${EMAIL_JOB_RETRY_CONFIG.MAX_ATTEMPTS} vezes antes de ir para DLQ`,
    );
  }

  return parsed;
}

/**
 * Type inference helpers
 */
export type EmailJobRetryConfigInput = z.input<
  typeof emailJobRetryConfigSchema
>;
export type EmailJobRetryConfig = z.output<typeof emailJobRetryConfigSchema>;

export type EmailJobDLQEntryInput = z.input<typeof emailJobDLQEntrySchema>;
export type EmailJobDLQEntry = z.output<typeof emailJobDLQEntrySchema>;

export type TenantFairnessMetricsInput = z.input<
  typeof tenantFairnessMetricsSchema
>;
export type TenantFairnessMetrics = z.output<
  typeof tenantFairnessMetricsSchema
>;

export type JobRetryHistoryInput = z.input<typeof jobRetryHistorySchema>;
export type JobRetryHistory = z.output<typeof jobRetryHistorySchema>;
