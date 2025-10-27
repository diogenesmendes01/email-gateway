/**
 * @email-gateway/shared - Email Job Constants
 *
 * Constantes e configurações para o contrato do Job `email:send`
 *
 * TASK 3.1 — Contrato do Job `email:send`
 * Requisitos:
 * - Payload mínimo (referência ao outboxId + snapshot crítico)
 * - jobId = outboxId
 * - Garantias pelo-menos-uma-vez
 * - TTL 24h
 * - PII mínima/criptografada
 *
 * NOTA: Os tipos TypeScript são gerados automaticamente via Zod
 * no arquivo email-job.schema.ts. Este arquivo contém apenas constantes.
 */

/**
 * Constantes de validação para limites de campos
 */
export const EMAIL_JOB_VALIDATION = {
  /** Tamanho máximo para email (RFC 5321) */
  MAX_EMAIL_LENGTH: 254,

  /** Tamanho máximo para subject */
  MAX_SUBJECT_LENGTH: 150,

  /** Tamanho máximo para htmlRef */
  MAX_HTML_REF_LENGTH: 512,

  /** Tamanho máximo para requestId */
  MAX_REQUEST_ID_LENGTH: 128,

  /** Tamanho máximo para nome */
  MAX_NAME_LENGTH: 120,

  /** Tamanho máximo para razão social */
  MAX_RAZAO_SOCIAL_LENGTH: 150,

  /** Tamanho máximo para externalId */
  MAX_EXTERNAL_ID_LENGTH: 64,

  /** Tamanho do hash SHA-256 em hexadecimal */
  SHA256_HEX_LENGTH: 64,

  /** Máximo de destinatários em CC/BCC */
  MAX_CC_BCC_RECIPIENTS: 5,

  /** Máximo de tags permitidas */
  MAX_TAGS: 5,

  /** Tamanho máximo para cada tag */
  MAX_TAG_LENGTH: 50,

  /** Tamanho máximo para sesMessageId */
  MAX_SES_MESSAGE_ID_LENGTH: 128,

  /** Tamanho máximo para errorCode */
  MAX_ERROR_CODE_LENGTH: 64,

  /** Tamanho máximo para errorReason */
  MAX_ERROR_REASON_LENGTH: 500,

  /** Range de prioridade mínima */
  MIN_PRIORITY: 1,

  /** Range de prioridade máxima */
  MAX_PRIORITY: 10,
} as const;

/**
 * Constantes para configuração do job
 */
export const EMAIL_JOB_CONFIG = {
  /**
   * Nome da fila BullMQ
   */
  QUEUE_NAME: 'email-send',

  /**
   * TTL padrão: 24 horas em milissegundos
   */
  DEFAULT_TTL: 24 * 60 * 60 * 1000, // 86400000 ms

  /**
   * Prioridade padrão
   */
  DEFAULT_PRIORITY: 5,

  /**
   * Tentativas máximas antes de mover para DLQ
   */
  MAX_ATTEMPTS: 5,

  /**
   * Backoff exponencial (em segundos)
   */
  BACKOFF_DELAYS: [1, 5, 30, 120, 600], // 1s, 5s, 30s, 2min, 10min

  /**
   * Tempo máximo de retenção na DLQ: 7 dias
   */
  DLQ_TTL: 7 * 24 * 60 * 60 * 1000, // 604800000 ms
} as const;
