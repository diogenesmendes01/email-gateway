import { Module } from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service';
import { IpPoolController } from './ip-pool.controller';
import { IpPoolService } from './ip-pool.service';

@Module({
  controllers: [IpPoolController],
  providers: [IpPoolService, PrismaService],
  exports: [IpPoolService],
})
export class IpPoolModule {}

