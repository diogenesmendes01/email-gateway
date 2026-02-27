/**
 * @email-gateway/api - Domain Management Module
 *
 * Módulo para gerenciamento de domínios e DNS (SPF/DKIM)
 * Verificação de domínio via registros DNS, sem dependência de AWS SES.
 */

import { Module } from '@nestjs/common';

// Controllers
import { DomainController } from './domain.controller';
import { DNSRecordsController } from './dns-records.controller';

// Services
import { DomainService } from './domain.service';

// Auth Module (para guards)
import { AuthModule } from '../auth/auth.module';

// Database Module (para PrismaService)
import { DatabaseModule } from '../../database/database.module';

// Metrics Module (para métricas de bloqueio)
import { MetricsModule } from '../metrics/metrics.module';

@Module({
  imports: [
    AuthModule,
    DatabaseModule,
    MetricsModule,
  ],
  controllers: [DomainController, DNSRecordsController],
  providers: [DomainService],
  exports: [DomainService],
})
export class DomainModule {}
