import { IPPoolType } from '@prisma/client';

export class UpdateIpPoolDto {
  name?: string;
  type?: IPPoolType;
  ipAddresses?: string[];
  isActive?: boolean;
  dailyLimit?: number | null;
  hourlyLimit?: number | null;
  warmupEnabled?: boolean;
  warmupConfig?: Record<string, unknown> | null;
}

