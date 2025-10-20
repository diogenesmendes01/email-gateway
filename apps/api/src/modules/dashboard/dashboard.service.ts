/**
 * Dashboard Service
 *
 * Business logic for dashboard operations:
 * - Overview with KPIs
 * - Audit logs monitoring
 * - Rate limiting statistics
 * - API key management
 */

import { Injectable } from '@nestjs/common';
import { prisma } from '@email-gateway/database';
import { AuthService } from '../auth/auth.service';

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
  constructor(private authService: AuthService) {}

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
}
