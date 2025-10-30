import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule'; // TASK-030: Cron jobs support
import { PrometheusModule } from '@willsoto/nestjs-prometheus';
import { RequestIdMiddleware } from './middleware/request-id.middleware';

// Configuration
import { ConfigModule } from './config/config.module'; // TASK-026: Centralized config with Secrets Manager

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
import { WebhookModule } from './modules/webhook/webhook.module'; // TASK-023
import { CompanyModule } from './modules/company/company.module'; // TASK-036
import { OnboardingModule } from './modules/onboarding/onboarding.module'; // ESP Migration
import { ReputationModule } from './modules/reputation/reputation.module'; // ESP Migration
import { SuppressionModule } from './modules/suppression/suppression.module'; // ESP Migration

@Module({
  imports: [
    // TASK-026: Configuration with AWS Secrets Manager support
    ConfigModule,

    // Rate limiting (configuração global - será sobrescrito pelos guards customizados)
    ThrottlerModule.forRoot([
      {
        ttl: parseInt(process.env.RATE_LIMIT_TTL || '60', 10) * 1000,
        limit: parseInt(process.env.RATE_LIMIT_MAX || '100', 10),
      },
    ]),

    // TASK-030: Cron jobs for reputation monitoring
    ScheduleModule.forRoot(),

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
    WebhookModule, // TASK-023: Webhook notification system
    CompanyModule, // TASK-036: Company registration
    OnboardingModule, // ESP Migration: Domain onboarding
    ReputationModule, // ESP Migration: Reputation monitoring
    SuppressionModule, // ESP Migration: Email suppression
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
