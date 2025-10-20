import { Redis } from 'ioredis';
import { Queue } from 'bullmq';

/**
 * Metrics Service
 *
 * Collects and exposes metrics for monitoring:
 * - queue_depth: Number of jobs waiting in queue
 * - queue_age_p95: 95th percentile of queue wait time
 * - send_latency_p50/p95/p99: Percentiles of email send latency
 * - error_rate: Percentage of failed emails
 * - dlq_depth: Number of jobs in dead letter queue
 * - tenant_fairness_ratio: Distribution of jobs across tenants
 */
export class MetricsService {
  private redis: Redis;
  private queue: Queue;

  // Redis keys for metrics storage
  private readonly METRICS_PREFIX = 'metrics';
  private readonly QUEUE_AGE_KEY = `${this.METRICS_PREFIX}:queue_age`;
  private readonly SEND_LATENCY_KEY = `${this.METRICS_PREFIX}:send_latency`;
  private readonly ERROR_COUNT_KEY = `${this.METRICS_PREFIX}:error_count`;
  private readonly SUCCESS_COUNT_KEY = `${this.METRICS_PREFIX}:success_count`;
  private readonly TENANT_JOBS_KEY = `${this.METRICS_PREFIX}:tenant_jobs`;

  // Time windows for metrics (in seconds)
  private readonly METRICS_WINDOW = 300; // 5 minutes
  private readonly METRICS_TTL = 3600; // 1 hour

  constructor(redis: Redis, queue: Queue) {
    this.redis = redis;
    this.queue = queue;
  }

  /**
   * Record queue age when job starts processing
   * @param enqueuedAt Timestamp when job was enqueued
   */
  async recordQueueAge(enqueuedAt: number): Promise<void> {
    const now = Date.now();
    const queueAge = now - enqueuedAt;

    // Store in sorted set with timestamp as score for time-based queries
    await this.redis.zadd(
      this.QUEUE_AGE_KEY,
      now,
      JSON.stringify({ age: queueAge, timestamp: now })
    );

    // Remove old entries (older than TTL)
    const cutoff = now - (this.METRICS_TTL * 1000);
    await this.redis.zremrangebyscore(this.QUEUE_AGE_KEY, '-inf', cutoff);
  }

  /**
   * Record email send latency
   * @param latencyMs Latency in milliseconds
   * @param companyId Company/tenant ID
   */
  async recordSendLatency(latencyMs: number, companyId: string): Promise<void> {
    const now = Date.now();

    // Store in sorted set for percentile calculations
    await this.redis.zadd(
      this.SEND_LATENCY_KEY,
      now,
      JSON.stringify({ latency: latencyMs, timestamp: now, companyId })
    );

    // Remove old entries
    const cutoff = now - (this.METRICS_TTL * 1000);
    await this.redis.zremrangebyscore(this.SEND_LATENCY_KEY, '-inf', cutoff);
  }

  /**
   * Record successful email send
   * @param companyId Company/tenant ID
   */
  async recordSuccess(companyId: string): Promise<void> {
    const window = this.getCurrentWindow();
    await this.redis.hincrby(`${this.SUCCESS_COUNT_KEY}:${window}`, companyId, 1);
    await this.redis.expire(`${this.SUCCESS_COUNT_KEY}:${window}`, this.METRICS_TTL);
  }

  /**
   * Record failed email send
   * @param companyId Company/tenant ID
   * @param errorCode Error code
   */
  async recordError(companyId: string, errorCode: string): Promise<void> {
    const window = this.getCurrentWindow();
    const key = `${this.ERROR_COUNT_KEY}:${window}`;

    await this.redis.hincrby(key, companyId, 1);
    await this.redis.hincrby(`${key}:by_code`, errorCode, 1);
    await this.redis.expire(key, this.METRICS_TTL);
    await this.redis.expire(`${key}:by_code`, this.METRICS_TTL);
  }

