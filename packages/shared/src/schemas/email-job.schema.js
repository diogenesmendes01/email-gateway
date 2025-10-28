"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateEmailJobData = exports.emailSendJobResultSchema = exports.emailSendJobOptionsSchema = exports.emailSendJobDataSchema = exports.emailJobRecipientSchema = void 0;
const zod_1 = require("zod");
const email_job_types_1 = require("./email-job.types");
exports.emailJobRecipientSchema = zod_1.z.object({
    recipientId: zod_1.z
        .string()
        .uuid('recipientId deve ser um UUID válido')
        .optional()
        .describe('UUID do destinatário no banco'),
    externalId: zod_1.z
        .string()
        .min(1, 'externalId não pode ser vazio')
        .max(email_job_types_1.EMAIL_JOB_VALIDATION.MAX_EXTERNAL_ID_LENGTH, `externalId deve ter no máximo ${email_job_types_1.EMAIL_JOB_VALIDATION.MAX_EXTERNAL_ID_LENGTH} caracteres`)
        .optional()
        .describe('ID externo do destinatário no sistema do parceiro'),
    cpfCnpjHash: zod_1.z
        .string()
        .length(email_job_types_1.EMAIL_JOB_VALIDATION.SHA256_HEX_LENGTH, `cpfCnpjHash deve ser SHA-256 (${email_job_types_1.EMAIL_JOB_VALIDATION.SHA256_HEX_LENGTH} chars hex)`)
        .regex(/^[a-f0-9]{64}$/, 'cpfCnpjHash deve ser um hash SHA-256 válido')
        .optional()
        .describe('Hash SHA-256 do CPF/CNPJ normalizado'),
    razaoSocial: zod_1.z
        .string()
        .min(1)
        .max(email_job_types_1.EMAIL_JOB_VALIDATION.MAX_RAZAO_SOCIAL_LENGTH, `razaoSocial deve ter no máximo ${email_job_types_1.EMAIL_JOB_VALIDATION.MAX_RAZAO_SOCIAL_LENGTH} caracteres`)
        .optional()
        .describe('Razão social (pessoa jurídica)'),
    nome: zod_1.z
        .string()
        .min(1)
        .max(email_job_types_1.EMAIL_JOB_VALIDATION.MAX_NAME_LENGTH, `nome deve ter no máximo ${email_job_types_1.EMAIL_JOB_VALIDATION.MAX_NAME_LENGTH} caracteres`)
        .optional()
        .describe('Nome (pessoa física)'),
    email: zod_1.z
        .string()
        .email('Email do destinatário deve ser válido')
        .max(email_job_types_1.EMAIL_JOB_VALIDATION.MAX_EMAIL_LENGTH, `Email deve ter no máximo ${email_job_types_1.EMAIL_JOB_VALIDATION.MAX_EMAIL_LENGTH} caracteres`)
        .describe('Endereço de email do destinatário'),
});
exports.emailSendJobDataSchema = zod_1.z
    .object({
    outboxId: zod_1.z
        .string()
        .uuid('outboxId deve ser um UUID válido')
        .describe('UUID do registro em email_outbox (igual ao jobId)'),
    companyId: zod_1.z
        .string()
        .uuid('companyId deve ser um UUID válido')
        .describe('UUID da empresa (tenant)'),
    requestId: zod_1.z
        .string()
        .min(1, 'requestId não pode ser vazio')
        .max(email_job_types_1.EMAIL_JOB_VALIDATION.MAX_REQUEST_ID_LENGTH, `requestId deve ter no máximo ${email_job_types_1.EMAIL_JOB_VALIDATION.MAX_REQUEST_ID_LENGTH} caracteres`)
        .describe('ID da requisição original para correlação'),
    to: zod_1.z
        .string()
        .email('Endereço de email "to" deve ser válido')
        .max(email_job_types_1.EMAIL_JOB_VALIDATION.MAX_EMAIL_LENGTH, `Email deve ter no máximo ${email_job_types_1.EMAIL_JOB_VALIDATION.MAX_EMAIL_LENGTH} caracteres`)
        .describe('Destinatário principal'),
    cc: zod_1.z
        .array(zod_1.z
        .string()
        .email('Endereços em "cc" devem ser válidos')
        .max(email_job_types_1.EMAIL_JOB_VALIDATION.MAX_EMAIL_LENGTH))
        .max(email_job_types_1.EMAIL_JOB_VALIDATION.MAX_CC_BCC_RECIPIENTS, `Máximo ${email_job_types_1.EMAIL_JOB_VALIDATION.MAX_CC_BCC_RECIPIENTS} destinatários em CC`)
        .optional()
        .describe('Destinatários em cópia'),
    bcc: zod_1.z
        .array(zod_1.z
        .string()
        .email('Endereços em "bcc" devem ser válidos')
        .max(email_job_types_1.EMAIL_JOB_VALIDATION.MAX_EMAIL_LENGTH))
        .max(email_job_types_1.EMAIL_JOB_VALIDATION.MAX_CC_BCC_RECIPIENTS, `Máximo ${email_job_types_1.EMAIL_JOB_VALIDATION.MAX_CC_BCC_RECIPIENTS} destinatários em BCC`)
        .optional()
        .describe('Destinatários em cópia oculta'),
    subject: zod_1.z
        .string()
        .min(1, 'Subject não pode ser vazio')
        .max(email_job_types_1.EMAIL_JOB_VALIDATION.MAX_SUBJECT_LENGTH, `Subject deve ter no máximo ${email_job_types_1.EMAIL_JOB_VALIDATION.MAX_SUBJECT_LENGTH} caracteres`)
        .refine((val) => !val.includes('\n'), {
        message: 'Subject não pode conter quebras de linha',
    })
        .describe('Assunto do email'),
    htmlRef: zod_1.z
        .string()
        .min(1, 'htmlRef não pode ser vazio')
        .max(email_job_types_1.EMAIL_JOB_VALIDATION.MAX_HTML_REF_LENGTH, `htmlRef deve ter no máximo ${email_job_types_1.EMAIL_JOB_VALIDATION.MAX_HTML_REF_LENGTH} caracteres`)
        .describe('Referência ao HTML armazenado. Formatos aceitos: UUID (para DB), path S3, ou identificador customizado'),
    replyTo: zod_1.z
        .string()
        .email('replyTo deve ser um email válido')
        .max(email_job_types_1.EMAIL_JOB_VALIDATION.MAX_EMAIL_LENGTH)
        .optional()
        .describe('Endereço de resposta'),
    headers: zod_1.z
        .record(zod_1.z.string(), zod_1.z.string())
        .optional()
        .describe('Headers customizados (safe-listed)'),
    tags: zod_1.z
        .array(zod_1.z
        .string()
        .min(1)
        .max(email_job_types_1.EMAIL_JOB_VALIDATION.MAX_TAG_LENGTH))
        .max(email_job_types_1.EMAIL_JOB_VALIDATION.MAX_TAGS, `Máximo ${email_job_types_1.EMAIL_JOB_VALIDATION.MAX_TAGS} tags`)
        .optional()
        .describe('Tags para categorização'),
    recipient: exports.emailJobRecipientSchema.describe('Informações do destinatário'),
    attempt: zod_1.z
        .number()
        .int('attempt deve ser um inteiro')
        .min(1, 'attempt deve ser >= 1')
        .max(email_job_types_1.EMAIL_JOB_CONFIG.MAX_ATTEMPTS, `attempt deve ser <= ${email_job_types_1.EMAIL_JOB_CONFIG.MAX_ATTEMPTS}`)
        .describe('Contador de tentativas'),
    enqueuedAt: zod_1.z
        .string()
        .datetime('enqueuedAt deve ser ISO 8601')
        .describe('Timestamp de enfileiramento'),
})
    .strict()
    .describe('Payload do Job email:send');
