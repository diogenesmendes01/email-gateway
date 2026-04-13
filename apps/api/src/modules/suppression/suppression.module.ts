import { Module } from '@nestjs/common';
import { SuppressionController } from './suppression.controller';
import { SuppressionService } from './suppression.service';
import { DatabaseModule } from '../../database/database.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [DatabaseModule, AuthModule],
  controllers: [SuppressionController],
  providers: [SuppressionService],
  exports: [SuppressionService],
})
export class SuppressionModule {}
