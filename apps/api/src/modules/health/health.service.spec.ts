import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { HealthService } from './health.service';
import { prisma } from '@email-gateway/database';
import { Redis } from 'ioredis';

// Mock Redis client - must be defined before jest.mock()
const mockRedis = {
  ping: jest.fn(),
  info: jest.fn(),
  disconnect: jest.fn(),
};

// Mock das dependências externas
jest.mock('@email-gateway/database', () => ({
  prisma: {
    $queryRaw: jest.fn(),
  },
}));

// Mock ioredis - needs to support both default and named imports
jest.mock('ioredis', () => {
  const MockRedisConstructor = jest.fn(() => mockRedis);
  return {
    __esModule: true,
    default: MockRedisConstructor,
    Redis: MockRedisConstructor,
  };
});

describe('HealthService', () => {
  let service: HealthService;
  let configService: ConfigService;

  beforeEach(async () => {
    const mockConfigService = {
      get: jest.fn((key: string, defaultValue?: any) => {
        const config: Record<string, any> = {
          REDIS_URL: 'redis://localhost:6379',
        };
        return config[key] || defaultValue;
      }),
    };

    // Reset Redis mocks
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HealthService,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<HealthService>(HealthService);
    configService = module.get<ConfigService>(ConfigService);
  });

  describe('performReadinessChecks', () => {
    it('deve retornar todas as verificações como ok', async () => {
      // Mock database check
      (prisma.$queryRaw as jest.Mock).mockResolvedValue([{ '?column?': 1 }]);

      // Mock Redis check
      mockRedis.ping.mockResolvedValue('PONG');
      mockRedis.info.mockResolvedValue('used_memory:1024');

      const result = await service.performReadinessChecks();

      expect(result.database.status).toBe('ok');
      expect(result.redis.status).toBe('ok');
    });

    it('deve retornar erro quando database falha', async () => {
      // Mock database failure
      (prisma.$queryRaw as jest.Mock).mockRejectedValue(new Error('Connection failed'));

      // Mock Redis check success
      mockRedis.ping.mockResolvedValue('PONG');
      mockRedis.info.mockResolvedValue('used_memory:1024');

      const result = await service.performReadinessChecks();

      expect(result.database.status).toBe('error');
      expect(result.database.message).toContain('Database connection failed');
      expect(result.redis.status).toBe('ok');
    });

    it('deve retornar erro quando Redis falha', async () => {
      // Mock database check success
      (prisma.$queryRaw as jest.Mock).mockResolvedValue([{ '?column?': 1 }]);

      // Mock Redis failure
      mockRedis.ping.mockRejectedValue(new Error('Connection refused'));

      const result = await service.performReadinessChecks();

      expect(result.database.status).toBe('ok');
      expect(result.redis.status).toBe('error');
      expect(result.redis.message).toContain('Redis connection failed');
    });
  });

  describe('checkDatabase', () => {
    it('deve retornar ok quando database responde', async () => {
      (prisma.$queryRaw as jest.Mock).mockResolvedValue([{ '?column?': 1 }]);

      const result = await (service as any).checkDatabase();

      expect(result.status).toBe('ok');
      expect(result.message).toBe('Database connection successful');
      expect(result.responseTime).toBeDefined();
    });

    it('deve retornar erro quando database falha', async () => {
      (prisma.$queryRaw as jest.Mock).mockRejectedValue(new Error('Connection timeout'));

      const result = await (service as any).checkDatabase();

      expect(result.status).toBe('error');
      expect(result.message).toContain('Database connection failed');
      expect(result.responseTime).toBeDefined();
    });
  });

  describe('checkRedis', () => {
    it('deve retornar ok quando Redis responde PONG', async () => {
      mockRedis.ping.mockResolvedValue('PONG');
      mockRedis.info.mockResolvedValue('used_memory:1024');

      const result = await (service as any).checkRedis();

      expect(result.status).toBe('ok');
      expect(result.message).toBe('Redis connection successful');
      expect(result.responseTime).toBeDefined();
    });

    it('deve retornar erro quando Redis não responde PONG', async () => {
      mockRedis.ping.mockResolvedValue('NOT_PONG');

      const result = await (service as any).checkRedis();

      expect(result.status).toBe('error');
      expect(result.message).toContain('Redis ping did not return PONG');
    });

    it('deve retornar erro quando Redis falha', async () => {
      mockRedis.ping.mockRejectedValue(new Error('Connection refused'));

      const result = await (service as any).checkRedis();

      expect(result.status).toBe('error');
      expect(result.message).toContain('Redis connection failed');
    });
  });

  describe('onModuleDestroy', () => {
    it('deve desconectar Redis corretamente', async () => {
      (mockRedis.disconnect as jest.Mock).mockResolvedValue('OK');

      await service.onModuleDestroy();

      expect(mockRedis.disconnect).toHaveBeenCalled();
    });

    it('deve lidar com erro ao desconectar Redis', async () => {
      (mockRedis.disconnect as jest.Mock).mockRejectedValue(new Error('Disconnect failed'));

      // Não deve lançar exceção
      await expect(service.onModuleDestroy()).resolves.not.toThrow();
    });
  });
});
