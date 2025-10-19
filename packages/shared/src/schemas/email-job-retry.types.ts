/**
 * @email-gateway/shared - Email Job Retry Configuration
 *
 * Configurações para retry, backoff, DLQ e fairness por tenant
 *
 * TASK 3.2 — Retry/backoff/DLQ e fairness por tenant
 * Requisitos:
 * - Backoff exponencial com jitter (1s→60s)
 * - Mover à DLQ após 5 falhas
 * - TTL DLQ 7 dias
 * - lastFailureReason obrigatório
 * - AOF everysec, maxmemory-policy noeviction
 * - Round-robin por tenant (companyId)
 */

import { EMAIL_JOB_CONFIG } from './email-job.types';

/**
 * Configuração de retry e backoff exponencial
 */
export const EMAIL_JOB_RETRY_CONFIG = {
  /**
   * Tentativas máximas antes de mover para DLQ
   * TASK 3.2: Após 5 falhas → DLQ
   * @see EMAIL_JOB_CONFIG.MAX_ATTEMPTS
   */
  MAX_ATTEMPTS: EMAIL_JOB_CONFIG.MAX_ATTEMPTS,

  /**
   * Delay base para backoff exponencial (em milissegundos)
   * TASK 3.2: backoff inicia em 1s
   */
  BASE_DELAY_MS: 1000, // 1 segundo

  /**
   * Delay máximo para backoff exponencial (em milissegundos)
   * TASK 3.2: backoff máximo de 60s
   */
  MAX_DELAY_MS: 60000, // 60 segundos

  /**
   * Percentual de jitter aplicado ao delay calculado
   * Valor entre 0 e 1 (ex: 0.25 = ±25%)
   *
   * Jitter é usado para evitar "thundering herd" ao distribuir
   * as tentativas de retry no tempo
   */
  JITTER_FACTOR: 0.25, // ±25%

  /**
   * TTL para jobs na Dead Letter Queue (em milissegundos)
   * TASK 3.2: DLQ retida por 7 dias
   * @see EMAIL_JOB_CONFIG.DLQ_TTL
   */
  DLQ_TTL_MS: EMAIL_JOB_CONFIG.DLQ_TTL,

  /**
   * Nome da Dead Letter Queue
   */
  DLQ_NAME: 'email:send:dlq',

  /**
   * Número máximo de jobs mantidos na DLQ
   * Após este limite, jobs mais antigos são removidos automaticamente
   */
  DLQ_MAX_SIZE: 10000,
} as const;

/**
 * Configuração de fairness por tenant
 *
 * Implementa round-robin para garantir que nenhuma empresa monopolize
 * a capacidade de processamento do worker
 */
export const EMAIL_JOB_FAIRNESS_CONFIG = {
  /**
   * Habilita processamento round-robin por tenant (companyId)
   */
  ENABLE_ROUND_ROBIN: true,

  /**
   * Número máximo de jobs processados consecutivamente
   * de uma mesma empresa antes de alternar
   *
   * Ex: 3 significa que após processar 3 jobs da empresa A,
   * o worker passa para jobs da empresa B
   */
  MAX_JOBS_PER_TENANT_BATCH: 3,

  /**
   * Prioridade base para cálculo round-robin
   * Empresas sem jobs recentes recebem prioridade maior
   */
  ROUND_ROBIN_BASE_PRIORITY: 5,

  /**
   * Incremento de prioridade por "rodada" sem processamento
   * Se uma empresa fica N rodadas sem processar, sua prioridade aumenta
   */
  PRIORITY_INCREMENT_PER_ROUND: 1,

  /**
   * Prioridade máxima para round-robin
   * Limita o incremento de prioridade
   */
  MAX_ROUND_ROBIN_PRIORITY: 1, // 1 = máxima prioridade no BullMQ
} as const;

/**
 * Configuração do Redis para persistência e confiabilidade
 *
 * TASK 3.2 Requisitos:
 * - AOF everysec: fsync a cada segundo (balanceio entre performance e durabilidade)
 * - maxmemory-policy noeviction: nunca remover dados, falhar se memória cheia
 */
export const REDIS_CONFIG = {
  /**
   * Política de persistência AOF (Append-Only File)
   * "everysec": fsync executado a cada segundo
   *
   * Balanceio entre:
   * - "always": máxima durabilidade, menor performance
   * - "everysec": durabilidade boa, performance alta
   * - "no": máxima performance, menor durabilidade
   */
  AOF_FSYNC_POLICY: 'everysec' as const,

  /**
   * Habilita AOF (Append-Only File)
   */
  AOF_ENABLED: true,

  /**
   * Política de evicção quando memória máxima é atingida
   * "noeviction": retorna erro ao invés de remover chaves
   *
   * CRITICAL: Para garantir que jobs não sejam perdidos,
   * usamos noeviction. Sistema deve alertar antes de atingir limite.
   */
  MAXMEMORY_POLICY: 'noeviction' as const,

  /**
   * Limite de memória sugerido (em bytes)
   * 512MB por padrão - ajustar conforme ambiente
   *
   * IMPORTANTE: Configurar alertas para 80% deste valor
   */
  MAXMEMORY_BYTES: 512 * 1024 * 1024, // 512 MB

  /**
   * Timeout de conexão (ms)
   */
  CONNECT_TIMEOUT_MS: 10000, // 10 segundos

  /**
   * Tentativas de reconexão
   */
  MAX_RETRIES: 3,

  /**
   * Delay entre tentativas de reconexão (ms)
   */
  RETRY_DELAY_MS: 1000, // 1 segundo
} as const;

