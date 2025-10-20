import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IsString, IsNumber, IsUrl, IsOptional, IsBoolean, Min, Max, validateSync } from 'class-validator';
import { plainToClass, Transform } from 'class-transformer';

/**
 * Validação de variáveis de ambiente
 * Segue padrões definidos no NEW-FEATURES.md
 */
class EnvironmentVariables {
  // Database
  @IsString()
  DATABASE_URL: string;

  // Redis
  @IsString()
  REDIS_URL: string;

  @IsOptional()
  @IsString()
  REDIS_HOST?: string;

  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  @IsNumber()
  @Min(1)
  @Max(65535)
  REDIS_PORT?: number;

  @IsOptional()
  @IsString()
  REDIS_DB?: string;

  @IsOptional()
  @IsString()
  REDIS_PASSWORD?: string;

  // AWS SES
  @IsString()
  AWS_ACCESS_KEY_ID: string;

  @IsString()
  AWS_SECRET_ACCESS_KEY: string;

  @IsString()
  AWS_REGION: string;

  @IsString()
  AWS_SES_REGION: string;

  @IsString()
  SES_FROM_ADDRESS: string;

  @IsOptional()
  @IsString()
  SES_REPLY_TO_ADDRESS?: string;

  @IsOptional()
  @IsString()
  SES_CONFIGURATION_SET_NAME?: string;

  // Dashboard Authentication
  @IsString()
  DASHBOARD_USERNAME: string;

  @IsString()
  DASHBOARD_PASSWORD_HASH: string;

  // Rate Limiting
  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  @IsNumber()
  @Min(1)
  RATE_LIMIT_TTL?: number;

  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  @IsNumber()
  @Min(1)
  RATE_LIMIT_MAX?: number;

  // Application
  @IsOptional()
  @IsString()
  NODE_ENV?: string;

  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  @IsNumber()
  @Min(1)
  @Max(65535)
  PORT?: number;

  @IsOptional()
  @IsString()
  API_PREFIX?: string;

  @IsOptional()
  @IsString()
  CORS_ORIGIN?: string;

  // SLO/Capacidade (TASK 7.2)
  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  @IsNumber()
  @Min(1)
  @Max(100)
  SLO_TARGET_SUCCESS_RATE_PCT?: number;

  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  @IsNumber()
  @Min(1)
  @Max(100)
  SLO_MAX_ERROR_RATE_PCT?: number;

  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  @IsNumber()
  @Min(1000)
  SLO_MAX_QUEUE_AGE_P95_MS?: number;

  // Flags de Caos (TASK 7.2)
  @IsOptional()
  @Transform(({ value }) => value === 'true')
  @IsBoolean()
  CHAOS_SES_429?: boolean;

  @IsOptional()
  @Transform(({ value }) => value === 'true')
  @IsBoolean()
  CHAOS_DISK_FILL?: boolean;

  @IsOptional()
  @Transform(({ value }) => value === 'true')
  @IsBoolean()
  CHAOS_REDIS_DOWN_60S?: boolean;

  // Encryption (CRÍTICO para produção)
  @IsString()
  ENCRYPTION_KEY: string;

  @IsOptional()
  @IsString()
  ENCRYPTION_SALT_SECRET?: string;

  // Queue Alerts
  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  @IsNumber()
  @Min(1)
  QUEUE_ALERT_WAITING_THRESHOLD?: number;

  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  @IsNumber()
  @Min(1)
  QUEUE_ALERT_FAILED_THRESHOLD?: number;

  // Domain Management (TASK 6.2)
  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  @IsNumber()
  @Min(1)
  @Max(100)
  SES_QUOTA_THRESHOLD?: number;

  @IsOptional()
  @IsString()
  SES_ALERT_EMAIL?: string;

  @IsOptional()
  @IsString()
  SES_QUOTA_LOG?: string;
}

/**
 * Configuração centralizada da aplicação
 * Fornece acesso type-safe às variáveis de ambiente
 */
@Injectable()
export class AppConfigService {
  private readonly config: EnvironmentVariables;

  constructor(private configService: ConfigService) {
    // Validação das variáveis de ambiente
    this.config = this.validateEnvironment();
  }

  /**
   * Valida e transforma as variáveis de ambiente
   * WHY: Falha rápida na inicialização evita problemas em runtime
   * WHY: Validação centralizada garante consistência em toda aplicação
   */
  private validateEnvironment(): EnvironmentVariables {
    // Transforma process.env em objeto tipado com validações
    const config = plainToClass(EnvironmentVariables, process.env, {
      enableImplicitConversion: true, // Converte strings para números/booleans automaticamente
    });

    // Executa validações definidas nos decorators (@IsString, @IsNumber, etc.)
    const errors = validateSync(config, {
      skipMissingProperties: false, // Falha se propriedades obrigatórias estão ausentes
    });

    if (errors.length > 0) {
      // WHY: Mensagens detalhadas ajudam na depuração de problemas de configuração
      const errorMessages = errors.map(error => 
        Object.values(error.constraints || {}).join(', ')
      ).join('; ');
      
      throw new Error(`❌ Configuração de ambiente inválida: ${errorMessages}`);
    }

    return config;
  }

