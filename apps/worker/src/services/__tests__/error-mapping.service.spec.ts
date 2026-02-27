import { ErrorMappingService } from '../error-mapping.service';

describe('ErrorMappingService', () => {
  describe('mapRateLimitExceeded', () => {
    it('deve criar erro de rate limit com informações corretas', () => {
      const error = ErrorMappingService.mapRateLimitExceeded('gmail.com', 5000);

      expect(error.code).toBe('SES_THROTTLING');
      expect(error.category).toBe('QUOTA_ERROR');
      expect(error.message).toContain('gmail.com');
      expect(error.retryable).toBe(true);
      expect(error.metadata?.retryAfterMs).toBe(5000);
    });

    it('deve incluir domínio no metadata', () => {
      const error = ErrorMappingService.mapRateLimitExceeded('example.com', 1000);

      expect(error.metadata).toBeDefined();
      expect(error.metadata?.domain).toBe('example.com');
    });

    it('deve marcar como retryable', () => {
      const error = ErrorMappingService.mapRateLimitExceeded('test.com', 2000);

      expect(error.retryable).toBe(true);
    });
  });

  describe('mapSESError', () => {
    it('deve mapear erro de throttling', () => {
      const sesError = {
        name: 'Throttling',
        message: 'Rate exceeded',
        $metadata: {},
      };

      const error = ErrorMappingService.mapSESError(sesError);

      expect(error.code).toBe('SES_THROTTLING');
      expect(error.category).toBe('QUOTA_ERROR');
      expect(error.retryable).toBe(true);
    });

    it('deve mapear erro de mensagem rejeitada', () => {
      const sesError = {
        name: 'MessageRejected',
        message: 'Message rejected',
        $metadata: {},
      };

      const error = ErrorMappingService.mapSESError(sesError);

      expect(error.code).toBe('SES_MESSAGE_REJECTED');
      expect(error.category).toBe('PERMANENT_ERROR');
      expect(error.retryable).toBe(false);
    });

    it('deve mapear erro de conta pausada', () => {
      const sesError = {
        name: 'AccountSendingPausedException',
        message: 'Account sending paused',
        $metadata: {},
      };

      const error = ErrorMappingService.mapSESError(sesError);

      expect(error.code).toBe('SES_ACCOUNT_SENDING_PAUSED');
      expect(error.category).toBe('PERMANENT_ERROR');
      expect(error.retryable).toBe(false);
    });

    it('deve mapear erro desconhecido para fallback', () => {
      const sesError = {
        name: 'SomeUnknownError',
        message: 'Something went wrong',
        $metadata: {},
      };

      const error = ErrorMappingService.mapSESError(sesError);

      expect(error.code).toBe('UNKNOWN_ERROR');
      expect(error.category).toBe('PERMANENT_ERROR');
      expect(error.retryable).toBe(false);
      expect(error.originalCode).toBe('SomeUnknownError');
    });
  });

  describe('mapGenericError', () => {
    it('deve mapear erro genérico', () => {
      const error = ErrorMappingService.mapGenericError(new Error('SMTP error'));

      expect(error.code).toBe('UNKNOWN_ERROR');
      expect(error.category).toBe('PERMANENT_ERROR');
      expect(error.retryable).toBe(false);
      expect(error.message).toContain('SMTP error');
    });

    it('deve mapear string como erro', () => {
      const error = ErrorMappingService.mapGenericError('string error');

      expect(error.code).toBe('UNKNOWN_ERROR');
      expect(error.message).toContain('string error');
    });
  });

  describe('mapValidationError', () => {
    it('deve mapear erro de validação', () => {
      const error = ErrorMappingService.mapValidationError('Campo obrigatório');

      expect(error.code).toBe('INVALID_PAYLOAD');
      expect(error.category).toBe('VALIDATION_ERROR');
      expect(error.retryable).toBe(false);
      expect(error.message).toBe('Campo obrigatório');
    });
  });

  describe('shouldRetry', () => {
    it('deve retornar true para erros retryable', () => {
      const error = ErrorMappingService.mapRateLimitExceeded('test.com', 1000);
      expect(ErrorMappingService.shouldRetry(error)).toBe(true);
    });

    it('deve retornar false para erros não-retryable', () => {
      const error = ErrorMappingService.mapValidationError('invalid');
      expect(ErrorMappingService.shouldRetry(error)).toBe(false);
    });
  });

  describe('formatForLogging', () => {
    it('deve formatar erro com código original', () => {
      const sesError = { name: 'Throttling', message: 'Rate exceeded', $metadata: {} };
      const error = ErrorMappingService.mapSESError(sesError);
      const formatted = ErrorMappingService.formatForLogging(error);

      expect(formatted).toContain('QUOTA_ERROR');
      expect(formatted).toContain('SES_THROTTLING');
      expect(formatted).toContain('Throttling');
    });

    it('deve formatar erro sem código original', () => {
      const error = ErrorMappingService.mapValidationError('Campo inválido');
      const formatted = ErrorMappingService.formatForLogging(error);

      expect(formatted).toContain('VALIDATION_ERROR');
      expect(formatted).toContain('INVALID_PAYLOAD');
    });
  });
});