exports.emailSendJobOptionsSchema = zod_1.z
    .object({
    jobId: zod_1.z
        .string()
        .uuid('jobId deve ser um UUID válido (igual ao outboxId)')
        .describe('Job ID = Outbox ID (idempotência)'),
    ttl: zod_1.z
        .number()
        .int('TTL deve ser um inteiro')
        .positive('TTL deve ser positivo')
        .max(email_job_types_1.EMAIL_JOB_CONFIG.DEFAULT_TTL, `TTL não pode exceder 24h (${email_job_types_1.EMAIL_JOB_CONFIG.DEFAULT_TTL}ms)`)
        .default(email_job_types_1.EMAIL_JOB_CONFIG.DEFAULT_TTL)
        .describe('TTL do job em milissegundos'),
    priority: zod_1.z
        .number()
        .int('priority deve ser um inteiro')
        .min(email_job_types_1.EMAIL_JOB_VALIDATION.MIN_PRIORITY, `priority mínima = ${email_job_types_1.EMAIL_JOB_VALIDATION.MIN_PRIORITY}`)
        .max(email_job_types_1.EMAIL_JOB_VALIDATION.MAX_PRIORITY, `priority máxima = ${email_job_types_1.EMAIL_JOB_VALIDATION.MAX_PRIORITY}`)
        .default(email_job_types_1.EMAIL_JOB_CONFIG.DEFAULT_PRIORITY)
        .optional()
        .describe('Prioridade do job no BullMQ (valores menores = maior prioridade; 1=máxima, 10=mínima)'),
    delay: zod_1.z
        .number()
        .int('delay deve ser um inteiro')
        .nonnegative('delay não pode ser negativo')
        .optional()
        .describe('Delay antes de processar (ms)'),
    removeOnComplete: zod_1.z
        .boolean()
        .optional()
        .default(true)
        .describe('Remover job após completar'),
    removeOnFail: zod_1.z
        .boolean()
        .optional()
        .default(false)
        .describe('Remover job após falha permanente'),
})
    .strict()
    .describe('Opções de configuração do job');
