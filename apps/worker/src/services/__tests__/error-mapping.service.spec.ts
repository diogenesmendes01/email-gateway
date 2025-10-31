import { ErrorMappingService } from '../error-mapping.service';

describe('ErrorMappingService', () => {
  describe('mapRateLimitExceeded', () => {
    it('deve criar erro de rate limit com informações corretas', () => {
      const error = ErrorMappingService.mapRateLimitExceeded('gmail.com', 5000);

      expect(error.code).toBe('RATE_LIMIT_EXCEEDED');
      expect(error.category).toBe('RATE_LIMIT');
      expect(error.message).toContain('gmail.com');
      expect(error.message).toContain('5000');
      expect(error.isRetryable).toBe(true);
      expect(error.retryAfterMs).toBe(5000);
    });

    it('deve incluir domínio no metadata', () => {
      const error = ErrorMappingService.mapRateLimitExceeded('example.com', 1000);

      expect(error.metadata).toBeDefined();
      expect(error.metadata?.domain).toBe('example.com');
    });

    it('deve marcar como retryable', () => {
      const error = ErrorMappingService.mapRateLimitExceeded('test.com', 2000);

      expect(error.isRetryable).toBe(true);
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

      expect(error.code).toBe('RATE_LIMIT_EXCEEDED');
      expect(error.category).toBe('RATE_LIMIT');
      expect(error.isRetryable).toBe(true);
    });

    it('deve mapear erro de email inválido', () => {
      const sesError = {
        name: 'InvalidParameterValue',
        message: 'Invalid email address',
        $metadata: {},
      };

      const error = ErrorMappingService.mapSESError(sesError);

      expect(error.code).toBe('INVALID_EMAIL');
      expect(error.category).toBe('VALIDATION');
      expect(error.isRetryable).toBe(false);
    });

    it('deve mapear erro de reputação', () => {
      const sesError = {
        name: 'AccountSendingPausedException',
        message: 'Account sending paused',
        $metadata: {},
      };

      const error = ErrorMappingService.mapSESError(sesError);

      expect(error.code).toBe('REPUTATION_ISSUE');
      expect(error.category).toBe('REPUTATION');
      expect(error.isRetryable).toBe(false);
    });
  });

  describe('mapPostalError', () => {
    it('deve mapear erro de SMTP', () => {
      const postalError = {
        responseCode: 550,
        response: '550 Mailbox not found',
      };

      const error = ErrorMappingService.mapPostalError(postalError);

      expect(error.code).toBe('INVALID_RECIPIENT');
      expect(error.category).toBe('PERMANENT');
      expect(error.isRetryable).toBe(false);
    });

    it('deve mapear erro temporário', () => {
      const postalError = {
        responseCode: 421,
        response: '421 Service not available',
      };

      const error = ErrorMappingService.mapPostalError(postalError);

      expect(error.category).toBe('TEMPORARY');
      expect(error.isRetryable).toBe(true);
    });

    it('deve incluir código de resposta original', () => {
      const postalError = {
        responseCode: 554,
        response: '554 Transaction failed',
      };

      const error = ErrorMappingService.mapPostalError(postalError);

      expect(error.originalCode).toBe('554');
    });
  });

  describe('isRetryable', () => {
    it('deve identificar erros retryable', () => {
      const error = {
        code: 'RATE_LIMIT_EXCEEDED',
        category: 'RATE_LIMIT',
        message: 'Rate limit exceeded',
        isRetryable: true,
      };

      expect(error.isRetryable).toBe(true);
    });

    it('deve identificar erros não-retryable', () => {
      const error = {
        code: 'INVALID_EMAIL',
        category: 'VALIDATION',
        message: 'Invalid email',
        isRetryable: false,
      };

      expect(error.isRetryable).toBe(false);
    });
  });
});
