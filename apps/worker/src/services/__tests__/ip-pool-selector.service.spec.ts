import { IPPoolSelectorService } from '../ip-pool-selector.service';
import { IPPoolType } from '@email-gateway/database';

// Mock do Prisma
jest.mock('@email-gateway/database', () => ({
  prisma: {
    iPPool: {
      findFirst: jest.fn(),
    },
  },
  IPPoolType: {
    SHARED: 'SHARED',
    TRANSACTIONAL: 'TRANSACTIONAL',
    MARKETING: 'MARKETING',
    DEDICATED: 'DEDICATED',
  },
}));

describe('IPPoolSelectorService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('selectPool', () => {
    it('deve retornar o pool solicitado se existir e estiver ativo', async () => {
      const mockPool = {
        id: 'pool-1',
        name: 'Test Pool',
        type: IPPoolType.TRANSACTIONAL,
        ipAddresses: ['192.168.1.1'],
        isActive: true,
        reputation: 95.0,
      };

      const { prisma } = require('@email-gateway/database');
      prisma.iPPool.findFirst.mockResolvedValueOnce(mockPool);

      const result = await IPPoolSelectorService.selectPool({
        companyId: 'company-1',
        requestedPoolId: 'pool-1',
        fallbackType: IPPoolType.SHARED,
      });

      expect(result).toEqual(mockPool);
      expect(prisma.iPPool.findFirst).toHaveBeenCalledWith({
        where: {
          id: 'pool-1',
          isActive: true,
        },
      });
    });

    it('deve fazer fallback para o tipo especificado se o pool solicitado não existir', async () => {
      const mockFallbackPool = {
        id: 'pool-2',
        name: 'Fallback Pool',
        type: IPPoolType.SHARED,
        ipAddresses: ['192.168.1.2'],
        isActive: true,
        reputation: 90.0,
      };

      const { prisma } = require('@email-gateway/database');
      prisma.iPPool.findFirst
        .mockResolvedValueOnce(null) // Pool solicitado não existe
        .mockResolvedValueOnce(mockFallbackPool); // Fallback encontrado

      const result = await IPPoolSelectorService.selectPool({
        companyId: 'company-1',
        requestedPoolId: 'pool-nonexistent',
        fallbackType: IPPoolType.SHARED,
      });

      expect(result).toEqual(mockFallbackPool);
      expect(prisma.iPPool.findFirst).toHaveBeenCalledTimes(2);
    });

    it('deve retornar null se nenhum pool estiver disponível', async () => {
      const { prisma } = require('@email-gateway/database');
      prisma.iPPool.findFirst.mockResolvedValue(null);

      const result = await IPPoolSelectorService.selectPool({
        companyId: 'company-1',
        fallbackType: IPPoolType.SHARED,
      });

      expect(result).toBeNull();
    });

    it('deve ordenar pools por reputação (desc) e data de criação (asc)', async () => {
      const mockPool = {
        id: 'pool-3',
        name: 'High Reputation Pool',
        type: IPPoolType.TRANSACTIONAL,
        ipAddresses: ['192.168.1.3'],
        isActive: true,
        reputation: 98.5,
      };

      const { prisma } = require('@email-gateway/database');
      prisma.iPPool.findFirst.mockResolvedValueOnce(mockPool);

      await IPPoolSelectorService.selectPool({
        companyId: 'company-1',
        fallbackType: IPPoolType.TRANSACTIONAL,
      });

      expect(prisma.iPPool.findFirst).toHaveBeenCalledWith({
        where: { type: IPPoolType.TRANSACTIONAL, isActive: true },
        orderBy: [{ reputation: 'desc' }, { createdAt: 'asc' }],
      });
    });
  });
});