  /**
   * Record tenant job allocation
   * @param companyId Company/tenant ID
   */
  async recordTenantJob(companyId: string): Promise<void> {
    const window = this.getCurrentWindow();
    await this.redis.hincrby(`${this.TENANT_JOBS_KEY}:${window}`, companyId, 1);
    await this.redis.expire(`${this.TENANT_JOBS_KEY}:${window}`, this.METRICS_TTL);
  }

  /**
   * Get queue depth (waiting + active jobs)
   */
  async getQueueDepth(): Promise<number> {
    const counts = await this.queue.getJobCounts('waiting', 'active', 'delayed');
    return (counts.waiting || 0) + (counts.active || 0) + (counts.delayed || 0);
  }

  /**
   * Get 95th percentile of queue age in last 5 minutes
   */
  async getQueueAgeP95(): Promise<number> {
    const now = Date.now();
    const cutoff = now - (this.METRICS_WINDOW * 1000);

    // Get all queue ages in the window
    const entries = await this.redis.zrangebyscore(
      this.QUEUE_AGE_KEY,
      cutoff,
      '+inf'
    );

    if (entries.length === 0) return 0;

    const ages = entries
      .map(entry => JSON.parse(entry).age)
      .sort((a, b) => a - b);

    const p95Index = Math.ceil(ages.length * 0.95) - 1;
    return ages[p95Index] || 0;
  }

  /**
   * Get send latency percentiles
   */
  async getSendLatencyPercentiles(): Promise<{
    p50: number;
    p95: number;
    p99: number;
  }> {
    const now = Date.now();
    const cutoff = now - (this.METRICS_WINDOW * 1000);

    const entries = await this.redis.zrangebyscore(
      this.SEND_LATENCY_KEY,
      cutoff,
      '+inf'
    );

    if (entries.length === 0) {
      return { p50: 0, p95: 0, p99: 0 };
    }

    const latencies = entries
      .map(entry => JSON.parse(entry).latency)
      .sort((a, b) => a - b);

    const p50Index = Math.ceil(latencies.length * 0.50) - 1;
    const p95Index = Math.ceil(latencies.length * 0.95) - 1;
    const p99Index = Math.ceil(latencies.length * 0.99) - 1;

    return {
      p50: latencies[p50Index] || 0,
      p95: latencies[p95Index] || 0,
      p99: latencies[p99Index] || 0,
    };
  }

  /**
   * Get error rate (errors / total attempts) in percentage
   */
  async getErrorRate(): Promise<number> {
    const windows = this.getRecentWindows(3); // Last 3 windows (15 minutes)

    let totalErrors = 0;
    let totalSuccess = 0;

    for (const window of windows) {
      const errors = await this.redis.hvals(`${this.ERROR_COUNT_KEY}:${window}`);
      const successes = await this.redis.hvals(`${this.SUCCESS_COUNT_KEY}:${window}`);

      totalErrors += errors.reduce((sum, val) => sum + parseInt(val, 10), 0);
      totalSuccess += successes.reduce((sum, val) => sum + parseInt(val, 10), 0);
    }

    const total = totalErrors + totalSuccess;
    if (total === 0) return 0;

    return (totalErrors / total) * 100;
  }

  /**
   * Get DLQ depth (failed jobs count)
   */
  async getDLQDepth(): Promise<number> {
    const counts = await this.queue.getJobCounts('failed');
    return counts.failed || 0;
  }

  /**
   * Get tenant fairness ratio
   * Returns the ratio of (max tenant jobs / min tenant jobs)
   * A ratio close to 1.0 indicates fair distribution
   */
  async getTenantFairnessRatio(): Promise<number> {
    const windows = this.getRecentWindows(3);
    const tenantCounts = new Map<string, number>();

    for (const window of windows) {
      const jobs = await this.redis.hgetall(`${this.TENANT_JOBS_KEY}:${window}`);

      for (const [companyId, count] of Object.entries(jobs)) {
        const current = tenantCounts.get(companyId) || 0;
        tenantCounts.set(companyId, current + parseInt(count, 10));
      }
    }

    if (tenantCounts.size === 0) return 1.0;

    const counts = Array.from(tenantCounts.values());
    const maxJobs = Math.max(...counts);
    const minJobs = Math.min(...counts);

    if (minJobs === 0) return Infinity;

    return maxJobs / minJobs;
  }

