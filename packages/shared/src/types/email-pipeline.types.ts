/**
 * @email-gateway/shared - Email Pipeline Types
 *
 * Types e constantes para o pipeline de estados de envio de emails
 *
 * TASK 4.1 — Pipeline de estados, validações e envio SES
 * Requisitos:
 * - Estados: RECEIVED→VALIDATED→SENT_ATTEMPT→SENT|FAILED|RETRY_SCHEDULED
 * - Validações de integridade/outbox/recipient/template
 * - Mapeamento de erros SES → taxonomia interna
 * - Gravação email_logs/email_events com requestId/jobId/messageId
 * - Ack/retry conforme Trilha 3.2
 */

/**
 * Estados do pipeline de processamento de email
 *
 * Fluxo normal:
 * RECEIVED → VALIDATED → SENT_ATTEMPT → SENT
 *
 * Fluxos de erro:
 * RECEIVED → VALIDATED → SENT_ATTEMPT → FAILED (erro permanente)
 * RECEIVED → VALIDATED → SENT_ATTEMPT → RETRY_SCHEDULED (erro transiente)
 */
export enum EmailPipelineState {
  /** Job recebido e iniciando processamento */
  RECEIVED = 'RECEIVED',

  /** Validações concluídas com sucesso */
  VALIDATED = 'VALIDATED',

  /** Tentativa de envio ao SES em andamento */
  SENT_ATTEMPT = 'SENT_ATTEMPT',

  /** Email enviado com sucesso ao SES */
  SENT = 'SENT',

  /** Falha permanente (não será retentado) */
  FAILED = 'FAILED',

  /** Agendado para retry (falha transiente) */
  RETRY_SCHEDULED = 'RETRY_SCHEDULED',
}

/**
 * Tipos de validação no pipeline
 */
export enum ValidationType {
  /** Validação da integridade do payload do job */
  INTEGRITY = 'INTEGRITY',

  /** Validação da existência do registro no outbox */
  OUTBOX = 'OUTBOX',

  /** Validação dos dados do destinatário */
  RECIPIENT = 'RECIPIENT',

  /** Validação do template/HTML */
  TEMPLATE = 'TEMPLATE',
}

/**
 * Categorias de erro no pipeline
 */
export enum ErrorCategory {
  /** Erro de validação */
  VALIDATION_ERROR = 'VALIDATION_ERROR',

  /** Erro transiente (pode ser retentado) */
  TRANSIENT_ERROR = 'TRANSIENT_ERROR',

  /** Erro permanente (não deve ser retentado) */
  PERMANENT_ERROR = 'PERMANENT_ERROR',

  /** Erro de quota/rate limit do SES */
  QUOTA_ERROR = 'QUOTA_ERROR',

  /** Erro de configuração (DNS/SPF/DKIM) */
  CONFIGURATION_ERROR = 'CONFIGURATION_ERROR',

  /** Erro de timeout */
  TIMEOUT_ERROR = 'TIMEOUT_ERROR',
}

/**
 * Códigos de erro padronizados
 */
export enum ErrorCode {
  // Validação
  INVALID_PAYLOAD = 'INVALID_PAYLOAD',
  OUTBOX_NOT_FOUND = 'OUTBOX_NOT_FOUND',
  RECIPIENT_NOT_FOUND = 'RECIPIENT_NOT_FOUND',
  INVALID_TEMPLATE = 'INVALID_TEMPLATE',
  INVALID_EMAIL = 'INVALID_EMAIL',

  // SES - Erros permanentes
  SES_MESSAGE_REJECTED = 'SES_MESSAGE_REJECTED',
  SES_MAIL_FROM_DOMAIN_NOT_VERIFIED = 'SES_MAIL_FROM_DOMAIN_NOT_VERIFIED',
  SES_CONFIGURATION_SET_DOES_NOT_EXIST = 'SES_CONFIGURATION_SET_DOES_NOT_EXIST',
  SES_ACCOUNT_SENDING_PAUSED = 'SES_ACCOUNT_SENDING_PAUSED',

  // SES - Erros transientes
  SES_SERVICE_UNAVAILABLE = 'SES_SERVICE_UNAVAILABLE',
  SES_THROTTLING = 'SES_THROTTLING',
  SES_TIMEOUT = 'SES_TIMEOUT',
  SES_CIRCUIT_OPEN = 'SES_CIRCUIT_OPEN',

  // SES - Quota
  SES_DAILY_QUOTA_EXCEEDED = 'SES_DAILY_QUOTA_EXCEEDED',
  SES_MAX_SEND_RATE_EXCEEDED = 'SES_MAX_SEND_RATE_EXCEEDED',

  // Rede
  NETWORK_ERROR = 'NETWORK_ERROR',
  DNS_ERROR = 'DNS_ERROR',

  // Outros
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
}

/**
 * Mapeamento de erros AWS SES para nossa taxonomia
 */
export interface SESErrorMapping {
  /** Código de erro original do SES */
  sesErrorCode: string;

  /** Código de erro padronizado */
  errorCode: ErrorCode;

  /** Categoria do erro */
  category: ErrorCategory;

