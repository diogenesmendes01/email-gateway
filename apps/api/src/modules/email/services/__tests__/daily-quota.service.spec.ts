import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { DailyQuotaService } from '../daily-quota.service';
import { prisma } from '@email-gateway/database';

// Mock prisma
jest.mock('@email-gateway/database', () => ({
  prisma: {
    company: {
      findUnique: jest.fn(),
    },
  },
}));

// Mock ioredis
jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => ({
    get: jest.fn(),
    multi: jest.fn().mockReturnThis(),
    incrby: jest.fn().mockReturnThis(),
    expire: jest.fn().mockReturnThis(),
    exec: jest.fn().mockResolvedValue([]),
    del: jest.fn(),
    quit: jest.fn(),
  }));
});

describe('DailyQuotaService - TASK-029', () => {
  let service: DailyQuotaService;
  let redis: any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DailyQuotaService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, defaultValue?: any) => {
              if (key === 'REDIS_URL') return 'redis://localhost:6379';
              return defaultValue;
            }),
          },
        },
      ],
    }).compile();

    service = module.get<DailyQuotaService>(DailyQuotaService);
    redis = (service as any).redis;
  });

  describe('checkQuota', () => {
    it('should allow sending when under quota', async () => {
      const mockCompany = {
        dailyEmailLimit: 1000,
        isSuspended: false,
      };

      (prisma.company.findUnique as jest.Mock).mockResolvedValue(mockCompany);
      redis.get.mockResolvedValue('500'); // 500 emails sent

      const result = await service.checkQuota('company-123');

      expect(result.allowed).toBe(true);
      expect(result.current).toBe(500);
      expect(result.limit).toBe(1000);
      expect(result.resetsAt).toBeDefined();
    });

    it('should deny sending when quota exceeded', async () => {
      const mockCompany = {
        dailyEmailLimit: 1000,
        isSuspended: false,
      };

      (prisma.company.findUnique as jest.Mock).mockResolvedValue(mockCompany);
      redis.get.mockResolvedValue('1000'); // Already at limit

      const result = await service.checkQuota('company-123');

      expect(result.allowed).toBe(false);
      expect(result.current).toBe(1000);
      expect(result.limit).toBe(1000);
    });

    it('should deny sending when company suspended', async () => {
      const mockCompany = {
        dailyEmailLimit: 1000,
        isSuspended: true,
      };

      (prisma.company.findUnique as jest.Mock).mockResolvedValue(mockCompany);

      const result = await service.checkQuota('company-123');

      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('Company suspended');
    });

    it('should deny sending when company not found', async () => {
      (prisma.company.findUnique as jest.Mock).mockResolvedValue(null);

      const result = await service.checkQuota('non-existent');

      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('Company not found');
    });

    it('should allow sending on Redis failure (fail-safe)', async () => {
      const mockCompany = {
        dailyEmailLimit: 1000,
        isSuspended: false,
      };

      (prisma.company.findUnique as jest.Mock).mockResolvedValue(mockCompany);
      redis.get.mockRejectedValue(new Error('Redis connection failed'));

      const result = await service.checkQuota('company-123');

      expect(result.allowed).toBe(true);
      expect(result.reason).toContain('Quota check failed');
    });
  });

  describe('incrementQuota', () => {
    it('should increment quota counter', async () => {
      await service.incrementQuota('company-123', 1);

      expect(redis.multi).toHaveBeenCalled();
      expect(redis.incrby).toHaveBeenCalled();
      expect(redis.expire).toHaveBeenCalledWith(expect.any(String), 86400);
      expect(redis.exec).toHaveBeenCalled();
    });

    it('should not throw error on Redis failure', async () => {
      redis.exec.mockRejectedValue(new Error('Redis error'));

      await expect(
        service.incrementQuota('company-123', 1)
      ).resolves.not.toThrow();
    });
  });

  describe('resetQuota', () => {
    it('should reset quota counter', async () => {
      await service.resetQuota('company-123');

      expect(redis.del).toHaveBeenCalled();
    });

    it('should throw error on Redis failure', async () => {
      redis.del.mockRejectedValue(new Error('Redis error'));

      await expect(
        service.resetQuota('company-123')
      ).rejects.toThrow('Failed to reset quota');
    });
  });
});