  /**
   * Get comprehensive metrics summary
   */
  async getMetricsSummary(): Promise<{
    queue_depth: number;
    queue_age_p95: number;
    send_latency_p50: number;
    send_latency_p95: number;
    send_latency_p99: number;
    error_rate: number;
    dlq_depth: number;
    tenant_fairness_ratio: number;
  }> {
    const [
      queueDepth,
      queueAgeP95,
      latencyPercentiles,
      errorRate,
      dlqDepth,
      tenantFairnessRatio,
    ] = await Promise.all([
      this.getQueueDepth(),
      this.getQueueAgeP95(),
      this.getSendLatencyPercentiles(),
      this.getErrorRate(),
      this.getDLQDepth(),
      this.getTenantFairnessRatio(),
    ]);

    return {
      queue_depth: queueDepth,
      queue_age_p95: Math.round(queueAgeP95),
      send_latency_p50: Math.round(latencyPercentiles.p50),
      send_latency_p95: Math.round(latencyPercentiles.p95),
      send_latency_p99: Math.round(latencyPercentiles.p99),
      error_rate: Math.round(errorRate * 100) / 100,
      dlq_depth: dlqDepth,
      tenant_fairness_ratio: Math.round(tenantFairnessRatio * 100) / 100,
    };
  }

  /**
   * Get error breakdown by error code
   */
  async getErrorBreakdown(): Promise<Record<string, number>> {
    const windows = this.getRecentWindows(3);
    const errorCounts: Record<string, number> = {};

    for (const window of windows) {
      const errors = await this.redis.hgetall(`${this.ERROR_COUNT_KEY}:${window}:by_code`);

      for (const [errorCode, count] of Object.entries(errors)) {
        errorCounts[errorCode] = (errorCounts[errorCode] || 0) + parseInt(count, 10);
      }
    }

    return errorCounts;
  }

  /**
   * Get current 5-minute window identifier
   */
  private getCurrentWindow(): string {
    const now = Date.now();
    const windowStart = Math.floor(now / (this.METRICS_WINDOW * 1000)) * this.METRICS_WINDOW;
    return windowStart.toString();
  }

  /**
   * Get recent window identifiers
   * @param count Number of windows to retrieve
   */
  private getRecentWindows(count: number): string[] {
    const now = Date.now();
    const windows: string[] = [];

    for (let i = 0; i < count; i++) {
      const windowStart = Math.floor(now / (this.METRICS_WINDOW * 1000)) * this.METRICS_WINDOW;
      const offset = windowStart - (i * this.METRICS_WINDOW);
      windows.push(offset.toString());
    }

    return windows;
  }

  /**
   * Check if metrics exceed alert thresholds
   */
  async checkAlerts(): Promise<{
    dlqAlert: boolean;
    queueAgeAlert: boolean;
    message?: string;
  }> {
    const [dlqDepth, queueAgeP95] = await Promise.all([
      this.getDLQDepth(),
      this.getQueueAgeP95(),
    ]);

    const dlqAlert = dlqDepth > 100;
    const queueAgeAlert = queueAgeP95 > 120000; // 120 seconds in ms

    let message: string | undefined;
    if (dlqAlert || queueAgeAlert) {
      const alerts: string[] = [];
      if (dlqAlert) alerts.push(`DLQ depth: ${dlqDepth} (threshold: 100)`);
      if (queueAgeAlert) alerts.push(`Queue age P95: ${Math.round(queueAgeP95 / 1000)}s (threshold: 120s)`);
      message = `ALERT: ${alerts.join(', ')}`;
    }

    return { dlqAlert, queueAgeAlert, message };
  }
}
