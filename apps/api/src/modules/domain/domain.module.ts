/**
 * @email-gateway/api - Domain Management Module
 *
 * Módulo para gerenciamento de domínios, DNS e configurações SES
 *
 * TASK 6.2 — SES, domínio e DNS (SPF/DKIM)
 */

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

// Controllers
import { DomainController } from './domain.controller';
import { DNSRecordsController } from './dns-records.controller';

// Services
import { DomainService } from './domain.service';

// Auth Module (para guards)
import { AuthModule } from '../auth/auth.module';

// Database Module (para PrismaService)
import { DatabaseModule } from '../../database/database.module';

@Module({
  imports: [
    ConfigModule,
    AuthModule, // Para usar guards de autenticação
    DatabaseModule, // Para usar PrismaService
  ],
  controllers: [DomainController, DNSRecordsController],
  providers: [DomainService],
  exports: [DomainService],
})
export class DomainModule {}
