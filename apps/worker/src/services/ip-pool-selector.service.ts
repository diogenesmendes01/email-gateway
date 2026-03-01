import { prisma } from '@email-gateway/database';
import { IPPool, IPPoolType } from '@prisma/client';

export interface IPPoolSelectorParams {
  companyId: string;
  requestedPoolId?: string | null;
  fallbackType?: IPPoolType;
}

export class IPPoolSelectorService {
  /**
   * Select the best available IP Pool considering:
   * 1. Requested pool (if specified and active)
   * 2. RBL status (skip listed pools)
   * 3. Reputation (higher = better)
   * 4. Load balancing (least sentToday among same reputation tier)
   */
  static async selectPool(params: IPPoolSelectorParams): Promise<IPPool | null> {
    const { requestedPoolId, fallbackType } = params;

    // Priority 1: Exact pool by ID (unchanged behavior)
    if (requestedPoolId) {
      const pool = await prisma.iPPool.findFirst({
        where: {
          id: requestedPoolId,
          isActive: true,
        },
      });

      if (pool) {
        return pool;
      }
    }

    // Priority 2: Select by type with RBL filtering and load-based rotation
    const candidateTypes: IPPoolType[] = fallbackType
      ? [fallbackType]
      : [IPPoolType.SHARED, IPPoolType.TRANSACTIONAL, IPPoolType.MARKETING];

    for (const type of candidateTypes) {
      const pools = await prisma.iPPool.findMany({
        where: {
          type,
          isActive: true,
        },
        orderBy: [{ reputation: 'desc' }, { sentToday: 'asc' }, { createdAt: 'asc' }],
      });

      // Filter out RBL-listed pools
      const cleanPools = pools.filter((p) => !p.rblListed);

      if (cleanPools.length > 0) {
        return cleanPools[0];
      }
    }

    return null;
  }
}
