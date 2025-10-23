import { Test, TestingModule } from '@nestjs/testing';
import { RedisService } from './redis.service';
import { ConfigService } from '@nestjs/config';

// Mock Redis client - must be defined before jest.mock()
const mockRedisClient = {
  incr: jest.fn(),
  expire: jest.fn(),
  ttl: jest.fn(),
  get: jest.fn(),
  set: jest.fn(),
  setex: jest.fn(),
  del: jest.fn(),
  ping: jest.fn(),
  on: jest.fn(),
  connect: jest.fn(),
  disconnect: jest.fn(),
  isOpen: true,
};

// Mock ioredis - needs to support both default and named imports
jest.mock('ioredis', () => {
  const MockRedisConstructor = jest.fn(() => mockRedisClient);
  return {
    __esModule: true,
    default: MockRedisConstructor,
    Redis: MockRedisConstructor,
  };
});

describe('RedisService', () => {
  let service: RedisService;
  let configService: ConfigService;

  beforeEach(async () => {
    // Reset all mocks before each test
    jest.clearAllMocks();

    // Ensure connect is mocked to resolve successfully
    mockRedisClient.connect.mockResolvedValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RedisService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue('redis://localhost:6379'),
          },
        },
      ],
    }).compile();

    service = module.get<RedisService>(RedisService);
    configService = module.get<ConfigService>(ConfigService);

    // Initialize the service (calls onModuleInit)
    await service.onModuleInit();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('get', () => {
    it('should return value for existing key', async () => {
      const key = 'test:key';
      const expectedValue = 'test_value';

      mockRedisClient.get.mockResolvedValue(expectedValue);

      const result = await service.get(key);

      expect(result).toBe(expectedValue);
      expect(mockRedisClient.get).toHaveBeenCalledWith(key);
    });

    it('should return null for non-existent key', async () => {
      const key = 'nonexistent:key';

      mockRedisClient.get.mockResolvedValue(null);

      const result = await service.get(key);

      expect(result).toBeNull();
    });
  });

  describe('set', () => {
    it('should set value without TTL', async () => {
      const key = 'test:key';
      const value = 'test_value';

      mockRedisClient.set.mockResolvedValue('OK');

      await service.set(key, value);

      expect(mockRedisClient.set).toHaveBeenCalledWith(key, value);
    });

    it('should set value with TTL', async () => {
      const key = 'test:key';
      const value = 'test_value';
      const ttl = 60;

      mockRedisClient.setex.mockResolvedValue('OK');

      await service.set(key, value, ttl);

      expect(mockRedisClient.setex).toHaveBeenCalledWith(key, ttl, value);
    });
  });

  describe('del', () => {
    it('should delete key and return success', async () => {
      const key = 'test:key';

      mockRedisClient.del.mockResolvedValue(1);

      const result = await service.del(key);

      expect(result).toBe(1);
      expect(mockRedisClient.del).toHaveBeenCalledWith(key);
    });

    it('should return 0 when key does not exist', async () => {
      const key = 'nonexistent:key';

      mockRedisClient.del.mockResolvedValue(0);

      const result = await service.del(key);

      expect(result).toBe(0);
    });
  });

  describe('incr', () => {
    it('should increment counter and return new value', async () => {
      const key = 'test:counter';
      const expectedValue = 5;

      mockRedisClient.incr.mockResolvedValue(expectedValue);

      const result = await service.incr(key);

      expect(result).toBe(expectedValue);
      expect(mockRedisClient.incr).toHaveBeenCalledWith(key);
    });

    it('should handle Redis errors gracefully', async () => {
      const key = 'test:counter';
      const error = new Error('Redis error');

      mockRedisClient.incr.mockRejectedValue(error);

      await expect(service.incr(key)).rejects.toThrow('Redis error');
    });
  });

  describe('expire', () => {
    it('should set expiration and return success', async () => {
      const key = 'test:key';
      const ttl = 60;

      mockRedisClient.expire.mockResolvedValue(1);

      const result = await service.expire(key, ttl);

      expect(result).toBe(true);
      expect(mockRedisClient.expire).toHaveBeenCalledWith(key, ttl);
    });

    it('should return false when key does not exist', async () => {
      const key = 'nonexistent:key';
      const ttl = 60;

      mockRedisClient.expire.mockResolvedValue(0);

      const result = await service.expire(key, ttl);

      expect(result).toBe(false);
    });
  });

  describe('ttl', () => {
    it('should return TTL for existing key', async () => {
      const key = 'test:key';
      const expectedTtl = 120;

      mockRedisClient.ttl.mockResolvedValue(expectedTtl);

      const result = await service.ttl(key);

      expect(result).toBe(expectedTtl);
      expect(mockRedisClient.ttl).toHaveBeenCalledWith(key);
    });

    it('should return -1 for key without expiration', async () => {
      const key = 'test:key';

      mockRedisClient.ttl.mockResolvedValue(-1);

      const result = await service.ttl(key);

      expect(result).toBe(-1);
    });

    it('should return -2 for non-existent key', async () => {
      const key = 'nonexistent:key';

      mockRedisClient.ttl.mockResolvedValue(-2);

      const result = await service.ttl(key);

      expect(result).toBe(-2);
    });
  });

  describe('connection management', () => {
    it('should connect to Redis on initialization', async () => {
      mockRedisClient.connect.mockResolvedValue(undefined);

      await service.onModuleInit();

      expect(mockRedisClient.connect).toHaveBeenCalled();
    });

    it('should disconnect from Redis', async () => {
      mockRedisClient.disconnect.mockResolvedValue(undefined);

      await service.onModuleDestroy();

      expect(mockRedisClient.disconnect).toHaveBeenCalled();
    });
  });

  describe('rate limiting operations', () => {
    it('should increment rate limit counter', async () => {
      const key = 'rate_limit:company-123';
      const expectedValue = 1;

      mockRedisClient.incr.mockResolvedValue(expectedValue);

      const result = await service.incr(key);

      expect(result).toBe(expectedValue);
      expect(mockRedisClient.incr).toHaveBeenCalledWith(key);
    });

    it('should set rate limit expiration', async () => {
      const key = 'rate_limit:company-123';
      const ttl = 60;

      mockRedisClient.expire.mockResolvedValue(1);

      const result = await service.expire(key, ttl);

      expect(result).toBe(true);
      expect(mockRedisClient.expire).toHaveBeenCalledWith(key, ttl);
    });

    it('should get burst limit counter', async () => {
      const key = 'burst_limit:company-123';
      const expectedValue = '5';

      mockRedisClient.get.mockResolvedValue(expectedValue);

      const result = await service.get(key);

      expect(result).toBe(expectedValue);
      expect(mockRedisClient.get).toHaveBeenCalledWith(key);
    });
  });

  describe('error handling', () => {
    it('should handle connection errors', async () => {
      const error = new Error('Connection failed');
      mockRedisClient.connect.mockRejectedValue(error);

      await expect(service.onModuleInit()).rejects.toThrow('Connection failed');
    });

    it('should handle operation errors', async () => {
      const key = 'test:key';
      const error = new Error('Operation failed');

      mockRedisClient.get.mockRejectedValue(error);

      await expect(service.get(key)).rejects.toThrow('Operation failed');
    });

    it('should handle timeout errors', async () => {
      const key = 'test:key';
      const error = new Error('Timeout');

      mockRedisClient.incr.mockRejectedValue(error);

      await expect(service.incr(key)).rejects.toThrow('Timeout');
    });
  });
});