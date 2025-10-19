import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';

// Modules
import { HealthModule } from './modules/health/health.module';
import { EmailModule } from './modules/email/email.module';
import { RecipientModule } from './modules/recipient/recipient.module';
import { AuthModule } from './modules/auth/auth.module';

@Module({
  imports: [
    // Configuration
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),

    // Rate limiting
    ThrottlerModule.forRoot([
      {
        ttl: parseInt(process.env.RATE_LIMIT_TTL || '60', 10) * 1000,
        limit: parseInt(process.env.RATE_LIMIT_MAX || '100', 10),
      },
    ]),

    // Feature modules
    HealthModule,
    AuthModule,
    EmailModule,
    RecipientModule,
  ],
})
export class AppModule {}
