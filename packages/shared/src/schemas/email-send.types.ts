/**
 * Tipos TypeScript - POST /v1/email/send
 *
 * Este arquivo contém definições de tipos TypeScript complementares
 * aos schemas Zod, incluindo enums, tipos de domínio e interfaces auxiliares.
 *
 * @see docs/api/03-email-send-contract.md
 * @see docs/api/schemas/email-send.schema.ts
 */

// ============================================================================
// ENUMS
// ============================================================================

/**
 * Status possíveis de um envio de e-mail
 */
export enum EmailStatus {
  /** Aguardando processamento (criado mas não enfileirado) */
  PENDING = 'PENDING',

  /** Na fila aguardando worker */
  ENQUEUED = 'ENQUEUED',

  /** Sendo processado pelo worker */
  PROCESSING = 'PROCESSING',

  /** Enviado com sucesso via SES */
  SENT = 'SENT',

  /** Falha permanente (não será reprocessado automaticamente) */
  FAILED = 'FAILED',

  /** Em retry após falha temporária */
  RETRYING = 'RETRYING',
}

/**
 * Tipos de eventos de e-mail
 */
export enum EmailEventType {
  /** E-mail criado no outbox */
  CREATED = 'CREATED',

  /** E-mail enfileirado */
  ENQUEUED = 'ENQUEUED',

  /** Processamento iniciado */
  PROCESSING = 'PROCESSING',

  /** Enviado com sucesso */
  SENT = 'SENT',

  /** Falha no envio */
  FAILED = 'FAILED',

  /** Retry iniciado */
  RETRY = 'RETRY',

  /** Movido para DLQ */
  DLQ = 'DLQ',

  /** Bounce reportado pelo SES */
  BOUNCE = 'BOUNCE',

  /** Complaint (spam) reportado pelo SES */
  COMPLAINT = 'COMPLAINT',

  /** E-mail entregue (confirmado pelo SES) */
  DELIVERY = 'DELIVERY',
}

/**
 * Códigos de erro da API
 */
export enum ApiErrorCode {
  // Erros de cliente (4xx)
  BAD_REQUEST = 'BAD_REQUEST',
  UNAUTHORIZED = 'UNAUTHORIZED',
  FORBIDDEN = 'FORBIDDEN',
  CONFLICT = 'CONFLICT',
  PAYLOAD_TOO_LARGE = 'PAYLOAD_TOO_LARGE',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',

  // Erros de servidor (5xx)
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',
  TIMEOUT = 'TIMEOUT',

  // Erros de integração
  SES_ERROR = 'SES_ERROR',
  DATABASE_ERROR = 'DATABASE_ERROR',
  REDIS_ERROR = 'REDIS_ERROR',
}

/**
 * Tipos de falha no envio
 */
export enum FailureReason {
  /** Validação falhou */
  VALIDATION_ERROR = 'validation-error',

  /** Rate limit excedido */
  RATE_LIMIT = 'rate-limit',

  /** Erro temporário do SES */
  SES_TEMPORARY = 'ses-temporary',

  /** Erro permanente do SES (ex: domínio inválido) */
  SES_PERMANENT = 'ses-permanent',

  /** Timeout na requisição ao SES */
  SES_TIMEOUT = 'ses-timeout',

  /** Erro de rede */
  NETWORK_ERROR = 'network-error',

  /** Erro interno não categorizado */
  INTERNAL_ERROR = 'internal-error',
}

// ============================================================================
// INTERFACES DE DOMÍNIO
// ============================================================================

/**
 * Representa um destinatário no sistema
 */
export interface IRecipient {
  /** ID único do destinatário (UUID) */
  id: string;

  /** ID da empresa proprietária */
  companyId: string;

  /** ID externo do destinatário no sistema do parceiro */
  externalId?: string;

  /** Hash do CPF/CNPJ para busca */
  cpfCnpjHash?: string;

  /** CPF/CNPJ cifrado (não exposto em APIs) */
  cpfCnpjEnc?: Buffer;

  /** Razão social (PJ) */
  razaoSocial?: string;

  /** Nome (PF) */
  nome?: string;

  /** E-mail */
  email: string;

  /** Data de criação */
  createdAt: Date;

  /** Data de última atualização */
  updatedAt: Date;

  /** Data de exclusão (soft delete) */
  deletedAt?: Date;
}

/**
 * Representa um registro na tabela email_outbox
 */
export interface IEmailOutbox {
  /** ID único do outbox (UUID) */
  id: string;

