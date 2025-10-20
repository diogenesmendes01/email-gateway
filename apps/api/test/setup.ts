import { setupMocks, teardownMocks } from './helpers/test-setup';

// Global test setup
beforeAll(async () => {
  setupMocks();
});

// Global test teardown
afterAll(async () => {
  teardownMocks();
});

// Setup before each test
beforeEach(() => {
  setupMocks();
});

// Cleanup after each test
afterEach(() => {
  teardownMocks();
});

// Global test timeout
jest.setTimeout(30000);

// Mock console methods to reduce noise in tests
global.console = {
  ...console,
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

// Mock process.exit to prevent tests from exiting
const originalExit = process.exit;
process.exit = jest.fn() as any;

// Restore process.exit after all tests
afterAll(() => {
  process.exit = originalExit;
});

// Mock environment variables
process.env.NODE_ENV = 'test';
process.env.REDIS_URL = 'redis://localhost:6379';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
process.env.JWT_SECRET = 'test-secret';
process.env.API_KEY_SALT_ROUNDS = '12';
process.env.BASIC_AUTH_HASH = '$2b$12$test.hash.here';

// Mock Date.now for consistent testing
const mockDate = new Date('2024-01-01T00:00:00.000Z');
global.Date.now = jest.fn(() => mockDate.getTime());

// Mock Math.random for consistent testing
global.Math.random = jest.fn(() => 0.5);

// Mock crypto for consistent testing
const mockCrypto = {
  randomBytes: jest.fn(() => Buffer.from('test-random-bytes')),
  createHash: jest.fn(() => ({
    update: jest.fn().mockReturnThis(),
    digest: jest.fn(() => 'test-hash'),
  })),
};

global.crypto = mockCrypto as any;

// Mock bcrypt for consistent testing
jest.mock('bcrypt', () => ({
  hash: jest.fn((password, saltRounds) => Promise.resolve(`hashed_${password}_${saltRounds}`)),
  compare: jest.fn((password, hash) => Promise.resolve(hash.includes(password))),
}));

// Mock Redis client
jest.mock('redis', () => ({
  createClient: jest.fn(() => ({
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
  })),
}));

// Mock Prisma client
jest.mock('@email-gateway/database', () => ({
  prisma: {
    company: {
      findUnique: jest.fn(),
      update: jest.fn(),
      create: jest.fn(),
    },
    auditLog: {
      create: jest.fn(),
    },
  },
}));

// Mock AWS SDK
jest.mock('@aws-sdk/client-ses', () => ({
  SESClient: jest.fn(),
  VerifyDomainIdentityCommand: jest.fn(),
  GetIdentityVerificationAttributesCommand: jest.fn(),
  SetIdentityDkimEnabledCommand: jest.fn(),
  GetIdentityDkimAttributesCommand: jest.fn(),
  GetAccountSendingEnabledCommand: jest.fn(),
  GetSendQuotaCommand: jest.fn(),
}));

jest.mock('@aws-sdk/client-sesv2', () => ({
  SESv2Client: jest.fn(),
  PutEmailIdentityDkimSigningAttributesCommand: jest.fn(),
  GetEmailIdentityCommand: jest.fn(),
  PutAccountSendingAttributesCommand: jest.fn(),
  GetAccountVdmAttributesCommand: jest.fn(),
  GetDedicatedIpPoolCommand: jest.fn(),
  GetEmailIdentityDkimAttributesCommand: jest.fn(),
  GetEmailIdentityMailFromAttributesCommand: jest.fn(),
  GetEmailIdentityPoliciesCommand: jest.fn(),
  GetEmailIdentityFeedbackAttributesCommand: jest.fn(),
  GetEmailIdentityVerificationAttributesCommand: jest.fn(),
}));

// Mock DNS
jest.mock('dns/promises', () => ({
  resolveTxt: jest.fn(),
  resolve4: jest.fn(),
  resolve6: jest.fn(),
}));

// Mock Bull Queue
jest.mock('bull', () => ({
  Queue: jest.fn(),
}));

// Mock BullMQ
jest.mock('bullmq', () => ({
  Queue: jest.fn(),
  Worker: jest.fn(),
  Job: jest.fn(),
}));

// Mock nodemailer
jest.mock('nodemailer', () => ({
  createTransport: jest.fn(),
}));

// Mock handlebars
jest.mock('handlebars', () => ({
  compile: jest.fn(),
}));

// Mock fs
jest.mock('fs', () => ({
  readFileSync: jest.fn(),
  writeFileSync: jest.fn(),
  existsSync: jest.fn(),
  mkdirSync: jest.fn(),
  statSync: jest.fn(),
}));

// Mock path
jest.mock('path', () => ({
  join: jest.fn(),
  resolve: jest.fn(),
  dirname: jest.fn(),
  basename: jest.fn(),
  extname: jest.fn(),
}));

// Mock os
jest.mock('os', () => ({
  hostname: jest.fn(() => 'test-hostname'),
  platform: jest.fn(() => 'test-platform'),
  arch: jest.fn(() => 'test-arch'),
  cpus: jest.fn(() => []),
  totalmem: jest.fn(() => 1024 * 1024 * 1024),
  freemem: jest.fn(() => 512 * 1024 * 1024),
  uptime: jest.fn(() => 3600),
}));

// Mock process
jest.mock('process', () => ({
  ...process,
  exit: jest.fn(),
  kill: jest.fn(),
  nextTick: jest.fn(),
  hrtime: jest.fn(),
  memoryUsage: jest.fn(() => ({
    rss: 1024 * 1024 * 1024,
    heapTotal: 512 * 1024 * 1024,
    heapUsed: 256 * 1024 * 1024,
    external: 64 * 1024 * 1024,
    arrayBuffers: 32 * 1024 * 1024,
  })),
  cpuUsage: jest.fn(() => ({
    user: 1000000,
    system: 500000,
  })),
}));

// Mock timers
jest.useFakeTimers();

// Mock performance
global.performance = {
  now: jest.fn(() => Date.now()),
  mark: jest.fn(),
  measure: jest.fn(),
  getEntriesByName: jest.fn(() => []),
  getEntriesByType: jest.fn(() => []),
  clearMarks: jest.fn(),
  clearMeasures: jest.fn(),
} as any;

// Mock fetch
global.fetch = jest.fn();

// Mock WebSocket
global.WebSocket = jest.fn() as any;

// Mock EventSource
global.EventSource = jest.fn() as any;

// Mock AbortController
global.AbortController = jest.fn() as any;

// Mock AbortSignal
global.AbortSignal = jest.fn() as any;

// Mock URL
global.URL = jest.fn() as any;

// Mock URLSearchParams
global.URLSearchParams = jest.fn() as any;

// Mock FormData
global.FormData = jest.fn() as any;

// Mock Headers
global.Headers = jest.fn() as any;

// Mock Request
global.Request = jest.fn() as any;

// Mock Response
global.Response = jest.fn() as any;

// Mock Blob
global.Blob = jest.fn() as any;

// Mock File
global.File = jest.fn() as any;

// Mock FileReader
global.FileReader = jest.fn() as any;

// Mock XMLHttpRequest
global.XMLHttpRequest = jest.fn() as any;

// Mock localStorage
global.localStorage = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
  length: 0,
  key: jest.fn(),
} as any;

