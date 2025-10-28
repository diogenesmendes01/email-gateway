import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger, ValidationPipe } from '@nestjs/common';
import { AppConfigService } from './config/app.config';
import { SecretsService } from './config/secrets.service';
import { AllExceptionsFilter } from './filters/http-exception.filter';
import { validateEncryptionKey, getKeyGenerationHelp } from './utils/key-validation';

async function bootstrap() {
  const logger = new Logger('Bootstrap');

  try {
    // Validação das variáveis de ambiente críticas
    const configService = new AppConfigService(null as any);

    logger.log('✅ Environment validation passed');

    // TASK-026: Initialize and validate AWS Secrets Manager (if enabled)
    const secretsService = new SecretsService();
    let encryptionKey: string;

    if (process.env.NODE_ENV === 'production' ||
        process.env.NODE_ENV === 'staging' ||
        process.env.USE_SECRETS_MANAGER === 'true') {
      logger.log('🔐 Fetching secrets from AWS Secrets Manager...');

      try {
        // Validate AWS Secrets Manager connectivity and fetch encryption key
        encryptionKey = await secretsService.getEncryptionKey();
        logger.log('✅ AWS Secrets Manager integration successful');
      } catch (error) {
        logger.error('❌ Failed to fetch secrets from AWS Secrets Manager');
        logger.error((error as Error).message);
        logger.error('');
        logger.error('Ensure:');
        logger.error('  1. IAM role has secretsmanager:GetSecretValue permission');
        logger.error('  2. Secrets exist in AWS Secrets Manager:');
        logger.error('     - email-gateway/encryption-key');
        logger.error('  3. AWS_REGION is set correctly');
        logger.error('');
        logger.error('For development, set USE_SECRETS_MANAGER=false');
        process.exit(1);
      }
    } else {
      // Development mode: use environment variables
      logger.warn('⚠️  Using environment variables for secrets (development mode only!)');
      encryptionKey = process.env.ENCRYPTION_KEY || '';
    }

    // TASK-007: Validate encryption key strength
    if (!encryptionKey) {
      logger.error('❌ ENCRYPTION_KEY is not set');
      logger.error('');
      logger.error(getKeyGenerationHelp());
      process.exit(1);
    }

    const keyValidation = validateEncryptionKey(encryptionKey);
    if (!keyValidation.valid) {
      logger.error(`❌ ${keyValidation.error}`);
      logger.error('');
      logger.error(getKeyGenerationHelp());
      process.exit(1);
    }

    logger.log('✅ Encryption key validation passed');
    logger.log(`🌍 Environment: ${configService.app.nodeEnv}`);
    logger.log(`🚀 Port: ${configService.app.port}`);
    logger.log(`📡 API Prefix: ${configService.app.apiPrefix}`);

    // Log de configurações (sem dados sensíveis)
    logger.debug('Configuration loaded:', configService.getAll());

  } catch (error) {
    logger.error('❌ Environment validation failed:', (error as Error).message);
    logger.error('Check your .env file and ensure all required variables are set');
    logger.error('See .env.example for reference');
    process.exit(1);
  }

  const app = await NestFactory.create(AppModule);

  // Global prefix
  const prefix = process.env.API_PREFIX || 'v1';
  app.setGlobalPrefix(prefix);

  // TASK 8.3: Global exception filter for consistent error handling
  app.useGlobalFilters(new AllExceptionsFilter());

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // CORS
  app.enableCors({
    origin: process.env.CORS_ORIGIN || '*',
    credentials: true,
  });

  // Start server
  const port = process.env.PORT || 3000;
  await app.listen(port);

  logger.log(`🚀 API running on: http://localhost:${port}/${prefix}`);
  logger.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  logger.log(`📊 Health checks available at: http://localhost:${port}/${prefix}/health/healthz`);
  logger.log(`🔍 Readiness checks available at: http://localhost:${port}/${prefix}/health/readyz`);
}

bootstrap();
