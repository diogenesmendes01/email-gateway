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

import { Injectable, Logger } from '@nestjs/common';
import { prisma } from '@email-gateway/database';
import { AuthService } from '../auth/auth.service';
import Redis from 'ioredis';
import { ConfigService } from '@nestjs/config';

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
  private readonly logger = new Logger(DashboardService.name);
  private redis: Redis;

  constructor(
    private authService: AuthService,
    private configService: ConfigService,
  ) {
    // TASK 7.1: Initialize Redis connection for metrics
    this.redis = new Redis({
      host: this.configService.get<string>('REDIS_HOST', 'localhost'),
      port: this.configService.get<number>('REDIS_PORT', 6379),
      password: this.configService.get<string>('REDIS_PASSWORD'),
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
      take: 1000, // Limit to prevent memory issues with large datasets
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
      take: 100, // Limit to prevent memory issues with large datasets
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
      take: 100, // Limit to prevent memory issues with large datasets
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
   * Get KPIs: total enviados, erro por categoria, DLQ, latências
   * TASK 9.1: KPIs, estados e acesso
   * 
   * @param period - Time period for KPIs ('hour', 'day', 'week', 'month', 'today')
   * @param companyId - Optional company ID to filter KPIs
   * @returns Promise with KPI data including totals, success rates, errors, DLQ count, and latencies
   * @throws Error if database query fails
   */
  async getKPIs(period?: string, companyId?: string): Promise<{
    totalEnviados: number;
    totalEnviadosPeriodoAnterior: number;
    taxaSucesso: number;
    taxaSucessoPeriodoAnterior: number;
    totalErros: number;
    totalErrosPeriodoAnterior: number;
    dlqCount: number;
    latenciaMedia: number;
    latenciaP95: number;
    latenciaP99: number;
    periodo: string;
    comparacao: {
      enviados: number; // % de mudança
      sucesso: number; // % de mudança
      erros: number; // % de mudança
    };
  }> {
    const requestId = `kpi-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    this.logger.log({
      message: 'Starting KPI calculation',
      requestId,
      period: period || 'today',
      companyId: companyId || 'all',
      timestamp: new Date().toISOString(),
    });

    // Cache key for KPIs
    const cacheKey = `kpis:${period || 'today'}:${companyId || 'all'}`;
    
    // Try to get from cache first
    try {
      const cached = await this.redis.get(cacheKey);
      if (cached) {
        this.logger.log({
          message: 'KPI data retrieved from cache',
          requestId,
          cacheKey,
          timestamp: new Date().toISOString(),
        });
        return JSON.parse(cached);
      }
    } catch (error) {
      this.logger.warn({
        message: 'Cache retrieval failed, proceeding with database query',
        requestId,
        cacheKey,
        error: (error as Error).message,
        timestamp: new Date().toISOString(),
      });
    }

    const { startDate, endDate, previousStartDate, previousEndDate } = this.getDateRange(period);

    this.logger.log({
      message: 'Calculating KPIs from database',
      requestId,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      previousStartDate: previousStartDate.toISOString(),
      previousEndDate: previousEndDate.toISOString(),
      timestamp: new Date().toISOString(),
    });

    const where = companyId ? { companyId } : {};
    const whereWithPeriod = { ...where, createdAt: { gte: startDate, lte: endDate } };
    const wherePreviousPeriod = { ...where, createdAt: { gte: previousStartDate, lte: previousEndDate } };

    // Get current period stats
    const [currentStats, previousStats, dlqCount, latencyStats] = await Promise.all([
      this.getEmailStatsForPeriod(whereWithPeriod),
      this.getEmailStatsForPeriod(wherePreviousPeriod),
      this.getDLQCount(where),
      this.getLatencyStats(whereWithPeriod),
    ]);

    // Calculate comparison percentages
    const comparacao = {
      enviados: this.calculatePercentageChange(currentStats.total, previousStats.total),
      sucesso: this.calculatePercentageChange(currentStats.successRate, previousStats.successRate),
      erros: this.calculatePercentageChange(currentStats.errorCount, previousStats.errorCount),
    };

    const result = {
      totalEnviados: currentStats.total,
      totalEnviadosPeriodoAnterior: previousStats.total,
      taxaSucesso: currentStats.successRate,
      taxaSucessoPeriodoAnterior: previousStats.successRate,
      totalErros: currentStats.errorCount,
      totalErrosPeriodoAnterior: previousStats.errorCount,
      dlqCount,
      latenciaMedia: latencyStats.average,
      latenciaP95: latencyStats.p95,
      latenciaP99: latencyStats.p99,
      periodo: period || 'today',
      comparacao,
    };

    // Cache the result for 5 minutes
    try {
      await this.redis.setex(cacheKey, 300, JSON.stringify(result));
      this.logger.log({
        message: 'KPI data cached successfully',
        requestId,
        cacheKey,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      this.logger.warn({
        message: 'Failed to cache KPI data',
        requestId,
        cacheKey,
        error: (error as Error).message,
        timestamp: new Date().toISOString(),
      });
    }

    this.logger.log({
      message: 'KPI calculation completed',
      requestId,
      totalEnviados: result.totalEnviados,
      taxaSucesso: result.taxaSucesso,
      totalErros: result.totalErros,
      dlqCount: result.dlqCount,
      timestamp: new Date().toISOString(),
    });

    return result;
  }

  /**
   * Get emails with filters: externalId, email_hash, cpfCnpj_hash, status, período
   * TASK 9.1: KPIs, estados e acesso
   * 
   * @param filters - Filter parameters for email search
   * @param filters.externalId - External ID filter
   * @param filters.emailHash - Email hash filter
   * @param filters.cpfCnpjHash - CPF/CNPJ hash filter
   * @param filters.status - Email status filter ('SENT', 'FAILED', 'PENDING')
   * @param filters.dateFrom - Start date filter
   * @param filters.dateTo - End date filter
   * @param filters.companyId - Company ID filter
   * @param filters.page - Page number for pagination
   * @param filters.limit - Number of items per page
   * @returns Promise with paginated email list and metadata
   * @throws Error if database query fails
   */
  async getEmails(filters: {
    externalId?: string;
    emailHash?: string;
    cpfCnpjHash?: string;
    status?: string;
    dateFrom?: string;
    dateTo?: string;
    companyId?: string;
    page: number;
    limit: number;
    sortBy?: string;
    sortOrder?: string;
  }): Promise<{
    emails: Array<{
      id: string;
      externalId?: string;
      to: string;
      subject: string;
      status: string;
      createdAt: Date;
      sentAt?: Date;
      failedAt?: Date;
      errorCode?: string;
      errorReason?: string;
      attempts: number;
      durationMs?: number;
      companyId: string;
      recipient?: {
        id: string;
        externalId?: string;
        cpfCnpjHash?: string;
        razaoSocial?: string;
        nome?: string;
        email: string;
      };
    }>;
    total: number;
    page: number;
    limit: number;
    hasMore: boolean;
  }> {
    const requestId = `emails-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    this.logger.log({
      message: 'Starting email search',
      requestId,
      filters: {
        externalId: filters.externalId,
        emailHash: filters.emailHash,
        cpfCnpjHash: filters.cpfCnpjHash,
        status: filters.status,
        dateFrom: filters.dateFrom,
        dateTo: filters.dateTo,
        companyId: filters.companyId,
        page: filters.page,
        limit: filters.limit,
      },
      timestamp: new Date().toISOString(),
    });

    try {
      const { page, limit, ...filterParams } = filters;
      const offset = (page - 1) * limit;

    const where: any = {};

    if (filterParams.companyId) {
      where.companyId = filterParams.companyId;
    }

    if (filterParams.externalId) {
      where.externalId = filterParams.externalId;
    }

    if (filterParams.status) {
      where.status = filterParams.status;
    }

    if (filterParams.dateFrom || filterParams.dateTo) {
      where.createdAt = {};
      if (filterParams.dateFrom) {
        where.createdAt.gte = new Date(filterParams.dateFrom);
      }
      if (filterParams.dateTo) {
        where.createdAt.lte = new Date(filterParams.dateTo);
      }
    }

    // Handle recipient filters
    if (filterParams.emailHash || filterParams.cpfCnpjHash) {
      where.recipient = {};
      if (filterParams.emailHash) {
        where.recipient.email = { contains: filterParams.emailHash };
      }
      if (filterParams.cpfCnpjHash) {
        where.recipient.cpfCnpjHash = filterParams.cpfCnpjHash;
      }
    }

    // Build orderBy clause based on sortBy and sortOrder
    const sortBy = filters.sortBy || 'createdAt';
    const sortOrder = (filters.sortOrder || 'desc') as 'asc' | 'desc';

    const orderBy: any = {};
    orderBy[sortBy] = sortOrder;

    const [emails, total] = await Promise.all([
      prisma.emailLog.findMany({
        where,
        include: {
          recipient: {
            select: {
              id: true,
              externalId: true,
              cpfCnpjHash: true,
              razaoSocial: true,
              nome: true,
              email: true,
            },
          },
        },
        orderBy,
        skip: offset,
        take: limit + 1, // Take one extra to check if there are more
      }),
      prisma.emailLog.count({ where }),
    ]);

    const hasMore = emails.length > limit;
    const resultEmails = hasMore ? emails.slice(0, -1) : emails;

    const result = {
      emails: resultEmails.map(email => ({
        id: email.id,
        externalId: undefined, // externalId is not available in emailLog, only in outbox
        to: email.to,
        subject: email.subject,
        status: email.status,
        createdAt: email.createdAt,
        sentAt: email.sentAt || undefined,
        failedAt: email.failedAt || undefined,
        errorCode: email.errorCode || undefined,
        errorReason: email.errorReason || undefined,
        attempts: email.attempts,
        durationMs: email.durationMs || undefined,
        companyId: email.companyId,
        recipient: email.recipient ? {
          id: email.recipient.id,
          externalId: email.recipient.externalId || undefined,
          cpfCnpjHash: email.recipient.cpfCnpjHash || undefined,
          razaoSocial: email.recipient.razaoSocial || undefined,
          nome: email.recipient.nome || undefined,
          email: email.recipient.email,
        } : undefined,
      })),
      total,
      page,
      limit,
      hasMore,
    };

    this.logger.log({
      message: 'Email search completed',
      requestId,
      totalEmails: result.emails.length,
      totalCount: result.total,
      page: result.page,
      limit: result.limit,
      hasMore: result.hasMore,
      timestamp: new Date().toISOString(),
    });

    return result;
    } catch (error) {
      this.logger.error({
        message: 'Error in getEmails',
        requestId,
        error: (error as Error).message,
        stack: (error as Error).stack,
        filters,
        timestamp: new Date().toISOString(),
      });
      
      // Return empty result with error information
      return {
        emails: [],
        total: 0,
        page: filters.page,
        limit: filters.limit,
        hasMore: false,
      };
    }
  }

  /**
   * Get email details by ID
   * TASK 9.1: KPIs, estados e acesso
   * 
   * @param id - Email ID to retrieve details for
   * @returns Promise with complete email details including recipient and events
   * @throws Error if email not found or database query fails
   */
  async getEmailById(id: string): Promise<{
    id: string;
    outboxId: string;
    externalId?: string;
    to: string;
    cc: string[];
    bcc: string[];
    subject: string;
    html: string;
    replyTo?: string;
    headers?: any;
    tags: string[];
    status: string;
    sesMessageId?: string;
    errorCode?: string;
    errorReason?: string;
    attempts: number;
    durationMs?: number;
    requestId?: string;
    createdAt: Date;
    sentAt?: Date;
    failedAt?: Date;
    companyId: string;
    recipient?: {
      id: string;
      externalId?: string;
      cpfCnpjHash?: string;
      razaoSocial?: string;
      nome?: string;
      email: string;
    };
    events: Array<{
      id: string;
      type: string;
      metadata?: any;
      createdAt: Date;
    }>;
  }> {
    const requestId = `email-detail-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    this.logger.log({
      message: 'Starting email detail retrieval',
      requestId,
      emailId: id,
      timestamp: new Date().toISOString(),
    });

    try {
      const email = await prisma.emailLog.findUnique({
      where: { id },
      include: {
        recipient: {
          select: {
            id: true,
            externalId: true,
            cpfCnpjHash: true,
            razaoSocial: true,
            nome: true,
            email: true,
          },
        },
        outbox: {
          select: {
            id: true,
            externalId: true,
            cc: true,
            bcc: true,
            html: true,
            replyTo: true,
            headers: true,
            tags: true,
          },
        },
        events: {
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            type: true,
            metadata: true,
            createdAt: true,
          },
        },
      },
    });

    if (!email) {
      throw new Error('Email not found');
    }

    const result = {
      id: email.id,
      outboxId: email.outboxId,
      externalId: email.outbox?.externalId || undefined,
      to: email.to,
      cc: email.outbox?.cc || [],
      bcc: email.outbox?.bcc || [],
      subject: email.subject,
      html: email.outbox?.html || '',
      replyTo: email.outbox?.replyTo || undefined,
      headers: email.outbox?.headers || undefined,
      tags: email.outbox?.tags || [],
      status: email.status,
      sesMessageId: email.sesMessageId || undefined,
      errorCode: email.errorCode || undefined,
      errorReason: email.errorReason || undefined,
      attempts: email.attempts,
      durationMs: email.durationMs || undefined,
      requestId: email.requestId || undefined,
      createdAt: email.createdAt,
      sentAt: email.sentAt || undefined,
      failedAt: email.failedAt || undefined,
      companyId: email.companyId,
      recipient: email.recipient ? {
        id: email.recipient.id,
        externalId: email.recipient.externalId || undefined,
        cpfCnpjHash: email.recipient.cpfCnpjHash || undefined,
        razaoSocial: email.recipient.razaoSocial || undefined,
        nome: email.recipient.nome || undefined,
        email: email.recipient.email,
      } : undefined,
      events: email.events.map(event => ({
        id: event.id,
        type: event.type,
        metadata: event.metadata || undefined,
        createdAt: event.createdAt,
      })),
    };

    this.logger.log({
      message: 'Email detail retrieved successfully',
      requestId,
      emailId: result.id,
      status: result.status,
      attempts: result.attempts,
      hasRecipient: !!result.recipient,
      eventsCount: result.events.length,
      timestamp: new Date().toISOString(),
    });

    return result;
    } catch (error) {
      this.logger.error({
        message: 'Error in getEmailById',
        requestId,
        emailId: id,
        error: (error as Error).message,
        stack: (error as Error).stack,
        timestamp: new Date().toISOString(),
      });
      
      // Throw error to be handled by controller
      throw new Error(`Failed to retrieve email details: ${(error as Error).message}`);
    }
  }

  /**
   * Get error breakdown by category
   * TASK 9.1: KPIs, estados e acesso
   * 
   * @param period - Time period for error analysis ('hour', 'day', 'week', 'month', 'today')
   * @param companyId - Optional company ID to filter errors
   * @returns Promise with error breakdown by category and code
   * @throws Error if database query fails
   */
  async getErrorBreakdown(period?: string, companyId?: string): Promise<{
    totalErrors: number;
    errorsByCategory: Array<{
      category: string;
      count: number;
      percentage: number;
    }>;
    errorsByCode: Array<{
      code: string;
      count: number;
      percentage: number;
    }>;
    period: string;
  }> {
    // Cache key for error breakdown
    const cacheKey = `error-breakdown:${period || 'today'}:${companyId || 'all'}`;
    
    // Try to get from cache first
    try {
      const cached = await this.redis.get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }
    } catch (error) {
      // Cache miss or error, continue with database query
    }

    const { startDate, endDate } = this.getDateRange(period);

    const where: any = {
      status: 'FAILED',
      createdAt: { gte: startDate, lte: endDate },
    };

    if (companyId) {
      where.companyId = companyId;
    }

    const errors = await prisma.emailLog.findMany({
      where,
      select: {
        errorCode: true,
        errorReason: true,
      },
      take: 10000, // Limit to prevent memory issues with large datasets
    });

    const totalErrors = errors.length;

    // Group by error category (based on error code patterns)
    const categoryMap = new Map<string, number>();
    const codeMap = new Map<string, number>();

    errors.forEach(error => {
      const category = this.categorizeError(error.errorCode || 'UNKNOWN');
      const code = error.errorCode || 'UNKNOWN';

      categoryMap.set(category, (categoryMap.get(category) || 0) + 1);
      codeMap.set(code, (codeMap.get(code) || 0) + 1);
    });

    const errorsByCategory = Array.from(categoryMap.entries())
      .map(([category, count]) => ({
        category,
        count,
        percentage: totalErrors > 0 ? (count / totalErrors) * 100 : 0,
      }))
      .sort((a, b) => b.count - a.count);

    const errorsByCode = Array.from(codeMap.entries())
      .map(([code, count]) => ({
        code,
        count,
        percentage: totalErrors > 0 ? (count / totalErrors) * 100 : 0,
      }))
      .sort((a, b) => b.count - a.count);

    const result = {
      totalErrors,
      errorsByCategory,
      errorsByCode,
      period: period || 'today',
    };

    // Cache the result for 5 minutes
    try {
      await this.redis.setex(cacheKey, 300, JSON.stringify(result));
    } catch (error) {
      // Cache error, but don't fail the request
    }

    return result;
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

  // Private helper methods for TASK 9.1

  private getDateRange(period?: string): {
    startDate: Date;
    endDate: Date;
    previousStartDate: Date;
    previousEndDate: Date;
  } {
    const now = new Date();
    let startDate: Date;
    let endDate: Date = now;

    switch (period) {
      case 'hour':
        startDate = new Date(now.getTime() - 60 * 60 * 1000);
        break;
      case 'day':
        startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        break;
      case 'week':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case 'month':
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      default: // 'today'
        startDate = new Date();
        startDate.setHours(0, 0, 0, 0);
        endDate = new Date();
        endDate.setHours(23, 59, 59, 999);
        break;
    }

    const duration = endDate.getTime() - startDate.getTime();
    const previousEndDate = new Date(startDate.getTime() - 1);
    const previousStartDate = new Date(previousEndDate.getTime() - duration);

    return {
      startDate,
      endDate,
      previousStartDate,
      previousEndDate,
    };
  }

  private async getEmailStatsForPeriod(where: any): Promise<{
    total: number;
    successRate: number;
    errorCount: number;
  }> {
    const stats = await prisma.emailLog.groupBy({
      by: ['status'],
      where,
      _count: {
        id: true,
      },
    });

    const total = stats.reduce((sum, stat) => sum + stat._count.id, 0);
    const successful = stats
      .filter(stat => stat.status === 'SENT')
      .reduce((sum, stat) => sum + stat._count.id, 0);
    const errorCount = stats
      .filter(stat => stat.status === 'FAILED')
      .reduce((sum, stat) => sum + stat._count.id, 0);

    return {
      total,
      successRate: total > 0 ? (successful / total) * 100 : 0,
      errorCount,
    };
  }

  private async getDLQCount(where: any): Promise<number> {
    const dlqCount = await prisma.emailOutbox.count({
      where: {
        ...where,
        status: 'FAILED',
        attempts: { gte: 5 }, // Assuming 5 is max retry attempts
      },
    });

    return dlqCount;
  }

  private async getLatencyStats(where: any): Promise<{
    average: number;
    p95: number;
    p99: number;
  }> {
    const latencies = await prisma.emailLog.findMany({
      where: {
        ...where,
        status: 'SENT',
        durationMs: { not: null },
      },
      select: {
        durationMs: true,
      },
      take: 5000, // Limit to prevent memory issues with large datasets
    });

    if (latencies.length === 0) {
      return { average: 0, p95: 0, p99: 0 };
    }

    const durations = latencies
      .map(l => l.durationMs!)
      .sort((a, b) => a - b);

    const average = durations.reduce((sum, d) => sum + d, 0) / durations.length;
    const p95Index = Math.ceil(durations.length * 0.95) - 1;
    const p99Index = Math.ceil(durations.length * 0.99) - 1;

    return {
      average: Math.round(average),
      p95: durations[p95Index] || 0,
      p99: durations[p99Index] || 0,
    };
  }

  private calculatePercentageChange(current: number, previous: number): number {
    if (previous === 0) {
      return current > 0 ? 100 : 0;
    }
    return Math.round(((current - previous) / previous) * 100 * 100) / 100;
  }

  private categorizeError(errorCode?: string): string {
    if (!errorCode) return 'UNKNOWN';

    const code = errorCode.toUpperCase();

    if (code.includes('SES') || code.includes('AWS')) {
      return 'SES_ERROR';
    }
    if (code.includes('VALIDATION') || code.includes('INVALID')) {
      return 'VALIDATION_ERROR';
    }
    if (code.includes('RATE_LIMIT') || code.includes('THROTTLE')) {
      return 'RATE_LIMIT_ERROR';
    }
    if (code.includes('TIMEOUT') || code.includes('TIMEOUT')) {
      return 'TIMEOUT_ERROR';
    }
    if (code.includes('NETWORK') || code.includes('CONNECTION')) {
      return 'NETWORK_ERROR';
    }
    if (code.includes('AUTH') || code.includes('UNAUTHORIZED')) {
      return 'AUTH_ERROR';
    }

    return 'OTHER_ERROR';
  }

  /**
   * Export emails to CSV with masking and watermark
   * TASK 9.2: Integração com logs/eventos e runbooks
   *
   * @param filters - Filter parameters for email export
   * @param username - Username performing the export (for watermark)
   * @returns CSV string with masked data and watermark
   * @throws Error if export fails or exceeds 10k limit
   */
  async exportEmailsToCSV(
    filters: {
      externalId?: string;
      emailHash?: string;
      cpfCnpjHash?: string;
      status?: string;
      dateFrom?: string;
      dateTo?: string;
      companyId?: string;
    },
    username: string,
  ): Promise<{ csv: string; filename: string }> {
    const requestId = `export-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const MAX_EXPORT_ROWS = 10000;

    this.logger.log({
      message: 'Starting email export to CSV',
      requestId,
      username,
      filters,
      timestamp: new Date().toISOString(),
    });

    try {
      // Build where clause
      const where: any = {};

      if (filters.companyId) {
        where.companyId = filters.companyId;
      }

      if (filters.externalId) {
        where.externalId = filters.externalId;
      }

      if (filters.status) {
        where.status = filters.status;
      }

      if (filters.dateFrom || filters.dateTo) {
        where.createdAt = {};
        if (filters.dateFrom) {
          where.createdAt.gte = new Date(filters.dateFrom);
        }
        if (filters.dateTo) {
          where.createdAt.lte = new Date(filters.dateTo);
        }
      }

      // Handle recipient filters
      if (filters.emailHash || filters.cpfCnpjHash) {
        where.recipient = {};
        if (filters.emailHash) {
          where.recipient.email = { contains: filters.emailHash };
        }
        if (filters.cpfCnpjHash) {
          where.recipient.cpfCnpjHash = filters.cpfCnpjHash;
        }
      }

      // Count total records
      const total = await prisma.emailLog.count({ where });

      if (total > MAX_EXPORT_ROWS) {
        throw new Error(`Export exceeds maximum limit of ${MAX_EXPORT_ROWS} rows. Found ${total} records. Please refine your filters.`);
      }

      // Fetch emails
      const emails = await prisma.emailLog.findMany({
        where,
        include: {
          recipient: {
            select: {
              externalId: true,
              cpfCnpjHash: true,
              razaoSocial: true,
              nome: true,
              email: true,
            },
          },
          outbox: {
            select: {
              externalId: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: MAX_EXPORT_ROWS,
      });

      this.logger.log({
        message: 'Emails fetched for export',
        requestId,
        totalRecords: emails.length,
        timestamp: new Date().toISOString(),
      });

      // Import masking utilities
      const { maskEmail, maskCPFOrCNPJ } = await import('@email-gateway/shared');

      // Generate CSV header
      const headers = [
        'ID',
        'External ID',
        'To (Masked)',
        'Recipient Name',
        'Recipient CPF/CNPJ (Masked)',
        'Subject',
        'Status',
        'Created At',
        'Sent At',
        'Failed At',
        'Error Code',
        'Error Reason',
        'Attempts',
        'Duration (ms)',
        'SES Message ID',
        'Request ID',
      ];

      // Generate CSV rows with masking
      const rows = emails.map((email) => {
        return [
          email.id,
          email.outbox?.externalId || '',
          maskEmail(email.to), // Mask email
          email.recipient?.nome || email.recipient?.razaoSocial || '',
          email.recipient?.cpfCnpjHash ? maskCPFOrCNPJ(email.recipient.cpfCnpjHash) : '', // Mask CPF/CNPJ
          this.escapeCSVField(email.subject),
          email.status,
          email.createdAt.toISOString(),
          email.sentAt?.toISOString() || '',
          email.failedAt?.toISOString() || '',
          email.errorCode || '',
          this.escapeCSVField(email.errorReason || ''),
          email.attempts,
          email.durationMs || '',
          email.sesMessageId || '',
          email.requestId || '',
        ];
      });

      // Generate watermark
      const exportTimestamp = new Date().toISOString();
      const watermark = `Exported by ${username} at ${exportTimestamp}`;

      // Build CSV string
      const csvLines = [
        `# ${watermark}`,
        `# Total records: ${emails.length}`,
        `# Filters: ${JSON.stringify(filters)}`,
        '', // Empty line before headers
        headers.join(','),
        ...rows.map((row) => row.join(',')),
      ];

      const csv = csvLines.join('\n');

      // Generate filename
      const filename = `emails-export-${Date.now()}.csv`;

      this.logger.log({
        message: 'CSV export completed successfully',
        requestId,
        username,
        totalRecords: emails.length,
        filename,
        timestamp: new Date().toISOString(),
      });

      return {
        csv,
        filename,
      };
    } catch (error) {
      this.logger.error({
        message: 'Error in exportEmailsToCSV',
        requestId,
        username,
        error: (error as Error).message,
        stack: (error as Error).stack,
        filters,
        timestamp: new Date().toISOString(),
      });

      throw new Error(`Failed to export emails: ${(error as Error).message}`);
    }
  }

  /**
   * Escape CSV field to prevent injection and formatting issues
   *
   * @param field - Field value to escape
   * @returns Escaped field value
   */
  private escapeCSVField(field: string): string {
    if (field === null || field === undefined) {
      return '';
    }

    const str = String(field);

    // If field contains comma, quotes, or newlines, wrap in quotes and escape quotes
    if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
      return `"${str.replace(/"/g, '""')}"`;
    }

    return str;
  }
}