/**
 * Calcula o delay para retry com backoff exponencial e jitter
 *
 * Fórmula: min(MAX_DELAY, BASE_DELAY * 2^(attempt-1)) + jitter
 *
 * Jitter é calculado como um valor aleatório entre:
 * -JITTER_FACTOR * delay e +JITTER_FACTOR * delay
 *
 * @param attempt - Número da tentativa (1-indexed)
 * @returns Delay em milissegundos
 *
 * @example
 * calculateBackoffDelay(1) // ~1000ms (1s + jitter)
 * calculateBackoffDelay(2) // ~2000ms (2s + jitter)
 * calculateBackoffDelay(3) // ~4000ms (4s + jitter)
 * calculateBackoffDelay(4) // ~8000ms (8s + jitter)
 * calculateBackoffDelay(5) // ~16000ms (16s + jitter)
 * calculateBackoffDelay(6) // ~32000ms (32s + jitter)
 * calculateBackoffDelay(7) // ~60000ms (60s + jitter, capped)
 */
export function calculateBackoffDelay(attempt: number): number {
  const { BASE_DELAY_MS, MAX_DELAY_MS, JITTER_FACTOR } =
    EMAIL_JOB_RETRY_CONFIG;

  // Calcula delay exponencial: base * 2^(attempt-1)
  const exponentialDelay = BASE_DELAY_MS * Math.pow(2, attempt - 1);

  // Aplica limite máximo
  const cappedDelay = Math.min(exponentialDelay, MAX_DELAY_MS);

  // Calcula jitter: valor aleatório entre -jitter e +jitter
  const jitterRange = cappedDelay * JITTER_FACTOR;
  const jitter = (Math.random() * 2 - 1) * jitterRange; // [-jitterRange, +jitterRange]

  // Retorna delay com jitter, garantindo valor não-negativo
  return Math.max(0, Math.round(cappedDelay + jitter));
}

/**
 * Calcula a prioridade para fairness round-robin
 *
 * Prioridade menor = maior urgência no BullMQ (1 = máxima, 10 = mínima)
 *
 * @param roundsWithoutProcessing - Número de rodadas que a empresa ficou sem processar
 * @returns Prioridade calculada (1-10)
 *
 * @example
 * calculateRoundRobinPriority(0) // 5 (prioridade base)
 * calculateRoundRobinPriority(1) // 4 (aumentou urgência)
 * calculateRoundRobinPriority(5) // 1 (máxima urgência, capped)
 */
export function calculateRoundRobinPriority(
  roundsWithoutProcessing: number,
): number {
  const {
    ROUND_ROBIN_BASE_PRIORITY,
    PRIORITY_INCREMENT_PER_ROUND,
    MAX_ROUND_ROBIN_PRIORITY,
  } = EMAIL_JOB_FAIRNESS_CONFIG;

  // Reduz prioridade (aumenta urgência) conforme rodadas sem processar
  const calculatedPriority =
    ROUND_ROBIN_BASE_PRIORITY -
    roundsWithoutProcessing * PRIORITY_INCREMENT_PER_ROUND;

  // Garante que não ultrapassa limite máximo (1 = máxima urgência)
  return Math.max(MAX_ROUND_ROBIN_PRIORITY, calculatedPriority);
}

/**
 * Códigos de erro conhecidos do SES/SMTP
 */
export const SMTP_ERROR_CODES = {
  /**
   * Erros temporários que justificam retry
   */
  RETRYABLE: [
    '421', // Service not available
    '450', // Mailbox unavailable
    '451', // Local error in processing
    '452', // Insufficient system storage
    'Throttling', // AWS SES throttling
    'ServiceUnavailable', // AWS SES indisponível
  ],

  /**
   * Erros permanentes que NÃO devem ter retry
   */
  PERMANENT: [
    '500', // Syntax error, command unrecognized
    '501', // Syntax error in parameters
    '502', // Command not implemented
    '503', // Bad sequence of commands
    '504', // Command parameter not implemented
    '550', // Mailbox unavailable (permanent)
    '551', // User not local
    '552', // Exceeded storage allocation
    '553', // Mailbox name not allowed
    '554', // Transaction failed
    'MessageRejected', // AWS SES rejeitou mensagem
    'MailFromDomainNotVerified', // Domínio não verificado
  ],
} as const;

/**
 * Verifica se um erro é retryable
 *
 * @param errorCode - Código do erro (SMTP ou AWS SES)
 * @returns true se o erro justifica retry
 *
 * @example
 * isRetryableError('421') // true
 * isRetryableError('550') // false
 * isRetryableError('Throttling') // true
 */
export function isRetryableError(errorCode: string | undefined): boolean {
  if (!errorCode) return false;

  // Verifica se está na lista de erros retryable
  return SMTP_ERROR_CODES.RETRYABLE.some((code) => errorCode.includes(code));
}
