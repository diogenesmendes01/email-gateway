"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.jobRetryHistorySchema = exports.tenantFairnessMetricsSchema = exports.emailJobDLQEntrySchema = exports.emailJobRetryConfigSchema = void 0;
exports.validateDLQEntry = validateDLQEntry;
const zod_1 = require("zod");
const email_job_retry_types_1 = require("./email-job-retry.types");
exports.emailJobRetryConfigSchema = zod_1.z
    .object({
    attempts: zod_1.z
        .number()
        .int('attempts deve ser um inteiro')
        .min(1, 'attempts deve ser >= 1')
        .max(email_job_retry_types_1.EMAIL_JOB_RETRY_CONFIG.MAX_ATTEMPTS, `attempts não pode exceder ${email_job_retry_types_1.EMAIL_JOB_RETRY_CONFIG.MAX_ATTEMPTS}`)
        .default(email_job_retry_types_1.EMAIL_JOB_RETRY_CONFIG.MAX_ATTEMPTS)
        .describe('Número máximo de tentativas antes de mover para DLQ'),
    backoff: zod_1.z
        .object({
        type: zod_1.z.literal('exponential').describe('Tipo de backoff'),
        delay: zod_1.z
            .number()
            .int('delay deve ser um inteiro')
            .min(email_job_retry_types_1.EMAIL_JOB_RETRY_CONFIG.BASE_DELAY_MS, `delay mínimo é ${email_job_retry_types_1.EMAIL_JOB_RETRY_CONFIG.BASE_DELAY_MS}ms`)
            .default(email_job_retry_types_1.EMAIL_JOB_RETRY_CONFIG.BASE_DELAY_MS)
            .describe('Delay base em milissegundos'),
    })
        .default({
        type: 'exponential',
        delay: email_job_retry_types_1.EMAIL_JOB_RETRY_CONFIG.BASE_DELAY_MS,
    })
        .describe('Configuração de backoff exponencial'),
    removeOnComplete: zod_1.z
        .union([zod_1.z.boolean(), zod_1.z.number().int().positive()])
        .default(true)
        .describe('Remove job após sucesso (true ou número de jobs a manter)'),
    removeOnFail: zod_1.z
        .union([zod_1.z.boolean(), zod_1.z.number().int().positive()])
        .default(false)
        .describe('Remove job após falha permanente (false = move para DLQ)'),
})
    .strict()
    .describe('Configuração de retry para BullMQ');
exports.emailJobDLQEntrySchema = zod_1.z
    .object({
    jobId: zod_1.z
        .string()
        .uuid('jobId deve ser UUID')
        .describe('ID do job (= outboxId)'),
    outboxId: zod_1.z
        .string()
        .uuid('outboxId deve ser UUID')
        .describe('ID do registro em email_outbox'),
    companyId: zod_1.z
        .string()
        .uuid('companyId deve ser UUID')
        .describe('ID da empresa (tenant)'),
    originalData: zod_1.z
        .record(zod_1.z.unknown())
        .describe('Payload original do job'),
    failedAttempts: zod_1.z
        .number()
        .int('failedAttempts deve ser inteiro')
        .min(email_job_retry_types_1.EMAIL_JOB_RETRY_CONFIG.MAX_ATTEMPTS)
        .describe('Número de tentativas falhadas'),
    lastFailureReason: zod_1.z
        .string()
        .min(1, 'lastFailureReason é obrigatório')
        .max(500, 'lastFailureReason deve ter no máximo 500 caracteres')
        .refine((val) => val.trim().length > 0, 'lastFailureReason não pode ser apenas espaços em branco')
        .describe('OBRIGATÓRIO (TASK 3.2): Razão da última falha antes de mover para DLQ'),
    lastFailureCode: zod_1.z
        .string()
        .max(64, 'lastFailureCode deve ter no máximo 64 caracteres')
        .optional()
        .describe('Código do último erro (SMTP ou AWS SES)'),
    lastFailureTimestamp: zod_1.z
        .string()
        .datetime('lastFailureTimestamp deve ser ISO 8601')
        .describe('Timestamp da última falha'),
    enqueuedAt: zod_1.z
        .string()
        .datetime('enqueuedAt deve ser ISO 8601')
        .describe('Timestamp de enfileiramento original'),
    movedToDLQAt: zod_1.z
        .string()
        .datetime('movedToDLQAt deve ser ISO 8601')
        .describe('Timestamp de movimentação para DLQ'),
    ttl: zod_1.z
        .number()
        .int('ttl deve ser inteiro')
        .positive('ttl deve ser positivo')
        .default(email_job_retry_types_1.EMAIL_JOB_RETRY_CONFIG.DLQ_TTL_MS)
        .describe('TTL na DLQ em milissegundos (7 dias)'),
})
    .strict()
    .describe('Entrada na Dead Letter Queue');
