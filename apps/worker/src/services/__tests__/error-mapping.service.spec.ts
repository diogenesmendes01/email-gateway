/**
 * @email-gateway/worker - Error Mapping Service Tests
 *
 * Tests for SES error mapping and categorization
 */

import { ErrorCode, ErrorCategory } from '@email-gateway/shared';
import { ErrorMappingService, MappedError } from '../error-mapping.service';

describe('ErrorMappingService', () => {
  describe('mapSESError', () => {
    it('should map known SES permanent errors correctly', () => {
      const sesError = {
        code: 'MessageRejected',
        message: 'Email address is not verified',
        name: 'MessageRejected',
      };

      const result = ErrorMappingService.mapSESError(sesError);

      expect(result.code).toBe(ErrorCode.SES_MESSAGE_REJECTED);
      expect(result.category).toBe(ErrorCategory.PERMANENT_ERROR);
      expect(result.retryable).toBe(false);
      expect(result.originalCode).toBe('MessageRejected');
    });

    it('should map known SES transient errors correctly', () => {
      const sesError = {
        code: 'ServiceUnavailable',
        message: 'Service temporarily unavailable',
        name: 'ServiceUnavailable',
      };

      const result = ErrorMappingService.mapSESError(sesError);

      expect(result.code).toBe(ErrorCode.SES_SERVICE_UNAVAILABLE);
      expect(result.category).toBe(ErrorCategory.TRANSIENT_ERROR);
      expect(result.retryable).toBe(true);
    });

    it('should map known SES quota errors correctly', () => {
      const sesError = {
        code: 'Throttling',
        message: 'Rate exceeded',
        name: 'Throttling',
      };

      const result = ErrorMappingService.mapSESError(sesError);

      expect(result.code).toBe(ErrorCode.SES_THROTTLING);
      expect(result.category).toBe(ErrorCategory.QUOTA_ERROR);
      expect(result.retryable).toBe(true);
    });

    it('should infer permanent error from 4xx status codes', () => {
      const sesError = {
        code: 'UnknownError',
        message: 'Bad request',
        $metadata: { httpStatusCode: 400 },
      };

      const result = ErrorMappingService.mapSESError(sesError);

      expect(result.category).toBe(ErrorCategory.PERMANENT_ERROR);
      expect(result.retryable).toBe(false);
      expect(result.metadata?.httpStatusCode).toBe(400);
    });

    it('should infer quota error from 429 status code', () => {
      const sesError = {
        code: 'TooManyRequests',
        message: 'Too many requests',
        $metadata: { httpStatusCode: 429 },
      };

      const result = ErrorMappingService.mapSESError(sesError);

      expect(result.code).toBe(ErrorCode.SES_THROTTLING);
      expect(result.category).toBe(ErrorCategory.QUOTA_ERROR);
      expect(result.retryable).toBe(true);
      expect(result.metadata?.httpStatusCode).toBe(429);
    });

    it('should infer transient error from 5xx status codes', () => {
      const sesError = {
        code: 'InternalServerError',
        message: 'Internal server error',
        $metadata: { httpStatusCode: 500 },
      };

      const result = ErrorMappingService.mapSESError(sesError);

      expect(result.category).toBe(ErrorCategory.TRANSIENT_ERROR);
      expect(result.retryable).toBe(true);
      expect(result.metadata?.httpStatusCode).toBe(500);
    });

    it('should detect timeout errors by error code', () => {
      const sesError = {
        code: 'TimeoutError',
        message: 'Request timed out',
      };

      const result = ErrorMappingService.mapSESError(sesError);

      expect(result.code).toBe(ErrorCode.SES_TIMEOUT);
      expect(result.category).toBe(ErrorCategory.TIMEOUT_ERROR);
      expect(result.retryable).toBe(true);
    });

    it('should detect timeout errors by message content', () => {
      const sesError = {
        code: 'RequestError',
        message: 'Connection timeout after 30s',
      };

      const result = ErrorMappingService.mapSESError(sesError);

      expect(result.code).toBe(ErrorCode.SES_TIMEOUT);
      expect(result.category).toBe(ErrorCategory.TIMEOUT_ERROR);
      expect(result.retryable).toBe(true);
    });

    it('should detect network errors by error code', () => {
      const sesError = {
        code: 'ENOTFOUND',
        message: 'DNS lookup failed',
      };

      const result = ErrorMappingService.mapSESError(sesError);

      expect(result.code).toBe(ErrorCode.NETWORK_ERROR);
      expect(result.category).toBe(ErrorCategory.TRANSIENT_ERROR);
      expect(result.retryable).toBe(true);
    });

    it('should detect network errors by message content', () => {
      const sesError = {
        code: 'NetworkError',
        message: 'Network connection failed',
      };

      const result = ErrorMappingService.mapSESError(sesError);

      expect(result.code).toBe(ErrorCode.NETWORK_ERROR);
      expect(result.category).toBe(ErrorCategory.TRANSIENT_ERROR);
      expect(result.retryable).toBe(true);
    });

    it('should map unknown errors conservatively as permanent', () => {
      const sesError = {
        code: 'CompletelyUnknownError',
        message: 'Something went wrong',
      };

      const result = ErrorMappingService.mapSESError(sesError);

      expect(result.code).toBe(ErrorCode.UNKNOWN_ERROR);
      expect(result.category).toBe(ErrorCategory.PERMANENT_ERROR);
      expect(result.retryable).toBe(false);
      expect(result.message).toContain('Something went wrong');
    });

    it('should handle errors without code property', () => {
      const sesError = {
        name: 'SomeError',
        message: 'Error message',
      };

      const result = ErrorMappingService.mapSESError(sesError);

      expect(result.originalCode).toBe('SomeError');
      expect(result.originalMessage).toBe('Error message');
    });

    it('should handle completely malformed error objects', () => {
      const sesError = {};

      const result = ErrorMappingService.mapSESError(sesError);

      expect(result.code).toBe(ErrorCode.UNKNOWN_ERROR);
      expect(result.category).toBe(ErrorCategory.PERMANENT_ERROR);
      expect(result.retryable).toBe(false);
    });

    it('should handle string errors', () => {
      const sesError = 'Simple error string';

      const result = ErrorMappingService.mapSESError(sesError);

      expect(result.code).toBe(ErrorCode.UNKNOWN_ERROR);
      expect(result.originalCode).toBe('UNKNOWN');
      expect(result.originalMessage).toBe('Unknown error');
    });
  });

  describe('mapValidationError', () => {
    it('should map validation errors correctly', () => {
      const errorMessage = 'Invalid email format';

      const result = ErrorMappingService.mapValidationError(errorMessage);

      expect(result.code).toBe(ErrorCode.INVALID_PAYLOAD);
      expect(result.category).toBe(ErrorCategory.VALIDATION_ERROR);
      expect(result.retryable).toBe(false);
      expect(result.message).toBe(errorMessage);
    });
  });

  describe('mapGenericError', () => {
    it('should map Error instances correctly', () => {
      const error = new Error('Generic error message');

      const result = ErrorMappingService.mapGenericError(error);

      expect(result.code).toBe(ErrorCode.UNKNOWN_ERROR);
      expect(result.category).toBe(ErrorCategory.PERMANENT_ERROR);
      expect(result.retryable).toBe(false);
      expect(result.message).toBe('Generic error message');
    });

    it('should map non-Error values correctly', () => {
      const error = 'String error';

      const result = ErrorMappingService.mapGenericError(error);

      expect(result.code).toBe(ErrorCode.UNKNOWN_ERROR);
      expect(result.category).toBe(ErrorCategory.PERMANENT_ERROR);
      expect(result.retryable).toBe(false);
      expect(result.message).toBe('String error');
    });
  });

  describe('shouldRetry', () => {
    it('should return true for retryable errors', () => {
      const retryableError: MappedError = {
        code: ErrorCode.SES_THROTTLING,
        category: ErrorCategory.QUOTA_ERROR,
        retryable: true,
        message: 'Throttled',
      };

      expect(ErrorMappingService.shouldRetry(retryableError)).toBe(true);
    });

    it('should return false for non-retryable errors', () => {
      const nonRetryableError: MappedError = {
        code: ErrorCode.SES_MESSAGE_REJECTED,
        category: ErrorCategory.PERMANENT_ERROR,
        retryable: false,
        message: 'Rejected',
      };

      expect(ErrorMappingService.shouldRetry(nonRetryableError)).toBe(false);
    });
  });

  describe('formatForLogging', () => {
    it('should format error with original code for logging', () => {
      const error: MappedError = {
        code: ErrorCode.SES_MESSAGE_REJECTED,
        category: ErrorCategory.PERMANENT_ERROR,
        retryable: false,
        message: 'Message was rejected',
        originalCode: 'MessageRejected',
      };

      const formatted = ErrorMappingService.formatForLogging(error);

      expect(formatted).toContain(ErrorCategory.PERMANENT_ERROR);
      expect(formatted).toContain(ErrorCode.SES_MESSAGE_REJECTED);
      expect(formatted).toContain('Message was rejected');
      expect(formatted).toContain('MessageRejected');
    });

    it('should format error without original code for logging', () => {
      const error: MappedError = {
        code: ErrorCode.INVALID_PAYLOAD,
        category: ErrorCategory.VALIDATION_ERROR,
        retryable: false,
        message: 'Invalid payload',
      };

      const formatted = ErrorMappingService.formatForLogging(error);

      expect(formatted).toContain(ErrorCategory.VALIDATION_ERROR);
      expect(formatted).toContain(ErrorCode.INVALID_PAYLOAD);
      expect(formatted).toContain('Invalid payload');
      expect(formatted).not.toContain('original:');
    });
  });

  describe('Error inference edge cases', () => {
    it('should handle ECONNREFUSED as network error', () => {
      const sesError = {
        code: 'ECONNREFUSED',
        message: 'Connection refused',
      };

      const result = ErrorMappingService.mapSESError(sesError);

      expect(result.code).toBe(ErrorCode.NETWORK_ERROR);
      expect(result.category).toBe(ErrorCategory.TRANSIENT_ERROR);
      expect(result.retryable).toBe(true);
    });

    it('should prioritize specific mappings over inference', () => {
      const sesError = {
        code: 'MessageRejected',
        message: 'Message rejected',
        $metadata: { httpStatusCode: 400 },
      };

      const result = ErrorMappingService.mapSESError(sesError);

      // Should use specific mapping, not infer from 400 status
      expect(result.code).toBe(ErrorCode.SES_MESSAGE_REJECTED);
      expect(result.category).toBe(ErrorCategory.PERMANENT_ERROR);
    });

    it('should handle timeout in error message case-insensitively', () => {
      const sesError = {
        code: 'RequestError',
        message: 'TIMEOUT occurred during request',
      };

      const result = ErrorMappingService.mapSESError(sesError);

      expect(result.code).toBe(ErrorCode.SES_TIMEOUT);
      expect(result.category).toBe(ErrorCategory.TIMEOUT_ERROR);
    });

    it('should handle network in error code case-insensitively', () => {
      const sesError = {
        code: 'NETWORK_ERROR',
        message: 'Network issue',
      };

      const result = ErrorMappingService.mapSESError(sesError);

      expect(result.code).toBe(ErrorCode.NETWORK_ERROR);
      expect(result.category).toBe(ErrorCategory.TRANSIENT_ERROR);
    });
  });
});