  /** ID da empresa */
  companyId: string;

  /** ID do destinatário */
  recipientId?: string;

  /** ID externo do envio no sistema do parceiro */
  externalId?: string;

  /** Destinatário principal */
  to: string;

  /** Destinatários em cópia */
  cc?: string[];

  /** Destinatários em cópia oculta */
  bcc?: string[];

  /** Assunto */
  subject: string;

  /** Referência ao HTML (armazenado inline ou em storage) */
  htmlRef: string;

  /** Endereço de resposta */
  replyTo?: string;

  /** Headers customizados */
  headers?: Record<string, string>;

  /** Tags */
  tags?: string[];

  /** Status atual */
  status: EmailStatus;

  /** Request ID de correlação */
  requestId: string;

  /** Chave de idempotência */
  idempotencyKey?: string;

  /** Data de criação */
  createdAt: Date;

  /** Data de última atualização */
  updatedAt: Date;
}

/**
 * Representa um registro na tabela email_logs
 */
export interface IEmailLog {
  /** ID único do log (UUID) */
  id: string;

  /** ID da empresa */
  companyId: string;

  /** ID do outbox relacionado */
  outboxId: string;

  /** ID do destinatário */
  recipientId?: string;

  /** Message ID retornado pelo SES */
  sesMessageId?: string;

  /** Destinatário principal */
  to: string;

  /** Assunto */
  subject: string;

  /** Status do envio */
  status: EmailStatus;

  /** Código de erro (se aplicável) */
  errorCode?: string;

  /** Motivo da falha (se aplicável) */
  errorReason?: FailureReason;

  /** Mensagem de erro detalhada */
  errorMessage?: string;

  /** Número de tentativas */
  attempts: number;

  /** Duração do processamento em ms */
  durationMs?: number;

  /** Request ID de correlação */
  requestId: string;

  /** Data de criação */
  createdAt: Date;

  /** Data do envio bem-sucedido */
  sentAt?: Date;

  /** Data da última falha */
  failedAt?: Date;
}

/**
 * Representa um evento na tabela email_events
 */
export interface IEmailEvent {
  /** ID único do evento (UUID) */
  id: string;

  /** ID do log relacionado */
  emailLogId: string;

  /** Tipo do evento */
  type: EmailEventType;

  /** Metadados adicionais do evento */
  metadata?: Record<string, any>;

  /** Timestamp do evento */
  timestamp: Date;
}

/**
 * Representa um job na fila Redis/BullMQ
 */
export interface IEmailJob {
  /** ID do job (igual ao outboxId) */
  jobId: string;

  /** ID do outbox */
  outboxId: string;

  /** ID da empresa */
  companyId: string;

  /** Destinatário principal */
  to: string;

  /** Destinatários em cópia */
  cc?: string[];

  /** Destinatários em cópia oculta */
  bcc?: string[];

  /** Assunto */
  subject: string;

  /** Referência ao HTML (não inclui o HTML completo) */
  htmlRef: string;

  /** Endereço de resposta */
  replyTo?: string;

  /** Headers customizados */
  headers?: Record<string, string>;

  /** Tags */
  tags?: string[];

  /** Dados do destinatário */
  recipient?: {
    /** ID do destinatário (se já existe) */
    recipientId?: string;

    /** ID externo */
    externalId?: string;

    /** Hash do CPF/CNPJ */
    cpfCnpjHash?: string;

    /** Razão social */
    razaoSocial?: string;

    /** Nome */
    nome?: string;

    /** E-mail */
    email: string;
  };

  /** Número da tentativa atual */
  attempt: number;

  /** Timestamp de enfileiramento */
  enqueueAt: Date;

  /** Request ID de correlação */
  requestId: string;
}

/**
 * Representa uma empresa/parceiro
 */
export interface ICompany {
  /** ID único da empresa (UUID) */
  id: string;

  /** Nome da empresa */
  name: string;

  /** API Key */
  apiKey: string;

  /** API Key ativa? */
  apiKeyActive: boolean;

  /** IPs permitidos (allowlist) */
  allowedIps?: string[];

  /** Limites de rate (requests por minuto) */
  rateLimitPerMinute: number;

  /** Limites de rate (requests por hora) */
  rateLimitPerHour: number;

  /** Limites de rate (requests por dia) */
  rateLimitPerDay: number;

  /** Data de criação */
  createdAt: Date;

  /** Data de última atualização */
  updatedAt: Date;
}

