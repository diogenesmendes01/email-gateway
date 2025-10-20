import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { AuthModule } from '../../modules/auth/auth.module';

export async function createTestModule(overrides = {}) {
  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({
        isGlobal: true,
        envFilePath: '.env.test',
      }),
      ThrottlerModule.forRoot([
        {
          ttl: 1000,
          limit: 10,
        },
      ]),
      AuthModule,
      ...overrides.imports || [],
    ],
    providers: [
      ...overrides.providers || [],
    ],
    controllers: [
      ...overrides.controllers || [],
    ],
  }).compile();

  return moduleFixture;
}

export const testConfig = {
  redis: {
    host: 'localhost',
    port: 6379,
    db: 1, // Use test database
  },
  auth: {
    basicAuthHash: '$2b$12$test.hash.here',
  },
  rateLimit: {
    rps: 60,
    burst: 120,
    windowMs: 1000,
  },
};

export const mockRedisClient = {
  incr: jest.fn(),
  expire: jest.fn(),
  ttl: jest.fn(),
  get: jest.fn(),
  set: jest.fn(),
  del: jest.fn(),
  ping: jest.fn(),
  on: jest.fn(),
  connect: jest.fn(),
  disconnect: jest.fn(),
  isOpen: true,
};

export const mockPrismaClient = {
  company: {
    findUnique: jest.fn(),
    update: jest.fn(),
    create: jest.fn(),
  },
  auditLog: {
    create: jest.fn(),
  },
};

export const mockAuthService = {
  validateApiKey: jest.fn(),
  validateBasicAuth: jest.fn(),
  validateIpAddress: jest.fn(),
  getRateLimitConfig: jest.fn(),
  generateApiKey: jest.fn(),
  rotateApiKey: jest.fn(),
  revokeApiKey: jest.fn(),
  logAuditEvent: jest.fn(),
};

export const mockRedisService = {
  incr: jest.fn(),
  expire: jest.fn(),
  ttl: jest.fn(),
  get: jest.fn(),
  set: jest.fn(),
  del: jest.fn(),
  isConnected: jest.fn(),
  on: jest.fn(),
  connect: jest.fn(),
  disconnect: jest.fn(),
};

export const testData = {
  validApiKey: 'sk_live_test_key',
  validCompany: {
    id: 'company-123',
    name: 'Test Company',
    apiKeyHash: 'hashed_key',
    apiKeyPrefix: 'sk_live',
    apiKeyCreatedAt: new Date(),
    apiKeyExpiresAt: new Date(Date.now() + 86400000),
    lastUsedAt: null,
    isActive: true,
    allowedIps: ['192.168.1.1'],
    rateLimitConfig: { rps: 60, burst: 120, windowMs: 1000 },
  },
  validBasicAuth: {
    username: 'admin',
    password: 'password123',
  },
  validIpAddress: '192.168.1.1',
  invalidIpAddress: '192.168.1.2',
};

export const performanceThresholds = {
  apiKeyValidation: 10, // 10ms
  rateLimitCheck: 5, // 5ms
  basicAuthValidation: 5, // 5ms
  redisOperation: 2, // 2ms
  memoryIncrease: 50 * 1024 * 1024, // 50MB
};

export const securityTestCases = {
  sqlInjection: [
    "sk_live'; DROP TABLE companies; --",
    "sk_live' OR '1'='1",
    "sk_live' UNION SELECT * FROM companies --",
  ],
  xss: [
    'sk_live_<script>alert("xss")</script>',
    'sk_live_"><script>alert("xss")</script>',
    'sk_live_\'><script>alert("xss")</script>',
  ],
  nosqlInjection: [
    'sk_live_$where: function() { return true; }',
    'sk_live_$ne: null',
    'sk_live_$gt: ""',
  ],
  bruteForce: [
    'password',
    '123456',
    'admin',
    'qwerty',
    'password123',
  ],
};

export const performanceTestCases = {
  concurrentRequests: [10, 50, 100, 500, 1000],
  companyCounts: [10, 50, 100, 500, 1000],
  requestFrequencies: [100, 500, 1000, 5000, 10000],
  iterations: [100, 500, 1000, 5000, 10000],
};

export function setupMocks() {
  // Reset all mocks
  jest.clearAllMocks();
  
  // Setup default mock implementations
  mockRedisService.incr.mockResolvedValue(1);
  mockRedisService.expire.mockResolvedValue(1);
  mockRedisService.ttl.mockResolvedValue(60);
  mockRedisService.get.mockResolvedValue('0');
  mockRedisService.isConnected.mockResolvedValue(true);
  
  mockAuthService.validateApiKey.mockResolvedValue(null);
  mockAuthService.validateBasicAuth.mockResolvedValue(false);
  mockAuthService.validateIpAddress.mockReturnValue(true);
  mockAuthService.getRateLimitConfig.mockReturnValue({
    rps: 60,
    burst: 120,
    windowMs: 1000,
  });
  
  mockPrismaClient.company.findUnique.mockResolvedValue(null);
  mockPrismaClient.company.update.mockResolvedValue(null);
  mockPrismaClient.auditLog.create.mockResolvedValue({});
}

export function teardownMocks() {
  jest.clearAllMocks();
  jest.resetAllMocks();
}
