import { MetricsService } from '../../services/metrics.service';

describe('MetricsService', () => {
  // Mocks simples de Redis e Queue
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
      const map: any = { waiting: 2, active: 1, delayed: 1, failed: 0 };
      const res: any = {};
      types.forEach((t) => (res[t] = map[t] || 0));
      return res;
    }),
  } as any;

  const service = new MetricsService(redis, queue);

  it('should record and compute queue age p95', async () => {
    const now = Date.now();
    await service.recordQueueAge(now - 1000);
    await service.recordQueueAge(now - 2000);
    await service.recordQueueAge(now - 3000);

    const p95 = await service.getQueueAgeP95();
    expect(p95).toBeGreaterThan(0);
  });

  it('should compute metrics summary', async () => {
    await service.recordSuccess('c1');
    await service.recordError('c1', 'E1');
    await service.recordSendLatency(1234, 'c1');
    const summary = await service.getMetricsSummary();
    expect(summary.queue_depth).toBeGreaterThan(0);
    expect(summary.error_rate).toBeGreaterThanOrEqual(0);
  });
});


