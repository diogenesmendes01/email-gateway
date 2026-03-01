import { ReputationMonitorService } from '../reputation-monitor.service';

describe('ReputationMonitorService', () => {
  describe('calculateReputationScore', () => {
    let service: ReputationMonitorService;
    const mockPrisma = {
      emailLog: { count: jest.fn() },
      emailTracking: { count: jest.fn() },
      company: { update: jest.fn() },
      rateLimit: { upsert: jest.fn() },
      domain: { findFirst: jest.fn() },
      reputationMetric: { create: jest.fn() },
      suppression: { deleteMany: jest.fn() },
      rBLCheck: { findMany: jest.fn(), count: jest.fn().mockResolvedValue(0) },
      emailProviderConfig: { findMany: jest.fn().mockResolvedValue([]) },
    } as any;

    beforeEach(() => {
      jest.clearAllMocks();
      service = new ReputationMonitorService(mockPrisma);
    });

    it('should return 100 for perfect metrics without RBL penalty', () => {
      const metrics = {
        sent: 1000, delivered: 1000, bounced: 0, bouncedHard: 0, bouncedSoft: 0,
        complained: 0, opened: 0, clicked: 0,
        bounceRate: 0, complaintRate: 0, openRate: 0, clickRate: 0,
        sentToday: 1000,
      };

      const score = service.calculateReputationScore(metrics);
      expect(score).toBe(100);
    });

    it('should return 100 when explicitly passing rblListingCount=0', () => {
      const metrics = {
        sent: 1000, delivered: 1000, bounced: 0, bouncedHard: 0, bouncedSoft: 0,
        complained: 0, opened: 0, clicked: 0,
        bounceRate: 0, complaintRate: 0, openRate: 0, clickRate: 0,
        sentToday: 1000,
      };

      const score = service.calculateReputationScore(metrics, { rblListingCount: 0 });
      expect(score).toBe(100);
    });

    it('should penalize 15 points per RBL listing', () => {
      const metrics = {
        sent: 1000, delivered: 990, bounced: 10, bouncedHard: 5, bouncedSoft: 5,
        complained: 0, opened: 0, clicked: 0,
        bounceRate: 0.01, complaintRate: 0, openRate: 0, clickRate: 0,
        sentToday: 1000,
      };

      const scoreClean = service.calculateReputationScore(metrics, { rblListingCount: 0 });
      const score1Listing = service.calculateReputationScore(metrics, { rblListingCount: 1 });
      const score3Listings = service.calculateReputationScore(metrics, { rblListingCount: 3 });

      expect(scoreClean).toBeGreaterThan(score1Listing);
      expect(score1Listing).toBeGreaterThan(score3Listings);
      expect(scoreClean - score1Listing).toBe(15);
      expect(score1Listing - score3Listings).toBe(30);
    });

    it('should not go below 0 with RBL penalties', () => {
      const badMetrics = {
        sent: 100, delivered: 50, bounced: 50, bouncedHard: 40, bouncedSoft: 10,
        complained: 5, opened: 0, clicked: 0,
        bounceRate: 0.5, complaintRate: 0.05, openRate: 0, clickRate: 0,
        sentToday: 100,
      };

      const score = service.calculateReputationScore(badMetrics, { rblListingCount: 5 });
      expect(score).toBe(0);
    });

    it('should add engagement bonus with RBL penalty combined', () => {
      const metricsWithEngagement = {
        sent: 1000, delivered: 1000, bounced: 0, bouncedHard: 0, bouncedSoft: 0,
        complained: 0, opened: 500, clicked: 100,
        bounceRate: 0, complaintRate: 0, openRate: 0.5, clickRate: 0.1,
        sentToday: 1000,
      };

      // engagementRate = (0.5 + 0.1) / 2 = 0.3 -> bonus = 0.3 * 20 = 6
      // score = 100 + 6 = 106, capped at 100
      const scoreClean = service.calculateReputationScore(metricsWithEngagement, { rblListingCount: 0 });
      const scoreListed = service.calculateReputationScore(metricsWithEngagement, { rblListingCount: 1 });

      expect(scoreClean).toBe(100); // 100 + 6 bonus capped at 100
      expect(scoreListed).toBeLessThan(scoreClean);
    });

    it('should work without context parameter (backward compatible)', () => {
      const metrics = {
        sent: 1000, delivered: 1000, bounced: 0, bouncedHard: 0, bouncedSoft: 0,
        complained: 0, opened: 0, clicked: 0,
        bounceRate: 0, complaintRate: 0, openRate: 0, clickRate: 0,
        sentToday: 1000,
      };

      // Should not throw when called without context
      const score = service.calculateReputationScore(metrics);
      expect(score).toBe(100);
    });
  });
});
