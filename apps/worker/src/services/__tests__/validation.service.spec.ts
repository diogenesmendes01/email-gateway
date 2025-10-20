/**
 * @email-gateway/worker - Validation Service Tests
 *
 * Tests for all validation functions in the pipeline
 */

import { PrismaClient } from '@email-gateway/database';
import {
  ValidationType,
  ErrorCode,
  EmailSendJobData,
} from '@email-gateway/shared';
import { ValidationService } from '../validation.service';

// Mock Prisma Client
jest.mock('@email-gateway/database', () => ({
  PrismaClient: jest.fn().mockImplementation(() => ({
    emailOutbox: {
      findUnique: jest.fn(),
    },
    recipient: {
      findUnique: jest.fn(),
    },
  })),
}));

describe('ValidationService', () => {
  let validationService: ValidationService;
  let mockPrisma: jest.Mocked<PrismaClient>;

  beforeEach(() => {
    mockPrisma = new PrismaClient() as jest.Mocked<PrismaClient>;
    validationService = new ValidationService(mockPrisma);
    jest.clearAllMocks();
  });

  describe('validateIntegrity', () => {
    it('should pass validation for valid job data', async () => {
      const validJobData: EmailSendJobData = {
        outboxId: '123e4567-e89b-12d3-a456-426614174000',
        companyId: '123e4567-e89b-12d3-a456-426614174001',
        recipient: {
          email: 'test@example.com',
          recipientId: '123e4567-e89b-12d3-a456-426614174002',
        },
        subject: 'Test Email',
        htmlRef: 'test-ref',
        requestId: 'req-123',
        to: 'test@example.com',
        attempt: 1,
        enqueuedAt: new Date().toISOString(),
      };

      const result = await validationService.validateIntegrity(validJobData);

      expect(result.type).toBe(ValidationType.INTEGRITY);
      expect(result.success).toBe(true);
    });

    it('should fail validation for invalid payload (missing fields)', async () => {
      const invalidJobData = {
        outboxId: '123e4567-e89b-12d3-a456-426614174000',
        // Missing required fields
      };

      const result =
        await validationService.validateIntegrity(invalidJobData);

      expect(result.type).toBe(ValidationType.INTEGRITY);
      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(ErrorCode.INVALID_PAYLOAD);
      expect(result.error).toBeDefined();
    });

    it('should fail validation for invalid UUID format', async () => {
      const invalidJobData = {
        outboxId: 'invalid-uuid',
        companyId: '123e4567-e89b-12d3-a456-426614174001',
        recipient: {
          email: 'test@example.com',
        },
        subject: 'Test Email',
        htmlRef: 'test-ref',
      };

      const result =
        await validationService.validateIntegrity(invalidJobData);

      expect(result.type).toBe(ValidationType.INTEGRITY);
      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(ErrorCode.INVALID_PAYLOAD);
    });
  });

  describe('validateOutbox', () => {
    const validJobData: EmailSendJobData = {
      outboxId: '123e4567-e89b-12d3-a456-426614174000',
      companyId: '123e4567-e89b-12d3-a456-426614174001',
      recipient: {
        email: 'test@example.com',
      },
      subject: 'Test Email',
      htmlRef: 'test-ref',
      requestId: 'req-123',
      to: 'test@example.com',
      attempt: 1,
      enqueuedAt: new Date().toISOString(),
    };

    it('should pass validation when outbox exists with matching companyId', async () => {
      (mockPrisma.emailOutbox.findUnique as jest.Mock).mockResolvedValue({
        id: validJobData.outboxId,
        companyId: validJobData.companyId,
        status: 'PENDING',
      });

      const result = await validationService.validateOutbox(validJobData);

      expect(result.type).toBe(ValidationType.OUTBOX);
      expect(result.success).toBe(true);
      expect(result.metadata?.outboxId).toBe(validJobData.outboxId);
    });

    it('should fail validation when outbox not found', async () => {
      (mockPrisma.emailOutbox.findUnique as jest.Mock).mockResolvedValue(null);

      const result = await validationService.validateOutbox(validJobData);

      expect(result.type).toBe(ValidationType.OUTBOX);
      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(ErrorCode.OUTBOX_NOT_FOUND);
      expect(result.error).toContain('não encontrado');
    });

    it('should fail validation when companyId mismatch', async () => {
      (mockPrisma.emailOutbox.findUnique as jest.Mock).mockResolvedValue({
        id: validJobData.outboxId,
        companyId: 'different-company-id',
        status: 'PENDING',
      });

      const result = await validationService.validateOutbox(validJobData);

      expect(result.type).toBe(ValidationType.OUTBOX);
      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(ErrorCode.INVALID_PAYLOAD);
      expect(result.error).toContain('não coincide');
    });

    it('should handle database errors gracefully', async () => {
      (mockPrisma.emailOutbox.findUnique as jest.Mock).mockRejectedValue(
        new Error('Database connection error'),
      );

      const result = await validationService.validateOutbox(validJobData);

      expect(result.type).toBe(ValidationType.OUTBOX);
      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(ErrorCode.OUTBOX_NOT_FOUND);
    });
  });

  describe('validateRecipient', () => {
    const validJobData: EmailSendJobData = {
      outboxId: '123e4567-e89b-12d3-a456-426614174000',
      companyId: '123e4567-e89b-12d3-a456-426614174001',
      recipient: {
        email: 'test@example.com',
        recipientId: '123e4567-e89b-12d3-a456-426614174002',
      },
      subject: 'Test Email',
      htmlRef: 'test-ref',
      requestId: 'req-123',
      to: 'test@example.com',
      attempt: 1,
      enqueuedAt: new Date().toISOString(),
    };

    it('should pass validation for valid recipient with recipientId', async () => {
      (mockPrisma.recipient.findUnique as jest.Mock).mockResolvedValue({
        id: validJobData.recipient.recipientId,
        companyId: validJobData.companyId,
        email: validJobData.recipient.email,
        deletedAt: null,
      });

      const result = await validationService.validateRecipient(validJobData);

      expect(result.type).toBe(ValidationType.RECIPIENT);
      expect(result.success).toBe(true);
    });

    it('should pass validation for valid email without recipientId', async () => {
      const jobDataWithoutRecipientId = {
        ...validJobData,
        recipient: {
          email: 'test@example.com',
        },
      };

      const result = await validationService.validateRecipient(
        jobDataWithoutRecipientId,
      );

      expect(result.type).toBe(ValidationType.RECIPIENT);
      expect(result.success).toBe(true);
    });

    it('should fail validation for invalid email format', async () => {
      const invalidEmailData = {
        ...validJobData,
        recipient: {
          email: 'invalid-email',
        },
      };

      const result =
        await validationService.validateRecipient(invalidEmailData);

      expect(result.type).toBe(ValidationType.RECIPIENT);
      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(ErrorCode.INVALID_EMAIL);
    });

    it('should fail validation when recipient not found in database', async () => {
      (mockPrisma.recipient.findUnique as jest.Mock).mockResolvedValue(null);

      const result = await validationService.validateRecipient(validJobData);

      expect(result.type).toBe(ValidationType.RECIPIENT);
      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(ErrorCode.RECIPIENT_NOT_FOUND);
    });

    it('should fail validation when recipient is soft deleted', async () => {
      (mockPrisma.recipient.findUnique as jest.Mock).mockResolvedValue({
        id: validJobData.recipient.recipientId,
        companyId: validJobData.companyId,
        email: validJobData.recipient.email,
        deletedAt: new Date(),
      });

      const result = await validationService.validateRecipient(validJobData);

      expect(result.type).toBe(ValidationType.RECIPIENT);
      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(ErrorCode.RECIPIENT_NOT_FOUND);
      expect(result.error).toContain('deletado');
    });

    it('should fail validation when companyId mismatch', async () => {
      (mockPrisma.recipient.findUnique as jest.Mock).mockResolvedValue({
        id: validJobData.recipient.recipientId,
        companyId: 'different-company-id',
        email: validJobData.recipient.email,
        deletedAt: null,
      });

      const result = await validationService.validateRecipient(validJobData);

      expect(result.type).toBe(ValidationType.RECIPIENT);
      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(ErrorCode.INVALID_PAYLOAD);
    });

    it('should fail validation when email mismatch with database', async () => {
      (mockPrisma.recipient.findUnique as jest.Mock).mockResolvedValue({
        id: validJobData.recipient.recipientId,
        companyId: validJobData.companyId,
        email: 'different@example.com',
        deletedAt: null,
      });

      const result = await validationService.validateRecipient(validJobData);

      expect(result.type).toBe(ValidationType.RECIPIENT);
      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(ErrorCode.INVALID_EMAIL);
      expect(result.error).toContain('não coincide');
    });
  });

  describe('validateTemplate', () => {
    const validJobData: EmailSendJobData = {
      outboxId: '123e4567-e89b-12d3-a456-426614174000',
      companyId: '123e4567-e89b-12d3-a456-426614174001',
      recipient: {
        email: 'test@example.com',
      },
      subject: 'Test Email',
      htmlRef: 'test-ref',
      requestId: 'req-123',
      to: 'test@example.com',
      attempt: 1,
      enqueuedAt: new Date().toISOString(),
    };

    it('should pass validation for valid HTML template', async () => {
      const validHtml = '<html><body><h1>Hello World</h1></body></html>';

      (mockPrisma.emailOutbox.findUnique as jest.Mock).mockResolvedValue({
        html: validHtml,
      });

      const result = await validationService.validateTemplate(validJobData);

      expect(result.type).toBe(ValidationType.TEMPLATE);
      expect(result.success).toBe(true);
    });

    it('should fail validation when HTML not found in outbox', async () => {
      (mockPrisma.emailOutbox.findUnique as jest.Mock).mockResolvedValue(null);

      const result = await validationService.validateTemplate(validJobData);

      expect(result.type).toBe(ValidationType.TEMPLATE);
      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(ErrorCode.INVALID_TEMPLATE);
      expect(result.error).toContain('não encontrado');
    });

    it('should fail validation for empty HTML', async () => {
      (mockPrisma.emailOutbox.findUnique as jest.Mock).mockResolvedValue({
        html: '   ',
      });

      const result = await validationService.validateTemplate(validJobData);

      expect(result.type).toBe(ValidationType.TEMPLATE);
      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(ErrorCode.INVALID_TEMPLATE);
      expect(result.error).toContain('vazio');
    });

    it('should fail validation for HTML containing script tags', async () => {
      const maliciousHtml =
        '<html><body><script>alert("xss")</script></body></html>';

      (mockPrisma.emailOutbox.findUnique as jest.Mock).mockResolvedValue({
        html: maliciousHtml,
      });

      const result = await validationService.validateTemplate(validJobData);

      expect(result.type).toBe(ValidationType.TEMPLATE);
      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(ErrorCode.INVALID_TEMPLATE);
      expect(result.error).toContain('inseguro');
    });

    it('should fail validation for HTML containing javascript: URLs', async () => {
      const maliciousHtml =
        '<html><body><a href="javascript:alert(1)">Click</a></body></html>';

      (mockPrisma.emailOutbox.findUnique as jest.Mock).mockResolvedValue({
        html: maliciousHtml,
      });

      const result = await validationService.validateTemplate(validJobData);

      expect(result.type).toBe(ValidationType.TEMPLATE);
      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(ErrorCode.INVALID_TEMPLATE);
    });

    it('should fail validation for HTML containing event handlers', async () => {
      const maliciousHtml =
        '<html><body><div onclick="alert(1)">Click</div></body></html>';

      (mockPrisma.emailOutbox.findUnique as jest.Mock).mockResolvedValue({
        html: maliciousHtml,
      });

      const result = await validationService.validateTemplate(validJobData);

      expect(result.type).toBe(ValidationType.TEMPLATE);
      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(ErrorCode.INVALID_TEMPLATE);
    });

    it('should fail validation for subject exceeding max length', async () => {
      const longSubject = 'a'.repeat(1000);
      const jobDataWithLongSubject = {
        ...validJobData,
        subject: longSubject,
      };

      (mockPrisma.emailOutbox.findUnique as jest.Mock).mockResolvedValue({
        html: '<html><body>Valid HTML</body></html>',
      });

      const result = await validationService.validateTemplate(
        jobDataWithLongSubject,
      );

      expect(result.type).toBe(ValidationType.TEMPLATE);
      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(ErrorCode.INVALID_TEMPLATE);
      expect(result.error).toContain('Subject');
    });
  });

  describe('validateAll', () => {
    const validJobData: EmailSendJobData = {
      outboxId: '123e4567-e89b-12d3-a456-426614174000',
      companyId: '123e4567-e89b-12d3-a456-426614174001',
      recipient: {
        email: 'test@example.com',
        recipientId: '123e4567-e89b-12d3-a456-426614174002',
      },
      subject: 'Test Email',
      htmlRef: 'test-ref',
      requestId: 'req-123',
      to: 'test@example.com',
      attempt: 1,
      enqueuedAt: new Date().toISOString(),
    };

    it('should run all validations when data is valid', async () => {
      (mockPrisma.emailOutbox.findUnique as jest.Mock).mockResolvedValue({
        id: validJobData.outboxId,
        companyId: validJobData.companyId,
        status: 'PENDING',
        html: '<html><body>Test</body></html>',
      });

      (mockPrisma.recipient.findUnique as jest.Mock).mockResolvedValue({
        id: validJobData.recipient.recipientId,
        companyId: validJobData.companyId,
        email: validJobData.recipient.email,
        deletedAt: null,
      });

      const results = await validationService.validateAll(validJobData);

      expect(results).toHaveLength(4);
      expect(results[0].type).toBe(ValidationType.INTEGRITY);
      expect(results[1].type).toBe(ValidationType.OUTBOX);
      expect(results[2].type).toBe(ValidationType.RECIPIENT);
      expect(results[3].type).toBe(ValidationType.TEMPLATE);
      expect(results.every((r) => r.success)).toBe(true);
    });

    it('should stop after integrity validation fails', async () => {
      const invalidJobData = { invalid: 'data' };

      const results = await validationService.validateAll(invalidJobData);

      expect(results).toHaveLength(1);
      expect(results[0].type).toBe(ValidationType.INTEGRITY);
      expect(results[0].success).toBe(false);
    });
  });

  describe('Helper methods', () => {
    it('allValidationsPassed should return true when all validations passed', () => {
      const results = [
        { type: ValidationType.INTEGRITY, success: true },
        { type: ValidationType.OUTBOX, success: true },
        { type: ValidationType.RECIPIENT, success: true },
        { type: ValidationType.TEMPLATE, success: true },
      ];

      expect(ValidationService.allValidationsPassed(results)).toBe(true);
    });

    it('allValidationsPassed should return false when any validation failed', () => {
      const results = [
        { type: ValidationType.INTEGRITY, success: true },
        { type: ValidationType.OUTBOX, success: false, error: 'Error' },
        { type: ValidationType.RECIPIENT, success: true },
      ];

      expect(ValidationService.allValidationsPassed(results)).toBe(false);
    });

    it('getFirstFailure should return the first failed validation', () => {
      const results = [
        { type: ValidationType.INTEGRITY, success: true },
        {
          type: ValidationType.OUTBOX,
          success: false,
          error: 'Outbox error',
        },
        {
          type: ValidationType.RECIPIENT,
          success: false,
          error: 'Recipient error',
        },
      ];

      const firstFailure = ValidationService.getFirstFailure(results);

      expect(firstFailure).toBeDefined();
      expect(firstFailure?.type).toBe(ValidationType.OUTBOX);
      expect(firstFailure?.error).toBe('Outbox error');
    });

    it('getFirstFailure should return undefined when all passed', () => {
      const results = [
        { type: ValidationType.INTEGRITY, success: true },
        { type: ValidationType.OUTBOX, success: true },
      ];

      const firstFailure = ValidationService.getFirstFailure(results);

      expect(firstFailure).toBeUndefined();
    });
  });
});
