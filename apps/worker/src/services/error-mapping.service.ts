/**
 * @email-gateway/worker - Error Mapping Service
 *
 * Service responsável por mapear erros do AWS SES para taxonomia interna
 *
 * TASK 4.1 — Pipeline de estados, validações e envio SES
 * Mapeamento de erros SES → taxonomia interna
 */

import {
  ErrorCode,
  ErrorCategory,
  SES_ERROR_MAPPINGS,
  SESErrorMapping,
} from '@email-gateway/shared';

/**
 * Representa um erro mapeado com toda a informação necessária
 */
export interface MappedError {
  /** Código de erro padronizado */
  code: ErrorCode;

  /** Categoria do erro */
  category: ErrorCategory;

  /** Se o erro é retentável */
  retryable: boolean;

  /** Mensagem descritiva */
  message: string;

  /** Código original do erro (ex: do SES) */
  originalCode?: string;

  /** Mensagem original do erro */
  originalMessage?: string;

  /** Metadados adicionais */
  metadata?: Record<string, unknown>;
}

export class ErrorMappingService {
  /**
   * Mapeia um erro do AWS SES para nossa taxonomia interna
   *
   * @param error - Erro do AWS SDK
   * @returns Erro mapeado com informações padronizadas
   */
  static mapSESError(error: unknown): MappedError {
    // Tenta extrair o código de erro do AWS SDK
    const awsError = error as {
      name?: string;
      code?: string;
      message?: string;
      $metadata?: { httpStatusCode?: number };
    };

    const errorCode = awsError.code || awsError.name || 'UNKNOWN';
    const errorMessage = awsError.message || 'Unknown error';
    const statusCode = awsError.$metadata?.httpStatusCode;

    // Busca o mapeamento conhecido
    const mapping = SES_ERROR_MAPPINGS[errorCode];

    if (mapping) {
      return {
        code: mapping.errorCode,
        category: mapping.category,
        retryable: mapping.retryable,
        message: mapping.message,
        originalCode: errorCode,
        originalMessage: errorMessage,
        metadata: {
          httpStatusCode: statusCode,
        },
      };
    }

    // Se não encontrou mapeamento específico, tenta inferir pela categoria
    return this.inferErrorMapping(errorCode, errorMessage, statusCode);
  }

  /**
   * Infere o mapeamento de erro quando não há mapeamento explícito
   *
   * @param errorCode - Código do erro
   * @param errorMessage - Mensagem do erro
   * @param statusCode - HTTP status code (opcional)
   */
  private static inferErrorMapping(
    errorCode: string,
    errorMessage: string,
    statusCode?: number,
  ): MappedError {
    // Erros 4xx geralmente são permanentes
    if (statusCode && statusCode >= 400 && statusCode < 500) {
      // Exceto 429 (throttling)
      if (statusCode === 429) {
        return {
          code: ErrorCode.SES_THROTTLING,
          category: ErrorCategory.QUOTA_ERROR,
          retryable: true,
          message: 'Taxa de requisições excedida (429)',
          originalCode: errorCode,
          originalMessage: errorMessage,
          metadata: { httpStatusCode: statusCode },
        };
      }

      return {
        code: ErrorCode.SES_MESSAGE_REJECTED,
        category: ErrorCategory.PERMANENT_ERROR,
        retryable: false,
        message: `Erro permanente do SES (${statusCode})`,
        originalCode: errorCode,
        originalMessage: errorMessage,
        metadata: { httpStatusCode: statusCode },
      };
    }

    // Erros 5xx são transientes
    if (statusCode && statusCode >= 500) {
      return {
        code: ErrorCode.SES_SERVICE_UNAVAILABLE,
        category: ErrorCategory.TRANSIENT_ERROR,
        retryable: true,
        message: `Erro transiente do SES (${statusCode})`,
        originalCode: errorCode,
        originalMessage: errorMessage,
        metadata: { httpStatusCode: statusCode },
      };
    }

    // Timeout errors
    if (
      errorCode.toLowerCase().includes('timeout') ||
      errorMessage.toLowerCase().includes('timeout')
    ) {
      return {
        code: ErrorCode.SES_TIMEOUT,
        category: ErrorCategory.TIMEOUT_ERROR,
        retryable: true,
        message: 'Timeout ao comunicar com SES',
        originalCode: errorCode,
        originalMessage: errorMessage,
      };
    }

    // Network errors
    if (
      errorCode.toLowerCase().includes('network') ||
      errorMessage.toLowerCase().includes('network') ||
      errorCode === 'ENOTFOUND' ||
      errorCode === 'ECONNREFUSED'
    ) {
      return {
        code: ErrorCode.NETWORK_ERROR,
        category: ErrorCategory.TRANSIENT_ERROR,
        retryable: true,
        message: 'Erro de rede ao conectar com SES',
        originalCode: errorCode,
        originalMessage: errorMessage,
      };
    }

    // Fallback: erro desconhecido (conservador: não retenta)
    return {
      code: ErrorCode.UNKNOWN_ERROR,
      category: ErrorCategory.PERMANENT_ERROR,
      retryable: false,
      message: `Erro desconhecido: ${errorMessage}`,
      originalCode: errorCode,
      originalMessage: errorMessage,
    };
  }

  /**
   * Mapeia erros de validação para nossa taxonomia
   */
  static mapValidationError(errorMessage: string): MappedError {
    return {
      code: ErrorCode.INVALID_PAYLOAD,
      category: ErrorCategory.VALIDATION_ERROR,
      retryable: false,
      message: errorMessage,
    };
  }

  /**
   * Mapeia erros genéricos para nossa taxonomia
   */
  static mapGenericError(error: unknown): MappedError {
    const errorMessage =
      error instanceof Error ? error.message : String(error);

    return {
      code: ErrorCode.UNKNOWN_ERROR,
      category: ErrorCategory.PERMANENT_ERROR,
      retryable: false,
      message: errorMessage,
      originalMessage: errorMessage,
    };
  }

  /**
   * Determina se um erro deve ser retentado baseado na categoria
   */
  static shouldRetry(error: MappedError): boolean {
    return error.retryable;
  }

  /**
   * Formata um erro para logging (sem informações sensíveis)
   */
  static formatForLogging(error: MappedError): string {
    return `[${error.category}] ${error.code}: ${error.message}${error.originalCode ? ` (original: ${error.originalCode})` : ''}`;
  }
}
