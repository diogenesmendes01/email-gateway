/**
 * Dashboard Service
 *
 * Business logic for dashboard operations:
 * - Overview with KPIs
 * - Audit logs monitoring
 * - Rate limiting statistics
 * - API key management
 * - Metrics from worker (TASK 7.1)
 */

import { Injectable } from '@nestjs/common';
import { prisma } from '@email-gateway/database';
import { AuthService } from '../auth/auth.service';
import Redis from 'ioredis';

interface DashboardOverview {
  kpis: {
    totalEmailsToday: number;
    totalEmailsYesterday: number;
    successRateToday: number;
    successRateYesterday: number;
    queueDepth: number;
    averageProcessingTime: number;
  };
  queueStatus: {
    pending: number;
    processing: number;
    failed: number;
    dlq: number;
  };
  recentActivity: Array<{
    id: string;
    action: string;
    resource: string;
    timestamp: Date;
    companyId: string;
  }>;
}

interface AuditLogEntry {
  id: string;
  companyId: string;
  userId?: string;
  action: string;
  resource: string;
  resourceId?: string;
  ipAddress?: string;
  userAgent?: string;
  metadata?: any;
  createdAt: Date;
}

interface CompanyApiKeyStatus {
  id: string;
  name: string;
  apiKeyPrefix: string;
  isActive: boolean;
  lastUsedAt?: Date;
  expiresAt: Date;
  isExpired: boolean;
  isNearExpiration: boolean;
  allowedIps: string[];
}

@Injectable()
export class DashboardService {
  private redis: Redis;

