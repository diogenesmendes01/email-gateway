import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger, ValidationPipe } from '@nestjs/common';
import { AppConfigService } from './config/app.config';
import { AllExceptionsFilter } from './filters/http-exception.filter';

async function bootstrap() {
  const logger = new Logger('Bootstrap');

  try {
    // Validação das variáveis de ambiente críticas
    const configService = new AppConfigService(null as any);
    
    logger.log('✅ Environment validation passed');
    logger.log(`🌍 Environment: ${configService.app.nodeEnv}`);
    logger.log(`🚀 Port: ${configService.app.port}`);
    logger.log(`📡 API Prefix: ${configService.app.apiPrefix}`);
    
    // Log de configurações (sem dados sensíveis)
    logger.debug('Configuration loaded:', configService.getAll());

  } catch (error) {
    logger.error('❌ Environment validation failed:', (error as Error).message);
    logger.error('Check your .env file and ensure all required variables are set');
    logger.error('See env.example for reference');
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
