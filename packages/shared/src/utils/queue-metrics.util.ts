/**
 * Centralized Queue Metrics Helper
 *
 * BullMQ v5 routes jobs with priority > 0 to "prioritized" state (not "waiting").
 * This helper ensures prioritized jobs are always included in waiting/depth counts,
 * preventing undercounting bugs across all consumers.
 */

/**
 * Interface decoupled from BullMQ — any object exposing these 6 methods
 * can be used as a metrics source (including test mocks).
 */
export interface QueueMetricsSource {
  getWaitingCount(): Promise<number>;
  getActiveCount(): Promise<number>;
  getCompletedCount(): Promise<number>;
  getFailedCount(): Promise<number>;
  getDelayedCount(): Promise<number>;
  getPrioritizedCount(): Promise<number>;
}

/**
 * Queue health snapshot.
 * `waiting` includes prioritized jobs.
 * `total` = waiting + active + delayed + prioritized (excludes completed/failed).
 */
export interface QueueHealth {
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
  total: number;
}

/**
 * Get full queue health metrics.
 * Prioritized jobs are folded into `waiting` and `total`.
 */
export async function getQueueHealth(queue: QueueMetricsSource): Promise<QueueHealth> {
  const [waiting, active, completed, failed, delayed, prioritized] = await Promise.all([
    queue.getWaitingCount(),
    queue.getActiveCount(),
    queue.getCompletedCount(),
    queue.getFailedCount(),
    queue.getDelayedCount(),
    queue.getPrioritizedCount(),
  ]);

  return {
    waiting: waiting + prioritized,
    active,
    completed,
    failed,
    delayed,
    total: waiting + active + delayed + prioritized,
  };
}

/**
 * Get queue depth (jobs that need processing).
 * Includes waiting + active + delayed + prioritized.
 * Excludes completed and failed.
 */
export async function getQueueDepth(queue: QueueMetricsSource): Promise<number> {
  const [waiting, active, delayed, prioritized] = await Promise.all([
    queue.getWaitingCount(),
    queue.getActiveCount(),
    queue.getDelayedCount(),
    queue.getPrioritizedCount(),
  ]);

  return waiting + active + delayed + prioritized;
}