/**
 * Representa uma chave de idempotência
 */
export interface IIdempotencyKey {
  /** Chave de idempotência */
  key: string;

  /** ID da empresa */
  companyId: string;

  /** ID do outbox relacionado */
  outboxId: string;

  /** Hash do payload para verificação de equivalência */
  payloadHash: string;

  /** Data de criação */
  createdAt: Date;

  /** Data de expiração */
  expiresAt: Date;
}

// ============================================================================
// TIPOS DE RESPOSTA
// ============================================================================

/**
 * Resposta para GET /v1/emails/{id}
 */
export interface IEmailDetailResponse {
  /** ID do envio */
  id: string;

  /** ID da empresa */
  companyId: string;

  /** Status atual */
  status: EmailStatus;

  /** Destinatário principal */
  to: string;

  /** Destinatários em cópia */
  cc?: string[];

  /** Destinatários em cópia oculta */
  bcc?: string[];

  /** Assunto */
  subject: string;

  /** Dados do destinatário */
  recipient?: {
    externalId?: string;
    nome?: string;
    razaoSocial?: string;
    email: string;
    /** CPF/CNPJ mascarado */
    cpfCnpj?: string;
  };

  /** ID externo do envio */
  externalId?: string;

  /** Message ID do SES */
  sesMessageId?: string;

  /** Número de tentativas */
  attempts: number;

  /** Código de erro (se aplicável) */
  errorCode?: string;

  /** Mensagem de erro (se aplicável) */
  errorMessage?: string;

  /** Request ID de correlação */
  requestId: string;

  /** Data de criação */
  createdAt: string;

  /** Data do envio */
  sentAt?: string;

  /** Data da falha */
  failedAt?: string;

  /** Eventos do envio */
  events: Array<{
    type: EmailEventType;
    timestamp: string;
    metadata?: Record<string, any>;
  }>;
}

/**
 * Item da lista de e-mails (GET /v1/emails)
 */
export interface IEmailListItem {
  /** ID do envio */
  id: string;

  /** Status atual */
  status: EmailStatus;

  /** Destinatário principal */
  to: string;

  /** Assunto */
  subject: string;

  /** Nome ou razão social do destinatário */
  recipientName?: string;

  /** ID externo do envio */
  externalId?: string;

  /** Número de tentativas */
  attempts: number;

  /** Data de criação */
  createdAt: string;

  /** Data do envio */
  sentAt?: string;
}

/**
 * Resposta paginada para GET /v1/emails
 */
export interface IEmailListResponse {
  /** Lista de e-mails */
  data: IEmailListItem[];

  /** Metadados de paginação */
  pagination: {
    /** Página atual */
    page: number;

    /** Itens por página */
    pageSize: number;

    /** Total de itens */
    totalItems: number;

    /** Total de páginas */
    totalPages: number;

    /** Há próxima página? */
    hasNext: boolean;

    /** Há página anterior? */
    hasPrev: boolean;
  };
}

/**
 * Filtros para GET /v1/emails
 */
export interface IEmailListFilters {
  /** Filtrar por status */
  status?: EmailStatus;

  /** Data de início (ISO 8601) */
  dateFrom?: string;

  /** Data de fim (ISO 8601) */
  dateTo?: string;

  /** Filtrar por destinatário */
  to?: string;

  /** Filtrar por ID externo do recipient */
  recipientExternalId?: string;

  /** Filtrar por CPF/CNPJ (será hasheado) */
  cpfCnpj?: string;

  /** Filtrar por razão social */
  razaoSocial?: string;

  /** Filtrar por nome */
  nome?: string;

  /** Filtrar por ID externo do envio */
  externalId?: string;

  /** Página (default: 1) */
  page?: number;

  /** Itens por página (default: 20, max: 100) */
  pageSize?: number;

  /** Ordenação (default: createdAt:desc) */
  sort?: string;
}

// ============================================================================
// TIPOS DE CONTEXTO
// ============================================================================

/**
 * Contexto de autenticação da requisição
 */
export interface IAuthContext {
  /** Empresa autenticada */
  company: ICompany;

  /** IP do cliente */
  clientIp: string;

  /** Request ID */
  requestId: string;

  /** Timestamp da requisição */
  timestamp: Date;
}

/**
 * Contexto de processamento do worker
 */
export interface IWorkerContext {
  /** ID do worker */
  workerId: string;

  /** ID do job */
  jobId: string;

  /** Número da tentativa */
  attempt: number;

  /** Request ID de correlação */
  requestId: string;

