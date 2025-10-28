import { Test, TestingModule } from '@nestjs/testing';
import { ReputationMonitorService } from '../reputation-monitor.service';
import { prisma } from '@email-gateway/database';

// Mock prisma
jest.mock('@email-gateway/database', () => ({
  prisma: {
    emailLog: {
      count: jest.fn(),
    },
    company: {
      update: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
    },
  },
}));

describe('ReputationMonitorService - TASK-030', () => {
  let service: ReputationMonitorService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ReputationMonitorService],
    }).compile();

    service = module.get<ReputationMonitorService>(ReputationMonitorService);

    // Reset mocks
    jest.clearAllMocks();
  });

  describe('calculateRates', () => {
    it('should calculate bounce and complaint rates correctly', async () => {
      // Mock: 1000 emails sent, 60 bounces (6%), 2 complaints (0.2%)
      (prisma.emailLog.count as jest.Mock)
        .mockResolvedValueOnce(1000) // totalSent
        .mockResolvedValueOnce(60)   // totalBounces
        .mockResolvedValueOnce(2);   // totalComplaints

      const result = await service.calculateRates('company-123');

      expect(result.totalSent).toBe(1000);
      expect(result.totalBounces).toBe(60);
      expect(result.totalComplaints).toBe(2);
      expect(result.bounceRate).toBe(6); // 6%
      expect(result.complaintRate).toBe(0.2); // 0.2%

      // Verify correct date range (7 days)
      expect(prisma.emailLog.count).toHaveBeenCalledTimes(3);
      const sevenDaysAgo = (prisma.emailLog.count as jest.Mock).mock.calls[0][0].where.sentAt.gte;
      const daysDiff = Math.floor((Date.now() - sevenDaysAgo.getTime()) / (24 * 60 * 60 * 1000));
      expect(daysDiff).toBe(7);
    });

    it('should return zero rates when no emails sent', async () => {
      (prisma.emailLog.count as jest.Mock)
        .mockResolvedValueOnce(0) // totalSent
        .mockResolvedValueOnce(0) // totalBounces
        .mockResolvedValueOnce(0); // totalComplaints

      const result = await service.calculateRates('company-123');

      expect(result.totalSent).toBe(0);
      expect(result.bounceRate).toBe(0);
      expect(result.complaintRate).toBe(0);
    });

    it('should handle database errors gracefully', async () => {
      (prisma.emailLog.count as jest.Mock).mockRejectedValue(new Error('Database error'));

      await expect(
        service.calculateRates('company-123')
      ).rejects.toThrow('Failed to calculate reputation rates');
    });

    it('should query with correct filters for bounces', async () => {
      (prisma.emailLog.count as jest.Mock)
        .mockResolvedValueOnce(100)
        .mockResolvedValueOnce(5)
        .mockResolvedValueOnce(1);

      await service.calculateRates('company-123');

      // Check second call (bounces)
      const bouncesCall = (prisma.emailLog.count as jest.Mock).mock.calls[1][0];
      expect(bouncesCall.where.companyId).toBe('company-123');
      expect(bouncesCall.where.bounceType).toBe('Permanent');
      expect(bouncesCall.where.createdAt.gte).toBeDefined();
    });

    it('should query with correct filters for complaints', async () => {
      (prisma.emailLog.count as jest.Mock)
        .mockResolvedValueOnce(100)
        .mockResolvedValueOnce(5)
        .mockResolvedValueOnce(1);

      await service.calculateRates('company-123');

      // Check third call (complaints)
      const complaintsCall = (prisma.emailLog.count as jest.Mock).mock.calls[2][0];
      expect(complaintsCall.where.companyId).toBe('company-123');
      expect(complaintsCall.where.complaintFeedbackType).toEqual({ not: null });
      expect(complaintsCall.where.createdAt.gte).toBeDefined();
    });
  });

  describe('checkAndSuspend', () => {
    it('should update company metrics cache', async () => {
      (prisma.emailLog.count as jest.Mock)
        .mockResolvedValueOnce(1000) // totalSent
        .mockResolvedValueOnce(10)   // totalBounces (1%)
        .mockResolvedValueOnce(0);   // totalComplaints (0%)

      (prisma.company.update as jest.Mock).mockResolvedValue({});

      await service.checkAndSuspend('company-123');

      expect(prisma.company.update).toHaveBeenCalledWith({
        where: { id: 'company-123' },
        data: {
          bounceRate: 1,
          complaintRate: 0,
          lastMetricsUpdate: expect.any(Date),
        },
      });
    });

    it('should suspend company when bounce rate exceeds threshold', async () => {
      // Mock: 6% bounce rate (threshold is 5%)
      (prisma.emailLog.count as jest.Mock)
        .mockResolvedValueOnce(1000) // totalSent
        .mockResolvedValueOnce(60)   // totalBounces (6%)
        .mockResolvedValueOnce(0);   // totalComplaints

      (prisma.company.update as jest.Mock).mockResolvedValue({});

      await service.checkAndSuspend('company-123');

      // Should be called twice: once for cache update, once for suspension
      expect(prisma.company.update).toHaveBeenCalledTimes(2);

      // Check suspension call
      const suspensionCall = (prisma.company.update as jest.Mock).mock.calls[1][0];
      expect(suspensionCall.data.isSuspended).toBe(true);
      expect(suspensionCall.data.suspensionReason).toContain('High bounce rate');
      expect(suspensionCall.data.suspensionReason).toContain('6.00%');
    });

    it('should suspend company when complaint rate exceeds threshold', async () => {
      // Mock: 0.2% complaint rate (threshold is 0.1%)
      (prisma.emailLog.count as jest.Mock)
        .mockResolvedValueOnce(1000) // totalSent
        .mockResolvedValueOnce(10)   // totalBounces (1%)
        .mockResolvedValueOnce(2);   // totalComplaints (0.2%)

      (prisma.company.update as jest.Mock).mockResolvedValue({});

      await service.checkAndSuspend('company-123');

      // Should be called twice: once for cache update, once for suspension
      expect(prisma.company.update).toHaveBeenCalledTimes(2);

      // Check suspension call
      const suspensionCall = (prisma.company.update as jest.Mock).mock.calls[1][0];
      expect(suspensionCall.data.isSuspended).toBe(true);
      expect(suspensionCall.data.suspensionReason).toContain('High complaint rate');
      expect(suspensionCall.data.suspensionReason).toContain('0.20%');
    });

    it('should not suspend when rates are below thresholds', async () => {
      // Mock: 4% bounce, 0.05% complaint (both below thresholds)
      (prisma.emailLog.count as jest.Mock)
        .mockResolvedValueOnce(1000) // totalSent
        .mockResolvedValueOnce(40)   // totalBounces (4%)
        .mockResolvedValueOnce(0);   // totalComplaints (0%)

      (prisma.company.update as jest.Mock).mockResolvedValue({});

      await service.checkAndSuspend('company-123');

      // Should only update metrics cache, not suspend
      expect(prisma.company.update).toHaveBeenCalledTimes(1);
      expect(prisma.company.update).toHaveBeenCalledWith({
        where: { id: 'company-123' },
        data: {
          bounceRate: 4,
          complaintRate: 0,
          lastMetricsUpdate: expect.any(Date),
        },
      });
    });

    it('should not throw error on failure', async () => {
      (prisma.emailLog.count as jest.Mock).mockRejectedValue(new Error('Database error'));

      // Should not throw
      await expect(
        service.checkAndSuspend('company-123')
      ).resolves.not.toThrow();
    });
  });

  describe('monitorAllCompanies', () => {
    it('should monitor all active and non-suspended companies', async () => {
      const mockCompanies = [
        { id: 'company-1', name: 'Company 1' },
        { id: 'company-2', name: 'Company 2' },
        { id: 'company-3', name: 'Company 3' },
      ];

      (prisma.company.findMany as jest.Mock).mockResolvedValue(mockCompanies);
      (prisma.company.findUnique as jest.Mock).mockResolvedValue({ isSuspended: false });
      (prisma.emailLog.count as jest.Mock)
        .mockResolvedValue(100); // Safe metrics for all
      (prisma.company.update as jest.Mock).mockResolvedValue({});

      await service.monitorAllCompanies();

      expect(prisma.company.findMany).toHaveBeenCalledWith({
        where: {
          isActive: true,
          isSuspended: false,
        },
        select: {
          id: true,
          name: true,
        },
      });

      // Should check each company (3 companies × 3 queries each = 9)
      expect(prisma.emailLog.count).toHaveBeenCalledTimes(9);
    });

    it('should continue monitoring even if one company fails', async () => {
      const mockCompanies = [
        { id: 'company-1', name: 'Company 1' },
        { id: 'company-2', name: 'Company 2' }, // This will fail
        { id: 'company-3', name: 'Company 3' },
      ];

      (prisma.company.findMany as jest.Mock).mockResolvedValue(mockCompanies);
      (prisma.company.findUnique as jest.Mock).mockResolvedValue({ isSuspended: false });

      // First company succeeds
      (prisma.emailLog.count as jest.Mock)
        .mockResolvedValueOnce(100)
        .mockResolvedValueOnce(1)
        .mockResolvedValueOnce(0)
        // Second company fails
        .mockRejectedValueOnce(new Error('Database error'))
        // Third company succeeds
        .mockResolvedValueOnce(100)
        .mockResolvedValueOnce(1)
        .mockResolvedValueOnce(0);

      (prisma.company.update as jest.Mock).mockResolvedValue({});

      // Should not throw
      await expect(service.monitorAllCompanies()).resolves.not.toThrow();

      // Should still have processed company-1 and company-3
      expect(prisma.company.update).toHaveBeenCalledTimes(2);
    });

    it('should handle empty company list', async () => {
      (prisma.company.findMany as jest.Mock).mockResolvedValue([]);

      await service.monitorAllCompanies();

      expect(prisma.emailLog.count).not.toHaveBeenCalled();
      expect(prisma.company.update).not.toHaveBeenCalled();
    });

    it('should not throw if findMany fails', async () => {
      (prisma.company.findMany as jest.Mock).mockRejectedValue(new Error('Database error'));

      await expect(service.monitorAllCompanies()).resolves.not.toThrow();
    });
  });

  describe('getCompanyMetrics', () => {
    it('should return current metrics for a company', async () => {
      (prisma.emailLog.count as jest.Mock)
        .mockResolvedValueOnce(1000)
        .mockResolvedValueOnce(50)
        .mockResolvedValueOnce(1);

      const result = await service.getCompanyMetrics('company-123');

      expect(result.totalSent).toBe(1000);
      expect(result.totalBounces).toBe(50);
      expect(result.totalComplaints).toBe(1);
      expect(result.bounceRate).toBe(5);
      expect(result.complaintRate).toBe(0.1);
    });
  });
});
