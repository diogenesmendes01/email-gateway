/**
 * @email-gateway/api - Sandbox Monitor Service Tests
 *
 * TASK-034: Tests for auto-approval system
 */

import { Test, TestingModule } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import { SandboxMonitorService } from '../sandbox-monitor.service';
import { prisma } from '@email-gateway/database';

// Mock Prisma
jest.mock('@email-gateway/database', () => ({
  prisma: {
    company: {
      findMany: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
  },
}));

describe('SandboxMonitorService - TASK-034', () => {
  let service: SandboxMonitorService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [SandboxMonitorService],
    }).compile();

    service = module.get<SandboxMonitorService>(SandboxMonitorService);

    // Mock Logger to avoid console output during tests
    jest.spyOn(Logger.prototype, 'log').mockImplementation();
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    jest.spyOn(Logger.prototype, 'error').mockImplementation();
    jest.spyOn(Logger.prototype, 'debug').mockImplementation();

    // Reset mocks before each test
    jest.clearAllMocks();
  });

  describe('checkAutoApproval', () => {
    it('should auto-approve eligible companies', async () => {
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);

      const mockCandidates = [
        {
          id: 'company-1',
          name: 'Eligible Company 1',
          createdAt: tenDaysAgo,
          bounceRate: 0.5,
          complaintRate: 0.01,
          _count: {
            emailOutbox: 100, // Above minimum of 50
          },
        },
        {
          id: 'company-2',
          name: 'Eligible Company 2',
          createdAt: sevenDaysAgo,
          bounceRate: 1.5,
          complaintRate: 0.03,
          _count: {
            emailOutbox: 75,
          },
        },
      ];

      (prisma.company.findMany as jest.Mock).mockResolvedValue(mockCandidates);
      (prisma.company.update as jest.Mock).mockResolvedValue({});

      await service.checkAutoApproval();

      // Should find candidates with correct criteria
      expect(prisma.company.findMany).toHaveBeenCalledWith({
        where: {
          isApproved: false,
          isActive: true,
          isSuspended: false,
          createdAt: expect.objectContaining({
            lte: expect.any(Date),
          }),
          bounceRate: { lt: 2.0 },
          complaintRate: { lt: 0.05 },
        },
        select: expect.objectContaining({
          id: true,
          name: true,
          createdAt: true,
          bounceRate: true,
          complaintRate: true,
        }),
      });

      // Should approve both companies (both have >= 50 emails)
      expect(prisma.company.update).toHaveBeenCalledTimes(2);

      // Check first company approval
      expect(prisma.company.update).toHaveBeenCalledWith({
        where: { id: 'company-1' },
        data: {
          isApproved: true,
          approvedAt: expect.any(Date),
          approvedBy: 'AUTO_APPROVAL_SYSTEM',
          dailyEmailLimit: 5000,
        },
      });

      // Check second company approval
      expect(prisma.company.update).toHaveBeenCalledWith({
        where: { id: 'company-2' },
        data: {
          isApproved: true,
          approvedAt: expect.any(Date),
          approvedBy: 'AUTO_APPROVAL_SYSTEM',
          dailyEmailLimit: 5000,
        },
      });
    });

    it('should skip companies with insufficient emails sent', async () => {
      const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);

      const mockCandidates = [
        {
          id: 'company-1',
          name: 'Low Volume Company',
          createdAt: tenDaysAgo,
          bounceRate: 0.5,
          complaintRate: 0.01,
          _count: {
            emailOutbox: 30, // Below minimum of 50
          },
        },
      ];

      (prisma.company.findMany as jest.Mock).mockResolvedValue(mockCandidates);

      await service.checkAutoApproval();

      // Should not approve the company
      expect(prisma.company.update).not.toHaveBeenCalled();

      // Should log debug message about insufficient emails
      expect(Logger.prototype.debug).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Company not eligible: insufficient emails',
          companyId: 'company-1',
          emailsSent: 30,
          required: 50,
        })
      );
    });

    it('should handle approval errors gracefully', async () => {
      const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);

      const mockCandidates = [
        {
          id: 'company-1',
          name: 'Error Company',
          createdAt: tenDaysAgo,
          bounceRate: 0.5,
          complaintRate: 0.01,
          _count: {
            emailOutbox: 100,
          },
        },
      ];

      (prisma.company.findMany as jest.Mock).mockResolvedValue(mockCandidates);
      (prisma.company.update as jest.Mock).mockRejectedValue(
        new Error('Database connection error')
      );

      // Should not throw, should handle error gracefully
      await expect(service.checkAutoApproval()).resolves.not.toThrow();

      // Should log the error
      expect(Logger.prototype.error).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Failed to auto-approve company',
          companyId: 'company-1',
          error: 'Database connection error',
        })
      );
    });

    it('should handle query errors gracefully', async () => {
      (prisma.company.findMany as jest.Mock).mockRejectedValue(
        new Error('Query timeout')
      );

      // Should not throw, should handle error gracefully
      await expect(service.checkAutoApproval()).resolves.not.toThrow();

      // Should log the error
      expect(Logger.prototype.error).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Failed to run auto-approval check',
          error: 'Query timeout',
        })
      );
    });

    it('should process mixed eligible and ineligible companies', async () => {
      const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);

      const mockCandidates = [
        {
          id: 'company-eligible',
          name: 'Eligible Company',
          createdAt: tenDaysAgo,
          bounceRate: 0.5,
          complaintRate: 0.01,
          _count: { emailOutbox: 100 },
        },
        {
          id: 'company-ineligible',
          name: 'Ineligible Company',
          createdAt: tenDaysAgo,
          bounceRate: 0.8,
          complaintRate: 0.02,
          _count: { emailOutbox: 20 }, // Too few emails
        },
      ];

      (prisma.company.findMany as jest.Mock).mockResolvedValue(mockCandidates);
      (prisma.company.update as jest.Mock).mockResolvedValue({});

      await service.checkAutoApproval();

      // Should only approve the eligible company
      expect(prisma.company.update).toHaveBeenCalledTimes(1);
      expect(prisma.company.update).toHaveBeenCalledWith({
        where: { id: 'company-eligible' },
        data: expect.objectContaining({
          isApproved: true,
          approvedBy: 'AUTO_APPROVAL_SYSTEM',
        }),
      });
    });
  });

  describe('getSandboxStats', () => {
    it('should return correct statistics', async () => {
      // Mock counts
      (prisma.company.count as jest.Mock)
        .mockResolvedValueOnce(5) // pending
        .mockResolvedValueOnce(20) // approved
        .mockResolvedValueOnce(2); // rejected

      // Mock approved companies for average calculation
      const now = new Date();
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const tenDaysAgo = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000);

      (prisma.company.findMany as jest.Mock).mockResolvedValue([
        {
          createdAt: tenDaysAgo,
          approvedAt: now,
        },
        {
          createdAt: sevenDaysAgo,
          approvedAt: now,
        },
      ]);

      const stats = await service.getSandboxStats();

      expect(stats.pending).toBe(5);
      expect(stats.approved).toBe(20);
      expect(stats.rejected).toBe(2);
      expect(stats.avgDaysToApproval).toBeGreaterThan(0);
      expect(stats.avgDaysToApproval).toBeLessThanOrEqual(10);
    });

    it('should return zero average when no approved companies', async () => {
      (prisma.company.count as jest.Mock)
        .mockResolvedValueOnce(5)
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0);

      (prisma.company.findMany as jest.Mock).mockResolvedValue([]);

      const stats = await service.getSandboxStats();

      expect(stats.pending).toBe(5);
      expect(stats.approved).toBe(0);
      expect(stats.rejected).toBe(0);
      expect(stats.avgDaysToApproval).toBe(0);
    });

    it('should handle errors gracefully and return zeros', async () => {
      (prisma.company.count as jest.Mock).mockRejectedValue(
        new Error('Database error')
      );

      const stats = await service.getSandboxStats();

      expect(stats.pending).toBe(0);
      expect(stats.approved).toBe(0);
      expect(stats.rejected).toBe(0);
      expect(stats.avgDaysToApproval).toBe(0);

      expect(Logger.prototype.error).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Failed to get sandbox stats',
          error: 'Database error',
        })
      );
    });

    it('should calculate correct average for multiple companies', async () => {
      (prisma.company.count as jest.Mock)
        .mockResolvedValueOnce(3)
        .mockResolvedValueOnce(4)
        .mockResolvedValueOnce(1);

      const now = new Date();
      const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
      const fiveDaysAgo = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000);
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

      (prisma.company.findMany as jest.Mock).mockResolvedValue([
        {
          createdAt: threeDaysAgo,
          approvedAt: now, // 3 days
        },
        {
          createdAt: fiveDaysAgo,
          approvedAt: now, // 5 days
        },
        {
          createdAt: sevenDaysAgo,
          approvedAt: now, // 7 days
        },
      ]);

      const stats = await service.getSandboxStats();

      // Average should be (3 + 5 + 7) / 3 = 5
      expect(stats.avgDaysToApproval).toBe(5);
    });
  });
});
