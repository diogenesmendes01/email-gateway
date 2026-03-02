import { IPPoolSelectorService } from '../ip-pool-selector.service';
import { IPPoolType } from '@email-gateway/database';

// Mock do Prisma
jest.mock('@email-gateway/database', () => ({
  prisma: {
    iPPool: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
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
  const { prisma } = require('@email-gateway/database');

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
        rblListed: false,
      };

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
          rblListed: false,
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
        rblListed: false,
        sentToday: 50,
      };

      prisma.iPPool.findFirst.mockResolvedValueOnce(null); // Requested pool not found
      prisma.iPPool.findMany.mockResolvedValueOnce([mockFallbackPool]); // Fallback found

      const result = await IPPoolSelectorService.selectPool({
        companyId: 'company-1',
        requestedPoolId: 'pool-nonexistent',
        fallbackType: IPPoolType.SHARED,
      });

      expect(result).toEqual(mockFallbackPool);
    });

    it('deve fazer fallback se o pool solicitado estiver em RBL', async () => {
      const cleanFallback = {
        id: 'pool-fallback',
        name: 'Fallback',
        type: IPPoolType.SHARED,
        isActive: true,
        reputation: 90,
        rblListed: false,
        sentToday: 10,
      };

      // Requested pool is RBL-listed, so findFirst returns null
      prisma.iPPool.findFirst.mockResolvedValueOnce(null);
      prisma.iPPool.findMany.mockResolvedValueOnce([cleanFallback]);

      const result = await IPPoolSelectorService.selectPool({
        companyId: 'company-1',
        requestedPoolId: 'pool-listed',
        fallbackType: IPPoolType.SHARED,
      });

      expect(result).toEqual(cleanFallback);
    });

    it('deve retornar null se nenhum pool estiver disponível', async () => {
      prisma.iPPool.findMany.mockResolvedValue([]);

      const result = await IPPoolSelectorService.selectPool({
        companyId: 'company-1',
        fallbackType: IPPoolType.SHARED,
      });

      expect(result).toBeNull();
    });

    it('deve ordenar pools por reputação (desc), sentToday (asc) e createdAt (asc)', async () => {
      prisma.iPPool.findMany.mockResolvedValueOnce([]);

      await IPPoolSelectorService.selectPool({
        companyId: 'company-1',
        fallbackType: IPPoolType.TRANSACTIONAL,
      });

      expect(prisma.iPPool.findMany).toHaveBeenCalledWith({
        where: { type: IPPoolType.TRANSACTIONAL, isActive: true },
        orderBy: [{ reputation: 'desc' }, { sentToday: 'asc' }, { createdAt: 'asc' }],
      });
    });

    it('deve pular pools com RBL listing e selecionar o próximo limpo', async () => {
      const listedPool = {
        id: 'pool-listed',
        name: 'Listed Pool',
        type: IPPoolType.SHARED,
        ipAddresses: ['1.2.3.4'],
        isActive: true,
        reputation: 99.0,
        rblListed: true,
        sentToday: 0,
      };
      const cleanPool = {
        id: 'pool-clean',
        name: 'Clean Pool',
        type: IPPoolType.SHARED,
        ipAddresses: ['5.6.7.8'],
        isActive: true,
        reputation: 80.0,
        rblListed: false,
        sentToday: 10,
      };

      prisma.iPPool.findMany.mockResolvedValueOnce([listedPool, cleanPool]);

      const result = await IPPoolSelectorService.selectPool({
        companyId: 'company-1',
        fallbackType: IPPoolType.SHARED,
      });

      expect(result).toEqual(cleanPool);
    });

    it('deve selecionar pool com menos envios hoje (load balancing)', async () => {
      const pool1 = {
        id: 'pool-a',
        name: 'Pool A',
        type: IPPoolType.SHARED,
        ipAddresses: ['1.1.1.1'],
        isActive: true,
        reputation: 95.0,
        rblListed: false,
        sentToday: 100,
      };
      const pool2 = {
        id: 'pool-b',
        name: 'Pool B',
        type: IPPoolType.SHARED,
        ipAddresses: ['2.2.2.2'],
        isActive: true,
        reputation: 95.0,
        rblListed: false,
        sentToday: 50,
      };

      // DB returns in order: reputation desc, sentToday asc
      prisma.iPPool.findMany.mockResolvedValue([pool2, pool1]);

      const result = await IPPoolSelectorService.selectPool({
        companyId: 'company-1',
        fallbackType: IPPoolType.SHARED,
      });

      // pool2 has fewer sends, so it should be selected first
      expect(result).toEqual(pool2);
    });

    it('deve retornar null se todos os pools estiverem em RBL', async () => {
      const listedPool1 = {
        id: 'pool-1',
        type: IPPoolType.SHARED,
        isActive: true,
        rblListed: true,
      };
      const listedPool2 = {
        id: 'pool-2',
        type: IPPoolType.TRANSACTIONAL,
        isActive: true,
        rblListed: true,
      };
      const listedPool3 = {
        id: 'pool-3',
        type: IPPoolType.MARKETING,
        isActive: true,
        rblListed: true,
      };

      prisma.iPPool.findMany
        .mockResolvedValueOnce([listedPool1]) // SHARED - all listed
        .mockResolvedValueOnce([listedPool2]) // TRANSACTIONAL - all listed
        .mockResolvedValueOnce([listedPool3]); // MARKETING - all listed

      const result = await IPPoolSelectorService.selectPool({
        companyId: 'company-1',
      });

      expect(result).toBeNull();
    });
  });
});
