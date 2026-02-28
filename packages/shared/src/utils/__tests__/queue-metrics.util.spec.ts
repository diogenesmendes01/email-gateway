import { QueueMetricsSource, getQueueHealth, getQueueDepth } from '../queue-metrics.util';

function createMockQueue(counts: {
  waiting?: number;
  active?: number;
  completed?: number;
  failed?: number;
  delayed?: number;
  prioritized?: number;
}): QueueMetricsSource {
  return {
    getWaitingCount: jest.fn(async () => counts.waiting ?? 0),
    getActiveCount: jest.fn(async () => counts.active ?? 0),
    getCompletedCount: jest.fn(async () => counts.completed ?? 0),
    getFailedCount: jest.fn(async () => counts.failed ?? 0),
    getDelayedCount: jest.fn(async () => counts.delayed ?? 0),
    getPrioritizedCount: jest.fn(async () => counts.prioritized ?? 0),
  };
}

describe('getQueueHealth', () => {
  it('should include prioritized in waiting count', async () => {
    const queue = createMockQueue({ waiting: 5, prioritized: 3 });
    const health = await getQueueHealth(queue);
    expect(health.waiting).toBe(8);
  });

  it('should include prioritized in total', async () => {
    const queue = createMockQueue({ waiting: 5, active: 2, delayed: 1, prioritized: 3 });
    const health = await getQueueHealth(queue);
    expect(health.total).toBe(11); // 5 + 2 + 1 + 3
  });

  it('should NOT include completed/failed in total', async () => {
    const queue = createMockQueue({
      waiting: 5,
      active: 2,
      completed: 100,
      failed: 50,
      delayed: 1,
      prioritized: 3,
    });
    const health = await getQueueHealth(queue);
    expect(health.total).toBe(11); // 5 + 2 + 1 + 3 (no completed/failed)
  });

  it('should pass active, completed, failed, delayed without modification', async () => {
    const queue = createMockQueue({
      waiting: 0,
      active: 7,
      completed: 99,
      failed: 12,
      delayed: 4,
      prioritized: 0,
    });
    const health = await getQueueHealth(queue);
    expect(health.active).toBe(7);
    expect(health.completed).toBe(99);
    expect(health.failed).toBe(12);
    expect(health.delayed).toBe(4);
  });

  it('should handle all zeros', async () => {
    const queue = createMockQueue({});
    const health = await getQueueHealth(queue);
    expect(health).toEqual({
      waiting: 0,
      active: 0,
      completed: 0,
      failed: 0,
      delayed: 0,
      total: 0,
    });
  });

  it('should handle large numbers', async () => {
    const queue = createMockQueue({
      waiting: 1_000_000,
      active: 500_000,
      completed: 10_000_000,
      failed: 50_000,
      delayed: 200_000,
      prioritized: 300_000,
    });
    const health = await getQueueHealth(queue);
    expect(health.waiting).toBe(1_300_000);
    expect(health.total).toBe(2_000_000); // 1M + 500k + 200k + 300k
  });
});

describe('getQueueDepth', () => {
  it('should include prioritized in depth', async () => {
    const queue = createMockQueue({ waiting: 5, active: 2, delayed: 1, prioritized: 3 });
    const depth = await getQueueDepth(queue);
    expect(depth).toBe(11);
  });

  it('should exclude completed and failed', async () => {
    const queue = createMockQueue({
      waiting: 5,
      active: 2,
      completed: 100,
      failed: 50,
      delayed: 1,
      prioritized: 3,
    });
    const depth = await getQueueDepth(queue);
    expect(depth).toBe(11); // 5 + 2 + 1 + 3
  });

  it('should return 0 when queue is empty', async () => {
    const queue = createMockQueue({});
    const depth = await getQueueDepth(queue);
    expect(depth).toBe(0);
  });

  it('should handle only prioritized jobs', async () => {
    const queue = createMockQueue({ prioritized: 10 });
    const depth = await getQueueDepth(queue);
    expect(depth).toBe(10);
  });
});