exports.emailSendJobResultSchema = zod_1.z
    .object({
    sesMessageId: zod_1.z
        .string()
        .max(email_job_types_1.EMAIL_JOB_VALIDATION.MAX_SES_MESSAGE_ID_LENGTH, `sesMessageId deve ter no máximo ${email_job_types_1.EMAIL_JOB_VALIDATION.MAX_SES_MESSAGE_ID_LENGTH} caracteres`)
        .optional()
        .describe('ID da mensagem no SES'),
    status: zod_1.z
        .enum(['SENT', 'FAILED', 'RETRYING'])
        .describe('Status final do envio'),
    processedAt: zod_1.z
        .string()
        .datetime('processedAt deve ser ISO 8601')
        .describe('Timestamp do processamento'),
    durationMs: zod_1.z
        .number()
        .int('durationMs deve ser um inteiro')
        .nonnegative('durationMs não pode ser negativo')
        .describe('Duração do processamento'),
    errorCode: zod_1.z
        .string()
        .max(email_job_types_1.EMAIL_JOB_VALIDATION.MAX_ERROR_CODE_LENGTH, `errorCode deve ter no máximo ${email_job_types_1.EMAIL_JOB_VALIDATION.MAX_ERROR_CODE_LENGTH} caracteres`)
        .optional()
        .describe('Código do erro (se falhou)'),
    errorReason: zod_1.z
        .string()
        .max(email_job_types_1.EMAIL_JOB_VALIDATION.MAX_ERROR_REASON_LENGTH, `errorReason deve ter no máximo ${email_job_types_1.EMAIL_JOB_VALIDATION.MAX_ERROR_REASON_LENGTH} caracteres`)
        .optional()
        .describe('Mensagem de erro (se falhou)'),
    attempt: zod_1.z
        .number()
        .int('attempt deve ser um inteiro')
        .min(1)
        .max(email_job_types_1.EMAIL_JOB_CONFIG.MAX_ATTEMPTS)
        .describe('Número da tentativa'),
})
    .strict()
    .describe('Resultado do processamento');
const validateEmailJobData = (data) => {
    const parsed = exports.emailSendJobDataSchema.parse(data);
    if (parsed.recipient.email !== parsed.to) {
        throw new Error('recipient.email deve coincidir com to');
    }
    if (!parsed.recipient.recipientId &&
        !parsed.recipient.externalId &&
        !parsed.recipient.cpfCnpjHash) {
        throw new Error('recipient deve ter ao menos um de: recipientId, externalId ou cpfCnpjHash');
    }
    return parsed;
};
exports.validateEmailJobData = validateEmailJobData;
//# sourceMappingURL=email-job.schema.js.map