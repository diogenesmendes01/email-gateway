import { RBLMonitorService, RBL_PROVIDERS } from '../rbl-monitor.service';

// Mock dns/promises
const mockResolve4 = jest.fn();
jest.mock('dns/promises', () => ({
  resolve4: (...args: any[]) => mockResolve4(...args),
}));

// Mock Prisma
jest.mock('@email-gateway/database', () => ({
  prisma: {
    rBLCheck: {
      create: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
    iPPool: {
      findMany: jest.fn(),
      update: jest.fn(),
    },
  },
}));

describe('RBLMonitorService', () => {
  let service: RBLMonitorService;
  const { prisma } = require('@email-gateway/database');

  beforeEach(() => {
    jest.clearAllMocks();
    service = new RBLMonitorService();
  });

  describe('reverseIP', () => {
    it('should reverse an IPv4 address', () => {
      expect(service.reverseIP('192.168.1.10')).toBe('10.1.168.192');
    });

    it('should handle simple IP', () => {
      expect(service.reverseIP('1.2.3.4')).toBe('4.3.2.1');
    });
  });

  describe('checkSingleRBL', () => {
    it('should return listed=true when DNS resolves', async () => {
      mockResolve4.mockResolvedValueOnce(['127.0.0.2']);

      const result = await service.checkSingleRBL('192.168.1.10', 'zen.spamhaus.org');

      expect(result.listed).toBe(true);
      expect(result.returnCode).toBe('127.0.0.2');
      expect(mockResolve4).toHaveBeenCalledWith('10.1.168.192.zen.spamhaus.org');
    });

    it('should return listed=false when DNS fails with ENOTFOUND', async () => {
      mockResolve4.mockRejectedValueOnce({ code: 'ENOTFOUND' });

      const result = await service.checkSingleRBL('192.168.1.10', 'zen.spamhaus.org');

      expect(result.listed).toBe(false);
      expect(result.returnCode).toBeNull();
    });

    it('should return listed=false on DNS timeout (ETIMEOUT)', async () => {
      mockResolve4.mockRejectedValueOnce({ code: 'ETIMEOUT' });

      const result = await service.checkSingleRBL('192.168.1.10', 'zen.spamhaus.org');

      expect(result.listed).toBe(false);
    });
  });

  describe('checkIP', () => {
    it('should check IP against all RBL providers and save results', async () => {
      mockResolve4.mockRejectedValue({ code: 'ENOTFOUND' });
      prisma.rBLCheck.create.mockResolvedValue({});

      const results = await service.checkIP('192.168.1.10');

      expect(results).toHaveLength(RBL_PROVIDERS.length);
      expect(results.every((r: any) => r.listed === false)).toBe(true);
      expect(prisma.rBLCheck.create).toHaveBeenCalledTimes(RBL_PROVIDERS.length);
    });

    it('should detect listing on specific provider', async () => {
      mockResolve4
        .mockResolvedValueOnce(['127.0.0.2']) // first provider - listed
        .mockRejectedValue({ code: 'ENOTFOUND' }); // rest - not listed

      prisma.rBLCheck.create.mockResolvedValue({});

      const results = await service.checkIP('192.168.1.10');

      const listedResults = results.filter((r: any) => r.listed);
      expect(listedResults).toHaveLength(1);
      expect(listedResults[0].provider).toBe(RBL_PROVIDERS[0].host);
    });

    it('should pass ipPoolId when provided', async () => {
      mockResolve4.mockRejectedValue({ code: 'ENOTFOUND' });
      prisma.rBLCheck.create.mockResolvedValue({});

      await service.checkIP('1.2.3.4', 'pool-123');

      expect(prisma.rBLCheck.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ ipPoolId: 'pool-123' }),
        }),
      );
    });
  });

  describe('checkAllPools', () => {
    it('should check all active IP pools and update rblListed flag', async () => {
      prisma.iPPool.findMany.mockResolvedValueOnce([
        { id: 'pool-1', ipAddresses: ['1.2.3.4'], isActive: true },
        { id: 'pool-2', ipAddresses: ['5.6.7.8'], isActive: true },
      ]);

      mockResolve4.mockRejectedValue({ code: 'ENOTFOUND' });
      prisma.rBLCheck.create.mockResolvedValue({});
      prisma.iPPool.update.mockResolvedValue({});

      const results = await service.checkAllPools();

      expect(results).toHaveLength(2);
      expect(prisma.iPPool.update).toHaveBeenCalledTimes(2);
      expect(prisma.iPPool.update).toHaveBeenCalledWith({
        where: { id: 'pool-1' },
        data: { rblListed: false, rblLastCheck: expect.any(Date) },
      });
    });

    it('should mark pool as rblListed when any IP is listed', async () => {
      prisma.iPPool.findMany.mockResolvedValueOnce([
        { id: 'pool-1', ipAddresses: ['1.2.3.4'], isActive: true },
      ]);

      mockResolve4
        .mockResolvedValueOnce(['127.0.0.2'])
        .mockRejectedValue({ code: 'ENOTFOUND' });

      prisma.rBLCheck.create.mockResolvedValue({});
      prisma.iPPool.update.mockResolvedValue({});

      await service.checkAllPools();

      expect(prisma.iPPool.update).toHaveBeenCalledWith({
        where: { id: 'pool-1' },
        data: { rblListed: true, rblLastCheck: expect.any(Date) },
      });
    });

    it('should return empty array when no pools exist', async () => {
      prisma.iPPool.findMany.mockResolvedValueOnce([]);

      const results = await service.checkAllPools();

      expect(results).toEqual([]);
    });
  });

  describe('getListedIPs', () => {
    it('should return currently listed RBL checks', async () => {
      const mockChecks = [
        { ipAddress: '1.2.3.4', provider: 'zen.spamhaus.org', listed: true },
      ];
      prisma.rBLCheck.findMany.mockResolvedValueOnce(mockChecks);

      const result = await service.getListedIPs();

      expect(result).toEqual(mockChecks);
      expect(prisma.rBLCheck.findMany).toHaveBeenCalledWith({
        where: { listed: true, resolvedAt: null },
        orderBy: { checkedAt: 'desc' },
      });
    });
  });

  describe('markResolved', () => {
    it('should mark listings as resolved', async () => {
      prisma.rBLCheck.findMany.mockResolvedValueOnce([
        { id: 'check-1', ipAddress: '1.2.3.4', provider: 'zen.spamhaus.org' },
      ]);
      prisma.rBLCheck.update.mockResolvedValue({});

      await service.markResolved('1.2.3.4', 'zen.spamhaus.org');

      expect(prisma.rBLCheck.update).toHaveBeenCalledWith({
        where: { id: 'check-1' },
        data: { resolvedAt: expect.any(Date) },
      });
    });

    it('should handle no unresolved listings', async () => {
      prisma.rBLCheck.findMany.mockResolvedValueOnce([]);

      await service.markResolved('1.2.3.4', 'zen.spamhaus.org');

      expect(prisma.rBLCheck.update).not.toHaveBeenCalled();
    });
  });
});
