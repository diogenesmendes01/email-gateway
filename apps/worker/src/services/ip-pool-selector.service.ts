import { prisma } from '@email-gateway/database';
import { IPPool, IPPoolType, Prisma } from '@prisma/client';

export interface IPPoolSelectorParams {
  companyId: string;
  requestedPoolId?: string | null;
  fallbackType?: IPPoolType;
}

export class IPPoolSelectorService {
  /**
   * Seleciona o melhor IP Pool disponível considerando preferências do envio.
   */
  static async selectPool(params: IPPoolSelectorParams): Promise<IPPool | null> {
    const { companyId: _companyId, requestedPoolId, fallbackType } = params;

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

    const candidateTypes: IPPoolType[] = fallbackType
      ? [fallbackType]
      : [IPPoolType.SHARED, IPPoolType.TRANSACTIONAL, IPPoolType.MARKETING];

    for (const type of candidateTypes) {
      const pool = await prisma.iPPool.findFirst({
        where: {
          type,
          isActive: true,
        },
        orderBy: [{ reputation: 'desc' }, { createdAt: 'asc' }],
      });

      if (pool) {
        return pool;
      }
    }

    return null;
  }
}

