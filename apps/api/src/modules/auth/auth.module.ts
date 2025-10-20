import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

// Services
import { AuthService } from './auth.service';

// Guards
import { ApiKeyGuard } from './auth.guard';
import { RateLimitGuard } from './rate-limit.guard';
import { BasicAuthGuard } from './basic-auth.guard';

// Interceptors
import { AuditInterceptor } from './audit.interceptor';

@Module({
  imports: [ConfigModule],
  controllers: [],
  providers: [
    AuthService,
    ApiKeyGuard,
    RateLimitGuard,
    BasicAuthGuard,
    AuditInterceptor,
  ],
  exports: [
    AuthService,
    ApiKeyGuard,
    RateLimitGuard,
    BasicAuthGuard,
    AuditInterceptor,
  ],
})
export class AuthModule {}
