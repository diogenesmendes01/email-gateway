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
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn(),
    },
    iPPool: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
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
    // Default: markResolved finds nothing
    prisma.rBLCheck.findMany.mockResolvedValue([]);
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

    it('should return listed=false when DNS fails with ENODATA', async () => {
      mockResolve4.mockRejectedValueOnce({ code: 'ENODATA' });

      const result = await service.checkSingleRBL('192.168.1.10', 'zen.spamhaus.org');

      expect(result.listed).toBe(false);
      expect(result.returnCode).toBeNull();
    });

    it('should return listed=null on DNS timeout (ETIMEOUT) - cannot determine', async () => {
      mockResolve4.mockRejectedValueOnce({ code: 'ETIMEOUT' });

      const result = await service.checkSingleRBL('192.168.1.10', 'zen.spamhaus.org');

      expect(result.listed).toBeNull();
      expect(result.returnCode).toBe('ETIMEOUT');
    });

    it('should return listed=null on ESERVFAIL - cannot determine', async () => {
      mockResolve4.mockRejectedValueOnce({ code: 'ESERVFAIL' });

      const result = await service.checkSingleRBL('192.168.1.10', 'zen.spamhaus.org');

      expect(result.listed).toBeNull();
      expect(result.returnCode).toBe('ESERVFAIL');
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

      const listedResults = results.filter((r: any) => r.listed === true);
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

    it('should NOT persist DNS error results (listed=null)', async () => {
      mockResolve4.mockRejectedValue({ code: 'ETIMEOUT' });

      const results = await service.checkIP('1.2.3.4');

      expect(results).toHaveLength(RBL_PROVIDERS.length);
      expect(results.every((r: any) => r.listed === null)).toBe(true);
      // No create calls for null results
      expect(prisma.rBLCheck.create).not.toHaveBeenCalled();
    });

    it('should auto-resolve previously listed entries when IP is clean', async () => {
      mockResolve4.mockRejectedValue({ code: 'ENOTFOUND' });
      prisma.rBLCheck.create.mockResolvedValue({});
      // markResolved will find and update one entry
      prisma.rBLCheck.findMany.mockResolvedValue([
        { id: 'old-check-1', ipAddress: '1.2.3.4', provider: 'zen.spamhaus.org' },
      ]);
      prisma.rBLCheck.update.mockResolvedValue({});

      await service.checkIP('1.2.3.4');

      // markResolved should be called for each provider (since all are clean)
      expect(prisma.rBLCheck.findMany).toHaveBeenCalled();
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
      // Pool update should NOT include reputation when clean
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
      prisma.iPPool.findUnique.mockResolvedValueOnce({ id: 'pool-1', reputation: 100 });
      prisma.iPPool.update.mockResolvedValue({});

      await service.checkAllPools();

      expect(prisma.iPPool.update).toHaveBeenCalledWith({
        where: { id: 'pool-1' },
        data: { reputation: 85, rblListed: true, rblLastCheck: expect.any(Date) },
      });
    });

    it('should aggregate listings across multiple IPs before updating pool', async () => {
      prisma.iPPool.findMany.mockResolvedValueOnce([
        { id: 'pool-1', ipAddresses: ['1.2.3.4', '5.6.7.8'], isActive: true },
      ]);

      // First IP: listed on provider 1, rest clean
      // Second IP: listed on provider 1, rest clean
      mockResolve4
        // IP 1.2.3.4 providers
        .mockResolvedValueOnce(['127.0.0.2']) // provider 1 - listed
        .mockRejectedValueOnce({ code: 'ENOTFOUND' })
        .mockRejectedValueOnce({ code: 'ENOTFOUND' })
        .mockRejectedValueOnce({ code: 'ENOTFOUND' })
        .mockRejectedValueOnce({ code: 'ENOTFOUND' })
        // IP 5.6.7.8 providers
        .mockResolvedValueOnce(['127.0.0.3']) // provider 1 - listed
        .mockRejectedValueOnce({ code: 'ENOTFOUND' })
        .mockRejectedValueOnce({ code: 'ENOTFOUND' })
        .mockRejectedValueOnce({ code: 'ENOTFOUND' })
        .mockRejectedValue({ code: 'ENOTFOUND' });

      prisma.rBLCheck.create.mockResolvedValue({});
      prisma.iPPool.findUnique.mockResolvedValueOnce({ id: 'pool-1', reputation: 100 });
      prisma.iPPool.update.mockResolvedValue({});

      const results = await service.checkAllPools();

      // Should update pool ONCE with aggregated count (2 total listings)
      expect(prisma.iPPool.update).toHaveBeenCalledTimes(1);
      expect(prisma.iPPool.update).toHaveBeenCalledWith({
        where: { id: 'pool-1' },
        data: { reputation: 70, rblListed: true, rblLastCheck: expect.any(Date) },
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

  describe('checkAllPools with onListed callback', () => {
    it('should call onListed callback when IP is blacklisted', async () => {
      prisma.iPPool.findMany.mockResolvedValueOnce([
        { id: 'pool-1', ipAddresses: ['1.2.3.4'], isActive: true },
      ]);

      mockResolve4
        .mockResolvedValueOnce(['127.0.0.2'])
        .mockRejectedValue({ code: 'ENOTFOUND' });

      prisma.rBLCheck.create.mockResolvedValue({});
      prisma.iPPool.findUnique.mockResolvedValueOnce({ id: 'pool-1', reputation: 100 });
      prisma.iPPool.update.mockResolvedValue({});

      const onListed = jest.fn();
      await service.checkAllPools({ onListed });

      expect(onListed).toHaveBeenCalledWith(
        expect.objectContaining({
          poolId: 'pool-1',
          ipAddress: '1.2.3.4',
          isListed: true,
        }),
      );
    });

    it('should not call onListed when IP is clean', async () => {
      prisma.iPPool.findMany.mockResolvedValueOnce([
        { id: 'pool-1', ipAddresses: ['1.2.3.4'], isActive: true },
      ]);

      mockResolve4.mockRejectedValue({ code: 'ENOTFOUND' });
      prisma.rBLCheck.create.mockResolvedValue({});
      prisma.iPPool.update.mockResolvedValue({});

      const onListed = jest.fn();
      await service.checkAllPools({ onListed });

      expect(onListed).not.toHaveBeenCalled();
    });
  });

  describe('updatePoolReputation', () => {
    it('should reduce pool reputation from current value when listed', async () => {
      prisma.iPPool.findUnique.mockResolvedValueOnce({ id: 'pool-1', reputation: 100 });
      prisma.iPPool.update.mockResolvedValue({});

      await service.updatePoolReputation('pool-1', true, 2);

      expect(prisma.iPPool.update).toHaveBeenCalledWith({
        where: { id: 'pool-1' },
        data: {
          reputation: 70, // max(0, 100 - 2*15) = 70
          rblListed: true,
          rblLastCheck: expect.any(Date),
        },
      });
    });

    it('should NOT reset reputation to 100 when clean - only update flag', async () => {
      prisma.iPPool.update.mockResolvedValue({});

      await service.updatePoolReputation('pool-1', false, 0);

      expect(prisma.iPPool.update).toHaveBeenCalledWith({
        where: { id: 'pool-1' },
        data: {
          rblListed: false,
          rblLastCheck: expect.any(Date),
        },
      });
      // Should NOT include reputation in the update
      const callData = prisma.iPPool.update.mock.calls[0][0].data;
      expect(callData).not.toHaveProperty('reputation');
    });

    it('should not go below 0 reputation', async () => {
      prisma.iPPool.findUnique.mockResolvedValueOnce({ id: 'pool-1', reputation: 50 });
      prisma.iPPool.update.mockResolvedValue({});

      await service.updatePoolReputation('pool-1', true, 10);

      const callData = prisma.iPPool.update.mock.calls[0][0].data;
      expect(callData.reputation).toBe(0); // max(0, 50 - 150) = 0
    });

    it('should apply penalty relative to current reputation', async () => {
      prisma.iPPool.findUnique.mockResolvedValueOnce({ id: 'pool-1', reputation: 80 });
      prisma.iPPool.update.mockResolvedValue({});

      await service.updatePoolReputation('pool-1', true, 1);

      const callData = prisma.iPPool.update.mock.calls[0][0].data;
      expect(callData.reputation).toBe(65); // max(0, 80 - 15) = 65
    });
  });
});
