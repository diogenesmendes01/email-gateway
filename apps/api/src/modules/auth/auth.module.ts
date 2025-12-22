import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MetricsModule } from '../metrics/metrics.module';

// Services
import { AuthService } from './auth.service';
import { RedisService } from './redis.service';

// Guards
import { ApiKeyGuard } from './auth.guard';
import { RateLimitGuard } from './rate-limit.guard';
import { BasicAuthGuard } from './basic-auth.guard';

// Interceptors
import { AuditInterceptor } from './audit.interceptor';

@Module({
  imports: [ConfigModule, MetricsModule],
  controllers: [],
  providers: [
    AuthService,
    RedisService,
    ApiKeyGuard,
    RateLimitGuard,
    BasicAuthGuard,
    AuditInterceptor,
  ],
  exports: [
    AuthService,
    RedisService,
    ApiKeyGuard,
    RateLimitGuard,
    BasicAuthGuard,
    AuditInterceptor,
  ],
})
export class AuthModule {}
