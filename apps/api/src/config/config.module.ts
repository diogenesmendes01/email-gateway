/**
 * Configuration Module
 *
 * TASK-026: Production Readiness - Configuration Management
 *
 * Provides centralized configuration services:
 * - AppConfigService: Environment variable validation and typed access
 * - SecretsService: AWS Secrets Manager integration for production secrets
 */

import { Global, Module } from '@nestjs/common';
import { ConfigModule as NestConfigModule } from '@nestjs/config';
import { AppConfigService } from './app.config';
import { SecretsService } from './secrets.service';

@Global()
@Module({
  imports: [
    NestConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
  ],
  providers: [AppConfigService, SecretsService],
  exports: [AppConfigService, SecretsService],
})
export class ConfigModule {}
