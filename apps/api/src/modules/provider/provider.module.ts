import { Module } from '@nestjs/common';
import { ProviderController } from './provider.controller';
import { ProviderService } from './provider.service';
import { PrismaService } from '../../database/prisma.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [ProviderController],
  providers: [ProviderService, PrismaService],
  exports: [ProviderService],
})
export class ProviderModule {}

