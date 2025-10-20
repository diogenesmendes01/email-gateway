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

// Services
import { DomainService } from './domain.service';

// Auth Module (para guards)
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    ConfigModule,
    AuthModule, // Para usar guards de autenticação
  ],
  controllers: [DomainController],
  providers: [DomainService],
  exports: [DomainService],
})
export class DomainModule {}