  constructor(private authService: AuthService) {
    // TASK 7.1: Initialize Redis connection for metrics
    this.redis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379', 10),
      password: process.env.REDIS_PASSWORD,
      db: parseInt(process.env.REDIS_DB || '0', 10),
    });
  }

  /**
   * Get dashboard overview with KPIs
   */
  async getOverview(): Promise<DashboardOverview> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    // Get email statistics
    const [todayStats, yesterdayStats] = await Promise.all([
      this.getEmailStats(today),
      this.getEmailStats(yesterday),
    ]);

    // Get queue status
    const queueStatus = await this.getQueueStatus();

    // Get recent audit activity
    const recentActivity = await this.getRecentActivity();

    return {
      kpis: {
        totalEmailsToday: todayStats.total,
        totalEmailsYesterday: yesterdayStats.total,
        successRateToday: todayStats.successRate,
        successRateYesterday: yesterdayStats.successRate,
        queueDepth: queueStatus.pending + queueStatus.processing,
        averageProcessingTime: await this.getAverageProcessingTime(),
      },
      queueStatus,
      recentActivity,
    };
  }

  /**
   * Get audit logs with filtering
   */
  async getAuditLogs(
    query: {
      companyId?: string;
      action?: string;
      resource?: string;
      dateFrom?: string;
      dateTo?: string;
      page?: number;
      limit?: number;
    },
    userId: string,
  ): Promise<{
    logs: AuditLogEntry[];
    total: number;
    page: number;
    limit: number;
  }> {
    const page = query.page || 1;
    const limit = Math.min(query.limit || 50, 100);
    const offset = (page - 1) * limit;

    const where: any = {};

    if (query.companyId) {
      where.companyId = query.companyId;
    }

    if (query.action) {
      where.action = query.action;
    }

    if (query.resource) {
      where.resource = query.resource;
    }

    if (query.dateFrom || query.dateTo) {
      where.createdAt = {};
      if (query.dateFrom) {
        where.createdAt.gte = new Date(query.dateFrom);
      }
      if (query.dateTo) {
        where.createdAt.lte = new Date(query.dateTo);
      }
    }

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: offset,
        take: limit,
      }),
      prisma.auditLog.count({ where }),
    ]);

    return {
      logs: logs as AuditLogEntry[],
      total,
      page,
      limit,
    };
  }

  /**
   * Get rate limiting statistics
   */
  async getRateLimitStats(): Promise<{
    activeCompanies: number;
    totalRequestsToday: number;
    rateLimitViolations: number;
    topCompanies: Array<{
      companyId: string;
      companyName: string;
      requestCount: number;
    }>;
  }> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Get audit logs for today to calculate stats
    const auditLogs = await prisma.auditLog.findMany({
      where: {
        createdAt: { gte: today },
        action: { in: ['send_email', 'list_emails', 'view_email'] },
      },
      include: {
        company: true,
      },
    });

    // Count requests by company
    const companyStats = new Map<string, { name: string; count: number }>();
    
    auditLogs.forEach(log => {
      const existing = companyStats.get(log.companyId) || { name: log.company.name, count: 0 };
      existing.count++;
      companyStats.set(log.companyId, existing);
    });

    const topCompanies = Array.from(companyStats.entries())
      .map(([companyId, stats]) => ({
        companyId,
        companyName: stats.name,
        requestCount: stats.count,
      }))
      .sort((a, b) => b.requestCount - a.requestCount)
      .slice(0, 10);

    return {
      activeCompanies: companyStats.size,
      totalRequestsToday: auditLogs.length,
      rateLimitViolations: await this.getRateLimitViolations(),
      topCompanies,
    };
  }

  /**
   * Get companies with API key status
   */
  async getCompanies(): Promise<CompanyApiKeyStatus[]> {
    const companies = await prisma.company.findMany({
      select: {
        id: true,
        name: true,
        apiKeyPrefix: true,
        isActive: true,
        lastUsedAt: true,
        apiKeyExpiresAt: true,
        allowedIps: true,
      },
    });

    return companies.map(company => ({
      id: company.id,
      name: company.name,
      apiKeyPrefix: company.apiKeyPrefix,
      isActive: company.isActive,
      lastUsedAt: company.lastUsedAt || undefined,
      expiresAt: company.apiKeyExpiresAt,
      isExpired: this.authService.isApiKeyExpired(company.apiKeyExpiresAt),
      isNearExpiration: this.authService.isApiKeyNearExpiration(company.apiKeyExpiresAt),
      allowedIps: company.allowedIps,
    }));
  }

  /**
   * Get API key status and warnings
   */
  async getApiKeyStatus(): Promise<{
    totalKeys: number;
    expiredKeys: number;
    nearExpirationKeys: number;
    inactiveKeys: number;
    warnings: Array<{
      companyId: string;
      companyName: string;
      type: 'expired' | 'near_expiration' | 'inactive';
      message: string;
    }>;
  }> {
    const companies = await prisma.company.findMany({
      select: {
        id: true,
        name: true,
        apiKeyPrefix: true,
        isActive: true,
        lastUsedAt: true,
        apiKeyExpiresAt: true,
      },
    });

    const warnings: Array<{
      companyId: string;
      companyName: string;
      type: 'expired' | 'near_expiration' | 'inactive';
      message: string;
    }> = [];

    let expiredKeys = 0;
    let nearExpirationKeys = 0;
    let inactiveKeys = 0;

    companies.forEach(company => {
      if (!company.isActive) {
        inactiveKeys++;
        warnings.push({
          companyId: company.id,
          companyName: company.name,
          type: 'inactive',
          message: 'API key is inactive',
        });
      } else if (this.authService.isApiKeyExpired(company.apiKeyExpiresAt)) {
        expiredKeys++;
        warnings.push({
          companyId: company.id,
          companyName: company.name,
          type: 'expired',
          message: 'API key has expired',
        });
      } else if (this.authService.isApiKeyNearExpiration(company.apiKeyExpiresAt)) {
        nearExpirationKeys++;
        warnings.push({
          companyId: company.id,
          companyName: company.name,
          type: 'near_expiration',
          message: 'API key expires soon',
        });
      }
    });

    return {
      totalKeys: companies.length,
      expiredKeys,
      nearExpirationKeys,
      inactiveKeys,
      warnings,
    };
  }

  // Private helper methods

  private async getEmailStats(date: Date): Promise<{ total: number; successRate: number }> {
    const nextDay = new Date(date);
    nextDay.setDate(nextDay.getDate() + 1);

    const stats = await prisma.emailLog.groupBy({
      by: ['status'],
      where: {
        createdAt: {
          gte: date,
          lt: nextDay,
        },
      },
      _count: {
        id: true,
      },
    });

    const total = stats.reduce((sum, stat) => sum + stat._count.id, 0);
    const successful = stats
      .filter(stat => stat.status === 'SENT')
      .reduce((sum, stat) => sum + stat._count.id, 0);

    return {
      total,
      successRate: total > 0 ? (successful / total) * 100 : 0,
    };
  }

  private async getQueueStatus(): Promise<{
    pending: number;
    processing: number;
    failed: number;
    dlq: number;
  }> {
    const stats = await prisma.emailOutbox.groupBy({
      by: ['status'],
      _count: {
        id: true,
      },
    });

    const statusCounts = {
      pending: 0,
      processing: 0,
      failed: 0,
      dlq: 0,
    };

    stats.forEach(stat => {
      const status = stat.status.toLowerCase();
      if (status in statusCounts) {
        statusCounts[status as keyof typeof statusCounts] = stat._count.id;
      }
    });

    return statusCounts;
  }

  private async getRecentActivity(): Promise<Array<{
    id: string;
    action: string;
    resource: string;
    timestamp: Date;
    companyId: string;
  }>> {
    const logs = await prisma.auditLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: {
        id: true,
        action: true,
        resource: true,
        createdAt: true,
        companyId: true,
      },
    });

    return logs.map(log => ({
      id: log.id,
      action: log.action,
      resource: log.resource,
      timestamp: log.createdAt,
      companyId: log.companyId,
    }));
  }

  private async getAverageProcessingTime(): Promise<number> {
    const result = await prisma.emailLog.aggregate({
      where: {
        status: 'SENT',
        durationMs: { not: null },
      },
      _avg: {
        durationMs: true,
      },
    });

    return result._avg.durationMs || 0;
  }

  private async getRateLimitViolations(): Promise<number> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const violations = await prisma.auditLog.count({
      where: {
        createdAt: { gte: today },
        metadata: {
          path: ['status'],
          equals: 'error',
        },
        action: 'rate_limit_exceeded',
      },
    });

    return violations;
  }

  /**
   * Get real-time metrics from worker (TASK 7.1)
   * Returns metrics collected by MetricsService in worker
   */
  async getMetrics(): Promise<{
    queue_depth: number;
    queue_age_p95: number;
    send_latency_p50: number;
    send_latency_p95: number;
    send_latency_p99: number;
    error_rate: number;
    dlq_depth: number;
    tenant_fairness_ratio: number;
    error_breakdown: Record<string, number>;
  }> {
    const METRICS_PREFIX = 'metrics';
    const QUEUE_AGE_KEY = `${METRICS_PREFIX}:queue_age`;
    const SEND_LATENCY_KEY = `${METRICS_PREFIX}:send_latency`;
    const ERROR_COUNT_KEY = `${METRICS_PREFIX}:error_count`;
    const SUCCESS_COUNT_KEY = `${METRICS_PREFIX}:success_count`;
    const TENANT_JOBS_KEY = `${METRICS_PREFIX}:tenant_jobs`;
    const METRICS_WINDOW = 300; // 5 minutes in seconds

    const now = Date.now();
    const cutoff = now - (METRICS_WINDOW * 1000);

    // Get queue age P95
    const queueAgeEntries = await this.redis.zrangebyscore(
      QUEUE_AGE_KEY,
      cutoff,
      '+inf'
    );
    const queueAges = queueAgeEntries
      .map(entry => JSON.parse(entry).age)
      .sort((a, b) => a - b);
    const queueAgeP95 = queueAges.length > 0
      ? queueAges[Math.ceil(queueAges.length * 0.95) - 1] || 0
      : 0;

    // Get send latency percentiles
    const latencyEntries = await this.redis.zrangebyscore(
      SEND_LATENCY_KEY,
      cutoff,
      '+inf'
    );
    const latencies = latencyEntries
      .map(entry => JSON.parse(entry).latency)
      .sort((a, b) => a - b);

    const sendLatencyP50 = latencies.length > 0
      ? latencies[Math.ceil(latencies.length * 0.50) - 1] || 0
      : 0;
    const sendLatencyP95 = latencies.length > 0
      ? latencies[Math.ceil(latencies.length * 0.95) - 1] || 0
      : 0;
    const sendLatencyP99 = latencies.length > 0
      ? latencies[Math.ceil(latencies.length * 0.99) - 1] || 0
      : 0;

    // Get error rate
    const getRecentWindows = (count: number): string[] => {
      const windows: string[] = [];
      for (let i = 0; i < count; i++) {
        const windowStart = Math.floor(now / (METRICS_WINDOW * 1000)) * METRICS_WINDOW;
        const offset = windowStart - (i * METRICS_WINDOW);
        windows.push(offset.toString());
      }
      return windows;
    };

    const windows = getRecentWindows(3);
    let totalErrors = 0;
    let totalSuccess = 0;
    const errorBreakdown: Record<string, number> = {};

    for (const window of windows) {
      const errors = await this.redis.hvals(`${ERROR_COUNT_KEY}:${window}`);
      const successes = await this.redis.hvals(`${SUCCESS_COUNT_KEY}:${window}`);
      const errorsByCode = await this.redis.hgetall(`${ERROR_COUNT_KEY}:${window}:by_code`);

      totalErrors += errors.reduce((sum, val) => sum + parseInt(val, 10), 0);
      totalSuccess += successes.reduce((sum, val) => sum + parseInt(val, 10), 0);

      for (const [errorCode, count] of Object.entries(errorsByCode)) {
        errorBreakdown[errorCode] = (errorBreakdown[errorCode] || 0) + parseInt(count, 10);
      }
    }

    const total = totalErrors + totalSuccess;
    const errorRate = total === 0 ? 0 : (totalErrors / total) * 100;

    // Get tenant fairness ratio
    const tenantCounts = new Map<string, number>();
    for (const window of windows) {
      const jobs = await this.redis.hgetall(`${TENANT_JOBS_KEY}:${window}`);
      for (const [companyId, count] of Object.entries(jobs)) {
        const current = tenantCounts.get(companyId) || 0;
        tenantCounts.set(companyId, current + parseInt(count, 10));
      }
    }

    const counts = Array.from(tenantCounts.values());
    const tenantFairnessRatio = counts.length > 0
      ? Math.max(...counts) / Math.min(...counts.filter(c => c > 0))
      : 1.0;

    // Get queue depth and DLQ depth from queue status
    const queueStatus = await this.getQueueStatus();

    return {
      queue_depth: queueStatus.pending + queueStatus.processing,
      queue_age_p95: Math.round(queueAgeP95),
      send_latency_p50: Math.round(sendLatencyP50),
      send_latency_p95: Math.round(sendLatencyP95),
      send_latency_p99: Math.round(sendLatencyP99),
      error_rate: Math.round(errorRate * 100) / 100,
      dlq_depth: queueStatus.dlq,
      tenant_fairness_ratio: Math.round((tenantFairnessRatio || 1.0) * 100) / 100,
      error_breakdown: errorBreakdown,
    };
  }
}
