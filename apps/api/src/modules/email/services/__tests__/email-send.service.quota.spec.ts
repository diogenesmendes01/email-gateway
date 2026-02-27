import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { EmailSendService } from '../email-send.service';
import { QueueService } from '../../../queue/queue.service';
import { MetricsService } from '../../../metrics/metrics.service';
import { ContentValidationService } from '../content-validation.service';
import { DailyQuotaService, QuotaResult } from '../daily-quota.service';
import { prisma } from '@email-gateway/database';

// Mock services
jest.mock('../../../queue/queue.service');
jest.mock('../../../metrics/metrics.service');
jest.mock('../content-validation.service');
jest.mock('../daily-quota.service');
jest.mock('@email-gateway/database', () => ({
  prisma: {
    emailOutbox: {
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    recipient: {
      upsert: jest.fn(),
      findUnique: jest.fn(),
    },
    recipientBlocklist: {
      findUnique: jest.fn(),
    },
    idempotencyKey: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
  },
}));

describe('EmailSendService - Quota Integration (TASK-038)', () => {
  let service: EmailSendService;
  let queueService: any;
  let metricsService: any;
  let contentValidationService: any;
  let dailyQuotaService: any;

  const mockCompanyId = 'company-123';
  const mockRequestId = 'req-456';

  const mockEmailBody = {
    to: 'test@example.com',
    subject: 'Test Subject',
    html: '<p>Test content</p>',
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmailSendService,
        {
          provide: QueueService,
          useValue: {
            enqueueEmailJob: jest.fn(),
          },
        },
        {
          provide: MetricsService,
          useValue: {
            recordEmailSent: jest.fn(),
            recordEmailFailed: jest.fn(),
            recordEmailSendDuration: jest.fn(),
            recordQuotaExceeded: jest.fn(),
            recordEncryptionLatency: jest.fn(),
          },
        },
        {
          provide: ContentValidationService,
          useValue: {
            validateEmail: jest.fn(),
          },
        },
        {
          provide: DailyQuotaService,
          useValue: {
            checkQuota: jest.fn(),
            incrementQuota: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<EmailSendService>(EmailSendService);
    queueService = module.get(QueueService);
    metricsService = module.get(MetricsService);
    contentValidationService = module.get(ContentValidationService);
    dailyQuotaService = module.get(DailyQuotaService);

    // Setup default mocks
    jest.clearAllMocks();

    // Mock successful content validation
    contentValidationService.validateEmail.mockResolvedValue({
      valid: true,
      score: 0.8,
      errors: [],
      warnings: [],
    });

    // Mock successful queue enqueue
    queueService.enqueueEmailJob.mockResolvedValue('job-123');

    // Mock successful quota check
    const mockQuotaResult: QuotaResult = {
      allowed: true,
      current: 50,
      limit: 1000,
      resetsAt: '2025-01-01T00:00:00.000Z',
    };
    dailyQuotaService.checkQuota.mockResolvedValue(mockQuotaResult);

    // Mock successful quota increment
    dailyQuotaService.incrementQuota.mockResolvedValue(undefined);

    // Mock database operations
    (prisma.emailOutbox.create as jest.Mock).mockResolvedValue({
      id: 'outbox-123',
      recipientId: null,
    });
    (prisma.emailOutbox.update as jest.Mock).mockResolvedValue({
      id: 'outbox-123',
      status: 'ENQUEUED',
      jobId: 'job-123',
    });
    (prisma.recipientBlocklist.findUnique as jest.Mock).mockResolvedValue(null);
    (prisma.idempotencyKey.findUnique as jest.Mock).mockResolvedValue(null);
  });

  describe('Quota validation', () => {
    it('should allow sending when quota is available', async () => {
      // Arrange
      const quotaResult: QuotaResult = {
        allowed: true,
        current: 100,
        limit: 1000,
        resetsAt: '2025-01-01T00:00:00.000Z',
      };
      dailyQuotaService.checkQuota.mockResolvedValue(quotaResult);

      // Act
      const result = await service.sendEmail({
        companyId: mockCompanyId,
        body: mockEmailBody,
        requestId: mockRequestId,
      });

      // Assert
      expect(dailyQuotaService.checkQuota).toHaveBeenCalledWith(mockCompanyId);
      expect(dailyQuotaService.incrementQuota).toHaveBeenCalledWith(mockCompanyId);
      expect(result).toBeDefined();
      expect(result.outboxId).toBeDefined();
    });

    it('should block sending when quota is exceeded', async () => {
      // Arrange
      const quotaResult: QuotaResult = {
        allowed: false,
        current: 1000,
        limit: 1000,
        resetsAt: '2025-01-01T00:00:00.000Z',
        reason: 'Daily quota exceeded',
      };
      dailyQuotaService.checkQuota.mockResolvedValue(quotaResult);

      // Act & Assert
      await expect(
        service.sendEmail({
          companyId: mockCompanyId,
          body: mockEmailBody,
          requestId: mockRequestId,
        })
      ).rejects.toThrow(BadRequestException);

      expect(dailyQuotaService.checkQuota).toHaveBeenCalledWith(mockCompanyId);
      expect(dailyQuotaService.incrementQuota).not.toHaveBeenCalled();
      expect(queueService.enqueueEmailJob).not.toHaveBeenCalled();
    });

    it('should block sending when company is suspended', async () => {
      // Arrange
      const quotaResult: QuotaResult = {
        allowed: false,
        current: 0,
        limit: 1000,
        resetsAt: '2025-01-01T00:00:00.000Z',
        reason: 'Company suspended',
      };
      dailyQuotaService.checkQuota.mockResolvedValue(quotaResult);

      // Act & Assert
      await expect(
        service.sendEmail({
          companyId: mockCompanyId,
          body: mockEmailBody,
          requestId: mockRequestId,
        })
      ).rejects.toThrow(BadRequestException);

      expect(dailyQuotaService.checkQuota).toHaveBeenCalledWith(mockCompanyId);
      expect(dailyQuotaService.incrementQuota).not.toHaveBeenCalled();
    });

    it('should increment quota after successful enqueue', async () => {
      // Arrange
      const quotaResult: QuotaResult = {
        allowed: true,
        current: 99,
        limit: 1000,
        resetsAt: '2025-01-01T00:00:00.000Z',
      };
      dailyQuotaService.checkQuota.mockResolvedValue(quotaResult);

      // Act
      await service.sendEmail({
        companyId: mockCompanyId,
        body: mockEmailBody,
        requestId: mockRequestId,
      });

      // Assert
      expect(dailyQuotaService.incrementQuota).toHaveBeenCalledWith(mockCompanyId);
      expect(dailyQuotaService.incrementQuota).toHaveBeenCalledTimes(1);
    });

    it('should not increment quota if enqueue fails', async () => {
      // Arrange
      const quotaResult: QuotaResult = {
        allowed: true,
        current: 99,
        limit: 1000,
        resetsAt: '2025-01-01T00:00:00.000Z',
      };
      dailyQuotaService.checkQuota.mockResolvedValue(quotaResult);

      // Make queue enqueue fail
      queueService.enqueueEmailJob.mockRejectedValue(new Error('Queue unavailable'));

      // Act & Assert
      await expect(
        service.sendEmail({
          companyId: mockCompanyId,
          body: mockEmailBody,
          requestId: mockRequestId,
        })
      ).rejects.toThrow();

      expect(dailyQuotaService.incrementQuota).not.toHaveBeenCalled();
    });

    it('should log quota exceeded with structured logging', async () => {
      // Arrange
      const quotaResult: QuotaResult = {
        allowed: false,
        current: 1000,
        limit: 1000,
        resetsAt: '2025-01-01T00:00:00.000Z',
        reason: 'Daily quota exceeded',
      };
      dailyQuotaService.checkQuota.mockResolvedValue(quotaResult);

      const loggerSpy = jest.spyOn(service['logger'], 'warn');

      // Act
      try {
        await service.sendEmail({
          companyId: mockCompanyId,
          body: mockEmailBody,
          requestId: mockRequestId,
        });
      } catch (error) {
        // Expected to throw
      }

      // Assert
      expect(loggerSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Daily quota exceeded, email send rejected',
          companyId: mockCompanyId,
          current: 1000,
          limit: 1000,
          resetsAt: '2025-01-01T00:00:00.000Z',
          reason: 'Daily quota exceeded',
          requestId: mockRequestId,
        })
      );
    });
  });
});