exports.tenantFairnessMetricsSchema = zod_1.z
    .object({
    companyId: zod_1.z
        .string()
        .uuid('companyId deve ser UUID')
        .describe('ID da empresa (tenant)'),
    lastProcessedAt: zod_1.z
        .string()
        .datetime('lastProcessedAt deve ser ISO 8601')
        .optional()
        .describe('Timestamp do último job processado desta empresa'),
    roundsWithoutProcessing: zod_1.z
        .number()
        .int('roundsWithoutProcessing deve ser inteiro')
        .nonnegative('roundsWithoutProcessing não pode ser negativo')
        .default(0)
        .describe('Número de rodadas sem processar jobs desta empresa'),
    currentPriority: zod_1.z
        .number()
        .int('currentPriority deve ser inteiro')
        .min(email_job_retry_types_1.EMAIL_JOB_FAIRNESS_CONFIG.MAX_ROUND_ROBIN_PRIORITY, `currentPriority mínima = ${email_job_retry_types_1.EMAIL_JOB_FAIRNESS_CONFIG.MAX_ROUND_ROBIN_PRIORITY}`)
        .max(10, 'currentPriority máxima = 10')
        .default(email_job_retry_types_1.EMAIL_JOB_FAIRNESS_CONFIG.ROUND_ROBIN_BASE_PRIORITY)
        .describe('Prioridade atual calculada para round-robin'),
    totalProcessed: zod_1.z
        .number()
        .int('totalProcessed deve ser inteiro')
        .nonnegative('totalProcessed não pode ser negativo')
        .default(0)
        .describe('Total de jobs processados desta empresa'),
    consecutiveBatchCount: zod_1.z
        .number()
        .int('consecutiveBatchCount deve ser inteiro')
        .nonnegative('consecutiveBatchCount não pode ser negativo')
        .default(0)
        .describe('Jobs processados consecutivamente no batch atual'),
})
    .strict()
    .describe('Métricas de fairness para round-robin por tenant');
exports.jobRetryHistorySchema = zod_1.z
    .object({
    attempt: zod_1.z
        .number()
        .int('attempt deve ser inteiro')
        .min(1, 'attempt deve ser >= 1')
        .describe('Número da tentativa'),
    failedAt: zod_1.z
        .string()
        .datetime('failedAt deve ser ISO 8601')
        .describe('Timestamp da falha'),
    errorCode: zod_1.z
        .string()
        .max(64, 'errorCode deve ter no máximo 64 caracteres')
        .optional()
        .describe('Código do erro'),
    errorReason: zod_1.z
        .string()
        .max(500, 'errorReason deve ter no máximo 500 caracteres')
        .describe('Razão da falha'),
    delayUntilNextAttempt: zod_1.z
        .number()
        .int('delayUntilNextAttempt deve ser inteiro')
        .nonnegative('delayUntilNextAttempt não pode ser negativo')
        .optional()
        .describe('Delay calculado até próxima tentativa (ms)'),
    isRetryable: zod_1.z
        .boolean()
        .describe('Indica se o erro justifica retry'),
})
    .strict()
    .describe('Entrada no histórico de retry do job');
function validateDLQEntry(data) {
    const parsed = exports.emailJobDLQEntrySchema.parse(data);
    if (parsed.failedAttempts < email_job_retry_types_1.EMAIL_JOB_RETRY_CONFIG.MAX_ATTEMPTS) {
        throw new Error(`Job deve falhar pelo menos ${email_job_retry_types_1.EMAIL_JOB_RETRY_CONFIG.MAX_ATTEMPTS} vezes antes de ir para DLQ`);
    }
    return parsed;
}
//# sourceMappingURL=email-job-retry.schema.js.map