  /** Timestamp de início do processamento */
  startedAt: Date;
}

// ============================================================================
// TIPOS AUXILIARES
// ============================================================================

/**
 * Resultado de validação
 */
export interface IValidationResult {
  /** Validação passou? */
  valid: boolean;

  /** Erros encontrados */
  errors?: Array<{
    field: string;
    message: string;
    value?: any;
  }>;
}

/**
 * Resultado de operação assíncrona
 */
export type AsyncResult<T, E = Error> =
  | { success: true; data: T }
  | { success: false; error: E };

/**
 * Configuração de retry
 */
export interface IRetryConfig {
  /** Número máximo de tentativas */
  maxAttempts: number;

  /** Backoff base em ms */
  backoffBase: number;

  /** Multiplicador de backoff */
  backoffMultiplier: number;

  /** Backoff máximo em ms */
  maxBackoff: number;
}

/**
 * Métricas de fila
 */
export interface IQueueMetrics {
  /** Jobs aguardando */
  waiting: number;

  /** Jobs em processamento */
  active: number;

  /** Jobs completados */
  completed: number;

  /** Jobs falhados */
  failed: number;

  /** Jobs na DLQ */
  dlq: number;

  /** Jobs em retry */
  delayed: number;
}

/**
 * Métricas de envio
 */
export interface ISendMetrics {
  /** Total de envios */
  total: number;

  /** Envios bem-sucedidos */
  sent: number;

  /** Envios falhados */
  failed: number;

  /** Taxa de sucesso (%) */
  successRate: number;

  /** Tempo médio de fila (ms) */
  avgQueueTime: number;

  /** Tempo médio de processamento (ms) */
  avgProcessingTime: number;

  /** P50 de latência (ms) */
  p50Latency: number;

  /** P95 de latência (ms) */
  p95Latency: number;

  /** P99 de latência (ms) */
  p99Latency: number;
}

// ============================================================================
// TYPE GUARDS
// ============================================================================

/**
 * Verifica se o status é terminal (não pode mais mudar)
 */
export function isTerminalStatus(status: EmailStatus): boolean {
  return status === EmailStatus.SENT || status === EmailStatus.FAILED;
}

/**
 * Verifica se o status indica sucesso
 */
export function isSuccessStatus(status: EmailStatus): boolean {
  return status === EmailStatus.SENT;
}

/**
 * Verifica se o status indica falha
 */
export function isFailureStatus(status: EmailStatus): boolean {
  return status === EmailStatus.FAILED;
}

/**
 * Verifica se o status indica processamento em andamento
 */
export function isProcessingStatus(status: EmailStatus): boolean {
  return (
    status === EmailStatus.ENQUEUED ||
    status === EmailStatus.PROCESSING ||
    status === EmailStatus.RETRYING
  );
}

/**
 * Verifica se o motivo de falha é temporário
 */
export function isTemporaryFailure(reason: FailureReason): boolean {
  return (
    reason === FailureReason.SES_TEMPORARY ||
    reason === FailureReason.NETWORK_ERROR ||
    reason === FailureReason.SES_TIMEOUT ||
    reason === FailureReason.RATE_LIMIT
  );
}

/**
 * Verifica se o motivo de falha é permanente
 */
export function isPermanentFailure(reason: FailureReason): boolean {
  return (
    reason === FailureReason.VALIDATION_ERROR ||
    reason === FailureReason.SES_PERMANENT
  );
}

// ============================================================================
// CONSTANTES
// ============================================================================

/**
 * Status que indicam que o e-mail ainda pode ser processado
 */
export const PROCESSABLE_STATUSES: EmailStatus[] = [
  EmailStatus.PENDING,
  EmailStatus.ENQUEUED,
  EmailStatus.PROCESSING,
  EmailStatus.RETRYING,
];

/**
 * Status terminais (não mudam mais)
 */
export const TERMINAL_STATUSES: EmailStatus[] = [
  EmailStatus.SENT,
  EmailStatus.FAILED,
];

/**
 * Eventos que indicam sucesso
 */
export const SUCCESS_EVENTS: EmailEventType[] = [
  EmailEventType.SENT,
  EmailEventType.DELIVERY,
];

/**
 * Eventos que indicam falha
 */
export const FAILURE_EVENTS: EmailEventType[] = [
  EmailEventType.FAILED,
  EmailEventType.BOUNCE,
  EmailEventType.COMPLAINT,
  EmailEventType.DLQ,
];
