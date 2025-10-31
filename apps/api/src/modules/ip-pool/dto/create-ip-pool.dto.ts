import { IPPoolType } from '@prisma/client';

export class CreateIpPoolDto {
  name!: string;
  type: IPPoolType = IPPoolType.SHARED;
  ipAddresses: string[] = [];
  isActive?: boolean;
  dailyLimit?: number | null;
  hourlyLimit?: number | null;
  warmupEnabled?: boolean;
  warmupConfig?: Record<string, unknown> | null;
}