  /**
   * Database configuration
   */
  get database() {
    return {
      url: this.config.DATABASE_URL,
    };
  }

  /**
   * Redis configuration
   */
  get redis() {
    return {
      url: this.config.REDIS_URL,
      host: this.config.REDIS_HOST,
      port: this.config.REDIS_PORT,
      db: this.config.REDIS_DB,
      password: this.config.REDIS_PASSWORD,
    };
  }

  /**
   * AWS SES configuration
   */
  get ses() {
    return {
      accessKeyId: this.config.AWS_ACCESS_KEY_ID,
      secretAccessKey: this.config.AWS_SECRET_ACCESS_KEY,
      region: this.config.AWS_REGION,
      sesRegion: this.config.AWS_SES_REGION,
      fromAddress: this.config.SES_FROM_ADDRESS,
      replyToAddress: this.config.SES_REPLY_TO_ADDRESS,
      configurationSetName: this.config.SES_CONFIGURATION_SET_NAME,
      quotaThreshold: this.config.SES_QUOTA_THRESHOLD || 80,
      alertEmail: this.config.SES_ALERT_EMAIL,
      quotaLog: this.config.SES_QUOTA_LOG,
    };
  }

  /**
   * Dashboard authentication
   */
  get dashboard() {
    return {
      username: this.config.DASHBOARD_USERNAME,
      passwordHash: this.config.DASHBOARD_PASSWORD_HASH,
    };
  }

  /**
   * Rate limiting configuration
   */
  get rateLimit() {
    return {
      ttl: this.config.RATE_LIMIT_TTL || 60,
      max: this.config.RATE_LIMIT_MAX || 100,
    };
  }

  /**
   * Application configuration
   */
  get app() {
    return {
      nodeEnv: this.config.NODE_ENV || 'development',
      port: this.config.PORT || 3000,
      apiPrefix: this.config.API_PREFIX || 'v1',
      corsOrigin: this.config.CORS_ORIGIN || '*',
    };
  }

  /**
   * SLO configuration (TASK 7.2)
   */
  get slo() {
    return {
      targetSuccessRatePct: this.config.SLO_TARGET_SUCCESS_RATE_PCT || 95,
      maxErrorRatePct: this.config.SLO_MAX_ERROR_RATE_PCT || 5,
      maxQueueAgeP95Ms: this.config.SLO_MAX_QUEUE_AGE_P95_MS || 120000,
    };
  }

  /**
   * Chaos testing flags (TASK 7.2)
   */
  get chaos() {
    return {
      ses429: this.config.CHAOS_SES_429 || false,
      diskFill: this.config.CHAOS_DISK_FILL || false,
      redisDown60s: this.config.CHAOS_REDIS_DOWN_60S || false,
    };
  }

  /**
   * Encryption configuration
   */
  get encryption() {
    return {
      key: this.config.ENCRYPTION_KEY,
      saltSecret: this.config.ENCRYPTION_SALT_SECRET,
    };
  }

  /**
   * Queue alerts configuration
   */
  get queueAlerts() {
    return {
      waitingThreshold: this.config.QUEUE_ALERT_WAITING_THRESHOLD || 1000,
      failedThreshold: this.config.QUEUE_ALERT_FAILED_THRESHOLD || 50,
    };
  }

  /**
   * Retorna todas as configurações (para debug)
   */
  getAll() {
    return {
      database: this.database,
      redis: this.redis,
      ses: {
        ...this.ses,
        // Mascarar credenciais sensíveis
        accessKeyId: this.maskSensitiveValue(this.ses.accessKeyId),
        secretAccessKey: this.maskSensitiveValue(this.ses.secretAccessKey),
      },
      dashboard: {
        ...this.dashboard,
        passwordHash: this.maskSensitiveValue(this.dashboard.passwordHash),
      },
      rateLimit: this.rateLimit,
      app: this.app,
      slo: this.slo,
      chaos: this.chaos,
      encryption: {
        key: this.maskSensitiveValue(this.encryption.key),
        saltSecret: this.maskSensitiveValue(this.encryption.saltSecret),
      },
      queueAlerts: this.queueAlerts,
    };
  }

  /**
   * Mascara valores sensíveis para logging
   * WHY: Previne vazamento de secrets em logs que podem ser compartilhados
   * WHY: Mantém formato legível para debug sem expor dados completos
   */
  private maskSensitiveValue(value?: string): string {
    if (!value) return 'not_set';
    if (value.length <= 8) return '***'; // Valores muito curtos são completamente mascarados
    // WHY: Mostra início e fim para facilitar identificação, mas mascara o meio
    return `${value.substring(0, 4)}***${value.substring(value.length - 4)}`;
  }

  /**
   * Verifica se está em ambiente de produção
   */
  get isProduction(): boolean {
    return this.app.nodeEnv === 'production';
  }

  /**
   * Verifica se está em ambiente de desenvolvimento
   */
  get isDevelopment(): boolean {
    return this.app.nodeEnv === 'development';
  }

  /**
   * Verifica se está em ambiente de teste
   */
  get isTest(): boolean {
    return this.app.nodeEnv === 'test';
  }
}
