import { MetricsService } from '../../services/metrics.service';

describe('MetricsService - alerts', () => {
  const zset: Array<{ key: string; score: number; value: string }> = [];
  const hmap: Record<string, Record<string, string>> = {};

  const redis = {
    zadd: jest.fn(async (key: string, score: number, value: string) => {
      zset.push({ key, score, value });
    }),
    zremrangebyscore: jest.fn(async () => {}),
    zrangebyscore: jest.fn(async (key: string, min: number) => {
      return zset
        .filter((e) => e.key === key && e.score >= min)
        .map((e) => e.value);
    }),
    hincrby: jest.fn(async (key: string, field: string, inc: number) => {
      hmap[key] = hmap[key] || {};
      hmap[key][field] = String((parseInt(hmap[key][field] || '0', 10) + inc));
    }),
    hvals: jest.fn(async (key: string) => Object.values(hmap[key] || {})),
    hgetall: jest.fn(async (key: string) => hmap[key] || {}),
    expire: jest.fn(async () => {}),
  } as any;

  const queue = {
    getJobCounts: jest.fn(async (...types: string[]) => {
      const map: any = { waiting: 0, active: 0, delayed: 0, failed: 0 };
      const res: any = {};
      types.forEach((t) => (res[t] = map[t] || 0));
      return res;
    }),
    getWaitingCount: jest.fn(async () => 0),
    getActiveCount: jest.fn(async () => 0),
    getCompletedCount: jest.fn(async () => 0),
    getFailedCount: jest.fn(async () => 0),
    getDelayedCount: jest.fn(async () => 0),
    getPrioritizedCount: jest.fn(async () => 0),
  } as any;

  const service = new MetricsService(redis, queue);

  beforeEach(() => {
    zset.length = 0;
    for (const k of Object.keys(hmap)) delete hmap[k];
    jest.clearAllMocks();
  });

  it('should not raise alerts when below thresholds', async () => {
    const now = Date.now();
    await service.recordQueueAge(now - 1000); // 1s age
    const res = await service.checkAlerts();
    expect(res.dlqAlert).toBe(false);
    expect(res.queueAgeAlert).toBe(false);
  });

  it('should raise alerts when DLQ>100 and queueAgeP95>120s', async () => {
    // simulate queueAge ~130s
    const now = Date.now();
    await redis.zadd('metrics:queue_age', now, JSON.stringify({ age: 130000, timestamp: now }));
    // simulate DLQ failed count > 100
    (queue.getJobCounts as jest.Mock).mockResolvedValueOnce({ failed: 101 });

    const res = await service.checkAlerts();
    expect(res.dlqAlert).toBe(true);
    expect(res.queueAgeAlert).toBe(true);
    expect(res.message).toMatch(/ALERT/);
  });
});