  /** Indica se o erro é retentável */
  retryable: boolean;

  /** Mensagem amigável para logs */
  message: string;
}

/**
 * Resultado de uma validação
 */
export interface ValidationResult {
  /** Tipo de validação executada */
  type: ValidationType;

  /** Se a validação passou */
  success: boolean;

  /** Mensagem de erro (se falhou) */
  error?: string;

  /** Código do erro (se falhou) */
  errorCode?: ErrorCode;

  /** Metadados adicionais */
  metadata?: Record<string, unknown>;
}

/**
 * Contexto do pipeline para uma execução
 */
export interface PipelineContext {
  /** ID do job (igual ao outboxId) */
  jobId: string;

  /** ID da requisição original */
  requestId: string;

  /** ID do tenant/empresa */
  companyId: string;

  /** ID do registro no outbox */
  outboxId: string;

  /** Estado atual do pipeline */
  state: EmailPipelineState;

  /** Tentativa atual */
  attempt: number;

  /** Timestamp de início do processamento */
  startedAt: Date;

  /** Resultados das validações */
  validations: ValidationResult[];

  /** ID da mensagem no SES (quando enviado) */
  sesMessageId?: string;

  /** Erro ocorrido (se houver) */
  error?: {
    code: ErrorCode;
    category: ErrorCategory;
    message: string;
    retryable: boolean;
    metadata?: Record<string, unknown>;
  };
}

/**
 * Constantes do pipeline
 */
export const PIPELINE_CONSTANTS = {
  /** Timeout para envio ao SES (ms) */
  SES_SEND_TIMEOUT_MS: 30000, // 30 segundos

  /** Timeout para validações (ms) */
  VALIDATION_TIMEOUT_MS: 5000, // 5 segundos

  /** Tamanho máximo do HTML (bytes) */
  MAX_HTML_SIZE_BYTES: 512 * 1024, // 512 KB

  /** Tamanho máximo do subject após processamento */
  MAX_SUBJECT_LENGTH: 150,
} as const;

/**
 * Mapeamento de erros SES conhecidos
 * Baseado em: https://docs.aws.amazon.com/ses/latest/dg/api-error-codes.html
 */
export const SES_ERROR_MAPPINGS: Record<string, Omit<SESErrorMapping, 'sesErrorCode'>> = {
  // Erros permanentes
  'MessageRejected': {
    errorCode: ErrorCode.SES_MESSAGE_REJECTED,
    category: ErrorCategory.PERMANENT_ERROR,
    retryable: false,
    message: 'Mensagem rejeitada pelo SES (conteúdo inválido ou destinatário bloqueado)',
  },
  'MailFromDomainNotVerified': {
    errorCode: ErrorCode.SES_MAIL_FROM_DOMAIN_NOT_VERIFIED,
    category: ErrorCategory.CONFIGURATION_ERROR,
    retryable: false,
    message: 'Domínio de envio não verificado no SES',
  },
  'ConfigurationSetDoesNotExist': {
    errorCode: ErrorCode.SES_CONFIGURATION_SET_DOES_NOT_EXIST,
    category: ErrorCategory.CONFIGURATION_ERROR,
    retryable: false,
    message: 'Configuration Set não existe no SES',
  },
  'AccountSendingPausedException': {
    errorCode: ErrorCode.SES_ACCOUNT_SENDING_PAUSED,
    category: ErrorCategory.PERMANENT_ERROR,
    retryable: false,
    message: 'Conta SES pausada (violação de políticas)',
  },

  // Erros de quota
  'Throttling': {
    errorCode: ErrorCode.SES_THROTTLING,
    category: ErrorCategory.QUOTA_ERROR,
    retryable: true,
    message: 'Taxa de envio excedida (rate limiting)',
  },
  'MaxSendRateExceeded': {
    errorCode: ErrorCode.SES_MAX_SEND_RATE_EXCEEDED,
    category: ErrorCategory.QUOTA_ERROR,
    retryable: true,
    message: 'Taxa máxima de envio por segundo excedida',
  },
  'DailyQuotaExceeded': {
    errorCode: ErrorCode.SES_DAILY_QUOTA_EXCEEDED,
    category: ErrorCategory.QUOTA_ERROR,
    retryable: true,
    message: 'Quota diária de envios excedida',
  },

  // Erros transientes
  'ServiceUnavailable': {
    errorCode: ErrorCode.SES_SERVICE_UNAVAILABLE,
    category: ErrorCategory.TRANSIENT_ERROR,
    retryable: true,
    message: 'Serviço SES temporariamente indisponível',
  },
  'RequestTimeout': {
    errorCode: ErrorCode.SES_TIMEOUT,
    category: ErrorCategory.TIMEOUT_ERROR,
    retryable: true,
    message: 'Timeout na requisição ao SES',
  },

  // Rede
  'NetworkingError': {
    errorCode: ErrorCode.NETWORK_ERROR,
    category: ErrorCategory.TRANSIENT_ERROR,
    retryable: true,
    message: 'Erro de rede ao conectar com SES',
  },
} as const;
