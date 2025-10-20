import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { AppConfigService } from '../src/config/app.config';

describe('AppConfigService', () => {
  let service: AppConfigService;
  let configService: ConfigService;

  beforeEach(async () => {
    const mockConfigService = {
      get: jest.fn((key: string, defaultValue?: any) => {
        const config = {
          DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
          REDIS_URL: 'redis://localhost:6379',
          AWS_ACCESS_KEY_ID: 'test-key',
          AWS_SECRET_ACCESS_KEY: 'test-secret',
          AWS_REGION: 'us-east-1',
          AWS_SES_REGION: 'us-east-1',
          SES_FROM_ADDRESS: 'test@example.com',
          DASHBOARD_USERNAME: 'admin',
          DASHBOARD_PASSWORD_HASH: 'hashed-password',
          ENCRYPTION_KEY: 'a'.repeat(32), // 32 caracteres
          PORT: '3000',
          API_PREFIX: 'v1',
          NODE_ENV: 'test',
          RATE_LIMIT_TTL: '60',
          RATE_LIMIT_MAX: '100',
          SES_QUOTA_THRESHOLD: '80',
        };
        return config[key] || defaultValue;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AppConfigService,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<AppConfigService>(AppConfigService);
    configService = module.get<ConfigService>(ConfigService);
  });

  describe('database', () => {
    it('deve retornar configuração do banco de dados', () => {
      const config = service.database;
      
      expect(config).toEqual({
        url: 'postgresql://user:pass@localhost:5432/db',
      });
    });
  });

  describe('redis', () => {
    it('deve retornar configuração do Redis', () => {
      const config = service.redis;
      
      expect(config).toEqual({
        url: 'redis://localhost:6379',
        host: undefined,
        port: undefined,
        db: undefined,
        password: undefined,
      });
    });
  });

  describe('ses', () => {
    it('deve retornar configuração do SES', () => {
      const config = service.ses;
      
      expect(config).toEqual({
        accessKeyId: 'test-key',
        secretAccessKey: 'test-secret',
        region: 'us-east-1',
        sesRegion: 'us-east-1',
        fromAddress: 'test@example.com',
        replyToAddress: undefined,
        configurationSetName: undefined,
        quotaThreshold: 80,
        alertEmail: undefined,
        quotaLog: undefined,
      });
    });
  });

  describe('dashboard', () => {
    it('deve retornar configuração do dashboard', () => {
      const config = service.dashboard;
      
      expect(config).toEqual({
        username: 'admin',
        passwordHash: 'hashed-password',
      });
    });
  });

  describe('rateLimit', () => {
    it('deve retornar configuração de rate limiting', () => {
      const config = service.rateLimit;
      
      expect(config).toEqual({
        ttl: 60,
        max: 100,
      });
    });

    it('deve usar valores padrão quando não configurado', () => {
      const mockConfigService = {
        get: jest.fn((key: string, defaultValue?: any) => {
          const config = {
            DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
            REDIS_URL: 'redis://localhost:6379',
            AWS_ACCESS_KEY_ID: 'test-key',
            AWS_SECRET_ACCESS_KEY: 'test-secret',
            AWS_REGION: 'us-east-1',
            AWS_SES_REGION: 'us-east-1',
            SES_FROM_ADDRESS: 'test@example.com',
            DASHBOARD_USERNAME: 'admin',
            DASHBOARD_PASSWORD_HASH: 'hashed-password',
            ENCRYPTION_KEY: 'a'.repeat(32),
          };
          return config[key] || defaultValue;
        }),
      };

      const serviceWithDefaults = new AppConfigService(mockConfigService as any);
      const config = serviceWithDefaults.rateLimit;
      
      expect(config).toEqual({
        ttl: 60,
        max: 100,
      });
    });
  });

  describe('app', () => {
    it('deve retornar configuração da aplicação', () => {
      const config = service.app;
      
      expect(config).toEqual({
        nodeEnv: 'test',
        port: 3000,
        apiPrefix: 'v1',
        corsOrigin: undefined,
      });
    });
  });

  describe('encryption', () => {
    it('deve retornar configuração de criptografia', () => {
      const config = service.encryption;
      
      expect(config).toEqual({
        key: 'a'.repeat(32),
        saltSecret: undefined,
      });
    });
  });

  describe('isProduction', () => {
    it('deve retornar false para ambiente de teste', () => {
      expect(service.isProduction).toBe(false);
    });

    it('deve retornar true para ambiente de produção', () => {
      const mockConfigService = {
        get: jest.fn((key: string, defaultValue?: any) => {
          const config = {
            DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
            REDIS_URL: 'redis://localhost:6379',
            AWS_ACCESS_KEY_ID: 'test-key',
            AWS_SECRET_ACCESS_KEY: 'test-secret',
            AWS_REGION: 'us-east-1',
            AWS_SES_REGION: 'us-east-1',
            SES_FROM_ADDRESS: 'test@example.com',
            DASHBOARD_USERNAME: 'admin',
            DASHBOARD_PASSWORD_HASH: 'hashed-password',
            ENCRYPTION_KEY: 'a'.repeat(32),
            NODE_ENV: 'production',
          };
          return config[key] || defaultValue;
        }),
      };

      const productionService = new AppConfigService(mockConfigService as any);
      expect(productionService.isProduction).toBe(true);
    });
  });

  describe('isDevelopment', () => {
    it('deve retornar false para ambiente de teste', () => {
      expect(service.isDevelopment).toBe(false);
    });

    it('deve retornar true para ambiente de desenvolvimento', () => {
      const mockConfigService = {
        get: jest.fn((key: string, defaultValue?: any) => {
          const config = {
            DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
            REDIS_URL: 'redis://localhost:6379',
            AWS_ACCESS_KEY_ID: 'test-key',
            AWS_SECRET_ACCESS_KEY: 'test-secret',
            AWS_REGION: 'us-east-1',
            AWS_SES_REGION: 'us-east-1',
            SES_FROM_ADDRESS: 'test@example.com',
            DASHBOARD_USERNAME: 'admin',
            DASHBOARD_PASSWORD_HASH: 'hashed-password',
            ENCRYPTION_KEY: 'a'.repeat(32),
            NODE_ENV: 'development',
          };
          return config[key] || defaultValue;
        }),
      };

      const devService = new AppConfigService(mockConfigService as any);
      expect(devService.isDevelopment).toBe(true);
    });
  });

  describe('isTest', () => {
    it('deve retornar true para ambiente de teste', () => {
      expect(service.isTest).toBe(true);
    });
  });

  describe('getAll', () => {
    it('deve retornar todas as configurações com valores mascarados', () => {
      const allConfig = service.getAll();
      
      expect(allConfig).toHaveProperty('database');
      expect(allConfig).toHaveProperty('redis');
      expect(allConfig).toHaveProperty('ses');
      expect(allConfig).toHaveProperty('dashboard');
      expect(allConfig).toHaveProperty('rateLimit');
      expect(allConfig).toHaveProperty('app');
      expect(allConfig).toHaveProperty('encryption');
      
      // Verificar se valores sensíveis estão mascarados
      expect(allConfig.ses.accessKeyId).toMatch(/test\*\*\*\*test/);
      expect(allConfig.ses.secretAccessKey).toMatch(/test\*\*\*\*test/);
      expect(allConfig.dashboard.passwordHash).toMatch(/hash\*\*\*\*word/);
      expect(allConfig.encryption.key).toMatch(/aaaa\*\*\*\*aaaa/);
    });
  });

  describe('maskSensitiveValue', () => {
    it('deve mascarar valores longos corretamente', () => {
      const masked = (service as any).maskSensitiveValue('abcdefghijklmnopqrstuvwxyz');
      expect(masked).toBe('abcd***wxyz');
    });

    it('deve mascarar valores curtos', () => {
      const masked = (service as any).maskSensitiveValue('abc');
      expect(masked).toBe('***');
    });

    it('deve retornar "not_set" para valores undefined', () => {
      const masked = (service as any).maskSensitiveValue(undefined);
      expect(masked).toBe('not_set');
    });

    it('deve retornar "not_set" para valores null', () => {
      const masked = (service as any).maskSensitiveValue(null);
      expect(masked).toBe('not_set');
    });
  });

  describe('validação de ambiente', () => {
    it('deve lançar erro para variáveis obrigatórias ausentes', () => {
      const mockConfigService = {
        get: jest.fn((key: string, defaultValue?: any) => {
          const config = {
            DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
            // REDIS_URL ausente
            AWS_ACCESS_KEY_ID: 'test-key',
            AWS_SECRET_ACCESS_KEY: 'test-secret',
            AWS_REGION: 'us-east-1',
            AWS_SES_REGION: 'us-east-1',
            SES_FROM_ADDRESS: 'test@example.com',
            DASHBOARD_USERNAME: 'admin',
            DASHBOARD_PASSWORD_HASH: 'hashed-password',
            ENCRYPTION_KEY: 'a'.repeat(32),
          };
          return config[key] || defaultValue;
        }),
      };

      expect(() => {
        new AppConfigService(mockConfigService as any);
      }).toThrow('Configuração de ambiente inválida');
    });

    it('deve lançar erro para ENCRYPTION_KEY muito curta', () => {
      const mockConfigService = {
        get: jest.fn((key: string, defaultValue?: any) => {
          const config = {
            DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
            REDIS_URL: 'redis://localhost:6379',
            AWS_ACCESS_KEY_ID: 'test-key',
            AWS_SECRET_ACCESS_KEY: 'test-secret',
            AWS_REGION: 'us-east-1',
            AWS_SES_REGION: 'us-east-1',
            SES_FROM_ADDRESS: 'test@example.com',
            DASHBOARD_USERNAME: 'admin',
            DASHBOARD_PASSWORD_HASH: 'hashed-password',
            ENCRYPTION_KEY: 'short', // Muito curta
          };
          return config[key] || defaultValue;
        }),
      };

      expect(() => {
        new AppConfigService(mockConfigService as any);
      }).toThrow('Configuração de ambiente inválida');
    });

    it('deve lançar erro para DATABASE_URL com formato inválido', () => {
      const mockConfigService = {
        get: jest.fn((key: string, defaultValue?: any) => {
          const config = {
            DATABASE_URL: 'invalid-url-format', // URL inválida
            REDIS_URL: 'redis://localhost:6379',
            AWS_ACCESS_KEY_ID: 'test-key',
            AWS_SECRET_ACCESS_KEY: 'test-secret',
            AWS_REGION: 'us-east-1',
            AWS_SES_REGION: 'us-east-1',
            SES_FROM_ADDRESS: 'test@example.com',
            DASHBOARD_USERNAME: 'admin',
            DASHBOARD_PASSWORD_HASH: 'hashed-password',
            ENCRYPTION_KEY: 'a'.repeat(32),
          };
          return config[key] || defaultValue;
        }),
      };

      expect(() => {
        new AppConfigService(mockConfigService as any);
      }).toThrow('Configuração de ambiente inválida');
    });

    it('deve lançar erro para PORT fora do range válido', () => {
      const mockConfigService = {
        get: jest.fn((key: string, defaultValue?: any) => {
          const config = {
            DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
            REDIS_URL: 'redis://localhost:6379',
            AWS_ACCESS_KEY_ID: 'test-key',
            AWS_SECRET_ACCESS_KEY: 'test-secret',
            AWS_REGION: 'us-east-1',
            AWS_SES_REGION: 'us-east-1',
            SES_FROM_ADDRESS: 'test@example.com',
            DASHBOARD_USERNAME: 'admin',
            DASHBOARD_PASSWORD_HASH: 'hashed-password',
            ENCRYPTION_KEY: 'a'.repeat(32),
            PORT: '70000', // Porta fora do range válido (1-65535)
          };
          return config[key] || defaultValue;
        }),
      };

      expect(() => {
        new AppConfigService(mockConfigService as any);
      }).toThrow('Configuração de ambiente inválida');
    });

    it('deve lançar erro para REDIS_URL malformada', () => {
      const mockConfigService = {
        get: jest.fn((key: string, defaultValue?: any) => {
          const config = {
            DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
            REDIS_URL: 'not-a-redis-url', // URL Redis inválida
            AWS_ACCESS_KEY_ID: 'test-key',
            AWS_SECRET_ACCESS_KEY: 'test-secret',
            AWS_REGION: 'us-east-1',
            AWS_SES_REGION: 'us-east-1',
            SES_FROM_ADDRESS: 'test@example.com',
            DASHBOARD_USERNAME: 'admin',
            DASHBOARD_PASSWORD_HASH: 'hashed-password',
            ENCRYPTION_KEY: 'a'.repeat(32),
          };
          return config[key] || defaultValue;
        }),
      };

      expect(() => {
        new AppConfigService(mockConfigService as any);
      }).toThrow('Configuração de ambiente inválida');
    });
  });
});
