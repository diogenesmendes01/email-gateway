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
 * Constantes para configuração do job
 */
export const EMAIL_JOB_CONFIG = {
  /**
   * Nome da fila BullMQ
   */
  QUEUE_NAME: 'email:send',

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