// Mock sessionStorage
global.sessionStorage = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
  length: 0,
  key: jest.fn(),
} as any;

// Mock indexedDB
global.indexedDB = jest.fn() as any;

// Mock IDBRequest
global.IDBRequest = jest.fn() as any;

// Mock IDBTransaction
global.IDBTransaction = jest.fn() as any;

// Mock IDBObjectStore
global.IDBObjectStore = jest.fn() as any;

// Mock IDBIndex
global.IDBIndex = jest.fn() as any;

// Mock IDBCursor
global.IDBCursor = jest.fn() as any;

// Mock IDBCursorWithValue
global.IDBCursorWithValue = jest.fn() as any;

// Mock IDBDatabase
global.IDBDatabase = jest.fn() as any;

// Mock IDBFactory
global.IDBFactory = jest.fn() as any;

// Mock IDBOpenDBRequest
global.IDBOpenDBRequest = jest.fn() as any;

// Mock IDBRequest
global.IDBRequest = jest.fn() as any;

// Mock IDBTransaction
global.IDBTransaction = jest.fn() as any;

// Mock IDBObjectStore
global.IDBObjectStore = jest.fn() as any;

// Mock IDBIndex
global.IDBIndex = jest.fn() as any;

// Mock IDBCursor
global.IDBCursor = jest.fn() as any;

// Mock IDBCursorWithValue
global.IDBCursorWithValue = jest.fn() as any;

// Mock IDBDatabase
global.IDBDatabase = jest.fn() as any;

// Mock IDBFactory
global.IDBFactory = jest.fn() as any;

// Mock IDBOpenDBRequest
global.IDBOpenDBRequest = jest.fn() as any;
