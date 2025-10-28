import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { PrometheusModule } from '@willsoto/nestjs-prometheus';
import { RequestIdMiddleware } from './middleware/request-id.middleware';

// Modules
import { HealthModule } from './modules/health/health.module';
import { QueueModule } from './modules/queue/queue.module';
import { EmailModule } from './modules/email/email.module';
import { RecipientModule } from './modules/recipient/recipient.module';
import { AuthModule } from './modules/auth/auth.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { DomainModule } from './modules/domain/domain.module';
import { MetricsModule } from './modules/metrics/metrics.module';
import { AdminModule } from './modules/admin/admin.module';

@Module({
  imports: [
    // Configuration
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),

    // Rate limiting (configuração global - será sobrescrito pelos guards customizados)
    ThrottlerModule.forRoot([
      {
        ttl: parseInt(process.env.RATE_LIMIT_TTL || '60', 10) * 1000,
        limit: parseInt(process.env.RATE_LIMIT_MAX || '100', 10),
      },
    ]),

    // TASK-020: Prometheus metrics
    PrometheusModule.register({
      path: '/metrics',
      defaultMetrics: {
        enabled: true,
        config: {
          prefix: 'email_gateway_api_',
        },
      },
    }),

    // Feature modules
    HealthModule,
    AuthModule,
    QueueModule,
    EmailModule,
    RecipientModule,
    DashboardModule,
    DomainModule,
    MetricsModule,
    AdminModule, // TASK-021: Admin DLQ management
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // TASK 8.3: Request ID middleware for end-to-end correlation
    consumer
      .apply(RequestIdMiddleware)
      .forRoutes('*');
  }
}
