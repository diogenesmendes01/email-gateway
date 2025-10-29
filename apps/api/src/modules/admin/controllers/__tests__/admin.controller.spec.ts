/**
 * @email-gateway/api - Admin Controller Tests
 *
 * TASK-034: Tests for company curation endpoints
 */

import { Test, TestingModule } from '@nestjs/testing';
import { AdminController } from '../admin.controller';
import { BasicAuthGuard } from '../../../auth/basic-auth.guard';
import { AdminGuard } from '../../../auth/admin.guard';
import { prisma } from '@email-gateway/database';

// Mock Prisma
jest.mock('@email-gateway/database', () => ({
  prisma: {
    company: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  },
}));

// Mock guards to bypass authentication in tests
const mockGuard = {
  canActivate: jest.fn(() => true),
};

describe('AdminController - TASK-034', () => {
  let controller: AdminController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminController],
    })
      .overrideGuard(BasicAuthGuard)
      .useValue(mockGuard)
      .overrideGuard(AdminGuard)
      .useValue(mockGuard)
      .compile();

    controller = module.get<AdminController>(AdminController);

    // Reset mocks before each test
    jest.clearAllMocks();
  });

  describe('listPending', () => {
    it('should return list of pending companies', async () => {
      const mockCompanies = [
        {
          id: 'company-1',
          name: 'Test Company 1',
          createdAt: new Date('2024-01-01'),
          bounceRate: 0.5,
          complaintRate: 0.01,
          dailyEmailLimit: 100,
          _count: { emailOutbox: 75 },
        },
        {
          id: 'company-2',
          name: 'Test Company 2',
          createdAt: new Date('2024-01-02'),
          bounceRate: 1.2,
          complaintRate: 0.02,
          dailyEmailLimit: 100,
          _count: { emailOutbox: 120 },
        },
      ];

      (prisma.company.findMany as jest.Mock).mockResolvedValue(mockCompanies);

      const result = await controller.listPending();

      expect(result).toEqual(mockCompanies);
      expect(prisma.company.findMany).toHaveBeenCalledWith({
        where: {
          isApproved: false,
          isActive: true,
          isSuspended: false,
        },
        select: expect.objectContaining({
          id: true,
          name: true,
          createdAt: true,
          bounceRate: true,
          complaintRate: true,
          dailyEmailLimit: true,
        }),
        orderBy: { createdAt: 'asc' },
      });
    });

    it('should return empty array when no pending companies', async () => {
      (prisma.company.findMany as jest.Mock).mockResolvedValue([]);

      const result = await controller.listPending();

      expect(result).toEqual([]);
      expect(prisma.company.findMany).toHaveBeenCalled();
    });
  });

  describe('approve', () => {
    it('should approve a company successfully', async () => {
      const companyId = 'company-1';
      const dto = {
        adminUsername: 'admin@test.com',
        dailyEmailLimit: 10000,
      };

      (prisma.company.findUnique as jest.Mock).mockResolvedValue({
        name: 'Test Company',
        isApproved: false,
      });

      (prisma.company.update as jest.Mock).mockResolvedValue({
        id: companyId,
        name: 'Test Company',
        isApproved: true,
        approvedAt: new Date(),
        approvedBy: dto.adminUsername,
        dailyEmailLimit: dto.dailyEmailLimit,
      });

      const result = await controller.approve(companyId, dto);

      expect(result.success).toBe(true);
      expect(result.message).toContain('Test Company');
      expect(prisma.company.update).toHaveBeenCalledWith({
        where: { id: companyId },
        data: {
          isApproved: true,
          approvedAt: expect.any(Date),
          approvedBy: dto.adminUsername,
          dailyEmailLimit: dto.dailyEmailLimit,
        },
      });
    });

    it('should use default daily limit when not provided', async () => {
      const companyId = 'company-1';
      const dto = {
        adminUsername: 'admin@test.com',
      };

      (prisma.company.findUnique as jest.Mock).mockResolvedValue({
        name: 'Test Company',
        isApproved: false,
      });

      (prisma.company.update as jest.Mock).mockResolvedValue({});

      await controller.approve(companyId, dto);

      expect(prisma.company.update).toHaveBeenCalledWith({
        where: { id: companyId },
        data: expect.objectContaining({
          dailyEmailLimit: 5000, // Default value
        }),
      });
    });

    it('should throw error when company not found', async () => {
      const companyId = 'non-existent';
      const dto = {
        adminUsername: 'admin@test.com',
      };

      (prisma.company.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(controller.approve(companyId, dto)).rejects.toThrow(
        'Company not found'
      );

      expect(prisma.company.update).not.toHaveBeenCalled();
    });

    it('should throw error when company already approved', async () => {
      const companyId = 'company-1';
      const dto = {
        adminUsername: 'admin@test.com',
      };

      (prisma.company.findUnique as jest.Mock).mockResolvedValue({
        name: 'Test Company',
        isApproved: true,
      });

      await expect(controller.approve(companyId, dto)).rejects.toThrow(
        'Company already approved'
      );

      expect(prisma.company.update).not.toHaveBeenCalled();
    });
  });

  describe('reject', () => {
    it('should reject a company successfully', async () => {
      const companyId = 'company-1';
      const dto = {
        reason: 'High bounce rate and suspicious activity',
      };

      (prisma.company.findUnique as jest.Mock).mockResolvedValue({
        name: 'Test Company',
      });

      (prisma.company.update as jest.Mock).mockResolvedValue({});

      const result = await controller.reject(companyId, dto);

      expect(result.success).toBe(true);
      expect(result.message).toContain('Test Company');
      expect(prisma.company.update).toHaveBeenCalledWith({
        where: { id: companyId },
        data: {
          isActive: false,
          isSuspended: true,
          suspensionReason: `REJECTED: ${dto.reason}`,
        },
      });
    });

    it('should throw error when company not found', async () => {
      const companyId = 'non-existent';
      const dto = {
        reason: 'Test reason',
      };

      (prisma.company.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(controller.reject(companyId, dto)).rejects.toThrow(
        'Company not found'
      );

      expect(prisma.company.update).not.toHaveBeenCalled();
    });
  });

  describe('suspend', () => {
    it('should suspend a company successfully', async () => {
      const companyId = 'company-1';
      const dto = {
        reason: 'Temporary suspension due to policy violation',
      };

      (prisma.company.findUnique as jest.Mock).mockResolvedValue({
        name: 'Test Company',
        isSuspended: false,
      });

      (prisma.company.update as jest.Mock).mockResolvedValue({});

      const result = await controller.suspend(companyId, dto);

      expect(result.success).toBe(true);
      expect(result.message).toContain('Test Company');
      expect(prisma.company.update).toHaveBeenCalledWith({
        where: { id: companyId },
        data: {
          isSuspended: true,
          suspensionReason: dto.reason,
        },
      });
    });

    it('should throw error when company not found', async () => {
      const companyId = 'non-existent';
      const dto = {
        reason: 'Test reason',
      };

      (prisma.company.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(controller.suspend(companyId, dto)).rejects.toThrow(
        'Company not found'
      );

      expect(prisma.company.update).not.toHaveBeenCalled();
    });

    it('should throw error when company already suspended', async () => {
      const companyId = 'company-1';
      const dto = {
        reason: 'Test reason',
      };

      (prisma.company.findUnique as jest.Mock).mockResolvedValue({
        name: 'Test Company',
        isSuspended: true,
      });

      await expect(controller.suspend(companyId, dto)).rejects.toThrow(
        'Company already suspended'
      );

      expect(prisma.company.update).not.toHaveBeenCalled();
    });
  });

  describe('reactivate', () => {
    it('should reactivate a suspended company successfully', async () => {
      const companyId = 'company-1';

      (prisma.company.findUnique as jest.Mock).mockResolvedValue({
        name: 'Test Company',
        isSuspended: true,
        isActive: false,
      });

      (prisma.company.update as jest.Mock).mockResolvedValue({});

      const result = await controller.reactivate(companyId);

      expect(result.success).toBe(true);
      expect(result.message).toContain('Test Company');
      expect(prisma.company.update).toHaveBeenCalledWith({
        where: { id: companyId },
        data: {
          isSuspended: false,
          isActive: true,
          suspensionReason: null,
        },
      });
    });

    it('should throw error when company not found', async () => {
      const companyId = 'non-existent';

      (prisma.company.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(controller.reactivate(companyId)).rejects.toThrow(
        'Company not found'
      );

      expect(prisma.company.update).not.toHaveBeenCalled();
    });

    it('should throw error when company is already active', async () => {
      const companyId = 'company-1';

      (prisma.company.findUnique as jest.Mock).mockResolvedValue({
        name: 'Test Company',
        isSuspended: false,
        isActive: true,
      });

      await expect(controller.reactivate(companyId)).rejects.toThrow(
        'Company is already active'
      );

      expect(prisma.company.update).not.toHaveBeenCalled();
    });
  });
});
