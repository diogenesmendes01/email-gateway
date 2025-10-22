/**
 * Dashboard Controller
 *
 * Handles HTTP endpoints for dashboard operations:
 * - GET /dashboard/overview - Dashboard overview with KPIs
 * - GET /dashboard/audit-logs - Audit logs for security monitoring
 * - GET /dashboard/rate-limit-stats - Rate limiting statistics
 *
 * Protected with Basic Auth for internal use only.
 */

import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  Param,
  HttpCode,
  HttpStatus,
  Request,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { DashboardService } from './dashboard.service';
import { DashboardProtected } from '../auth/decorators';
import { GetKPIsDto, GetEmailsDto, GetErrorBreakdownDto, ExportEmailsDto } from './dto/kpis.dto';

interface AuditLogsQuery {
  companyId?: string;
  action?: string;
  resource?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  limit?: number;
}

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  /**
   * GET /dashboard/overview
   *
   * Get dashboard overview with KPIs
   */
  @Get('overview')
  @DashboardProtected() // Basic Auth + Audit
  @HttpCode(HttpStatus.OK)
  async getOverview(@Request() req: any): Promise<any> {
    return this.dashboardService.getOverview();
  }

  /**
   * GET /dashboard/audit-logs
   *
   * Get audit logs for security monitoring
   */
  @Get('audit-logs')
  @DashboardProtected() // Basic Auth + Audit
  @HttpCode(HttpStatus.OK)
  async getAuditLogs(
    @Query() query: AuditLogsQuery,
    @Request() req: any,
  ): Promise<any> {
    const { user } = req;
    return this.dashboardService.getAuditLogs(query, user.username);
  }

  /**
   * GET /dashboard/rate-limit-stats
   *
   * Get rate limiting statistics
   */
  @Get('rate-limit-stats')
  @DashboardProtected() // Basic Auth + Audit
  @HttpCode(HttpStatus.OK)
  async getRateLimitStats(@Request() req: any) {
    return this.dashboardService.getRateLimitStats();
  }

  /**
   * GET /dashboard/companies
   *
   * Get companies list with API key status
   */
  @Get('companies')
  @DashboardProtected() // Basic Auth + Audit
  @HttpCode(HttpStatus.OK)
  async getCompanies(@Request() req: any): Promise<any> {
    return this.dashboardService.getCompanies();
  }

  /**
   * GET /dashboard/api-key-status
   *
   * Get API key status and expiration warnings
   */
  @Get('api-key-status')
  @DashboardProtected() // Basic Auth + Audit
  @HttpCode(HttpStatus.OK)
  async getApiKeyStatus(@Request() req: any) {
    return this.dashboardService.getApiKeyStatus();
  }

  /**
   * GET /dashboard/metrics
   *
   * Get real-time metrics from worker (TASK 7.1)
   * Returns metrics: queue_depth, queue_age_p95, send_latency (p50/p95/p99),
   * error_rate, dlq_depth, tenant_fairness_ratio
   */
  @Get('metrics')
  @DashboardProtected() // Basic Auth + Audit
  @HttpCode(HttpStatus.OK)
  async getMetrics() {
    return this.dashboardService.getMetrics();
  }

  /**
   * GET /dashboard/kpis
   *
   * Get KPIs: total enviados, erro por categoria, DLQ, latências
   * TASK 9.1: KPIs, estados e acesso
   */
  @Get('kpis')
  @DashboardProtected() // Basic Auth + Audit
  @HttpCode(HttpStatus.OK)
  async getKPIs(
    @Request() req: any,
    @Query() query: GetKPIsDto,
  ) {
    return this.dashboardService.getKPIs(query.period, query.companyId);
  }

  /**
   * GET /dashboard/emails
   *
   * Get emails with filters: externalId, email_hash, cpfCnpj_hash, status, período
   * TASK 9.1: KPIs, estados e acesso
   */
  @Get('emails')
  @DashboardProtected() // Basic Auth + Audit
  @HttpCode(HttpStatus.OK)
  async getEmails(
    @Request() req: any,
    @Query() query: GetEmailsDto,
  ) {
    return this.dashboardService.getEmails({
      externalId: query.externalId,
      emailHash: query.emailHash,
      cpfCnpjHash: query.cpfCnpjHash,
      status: query.status,
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
      companyId: query.companyId,
      page: query.page || 1,
      limit: query.limit || 50,
      sortBy: query.sortBy || 'createdAt',
      sortOrder: query.sortOrder || 'desc',
    });
  }

  /**
   * GET /dashboard/emails/:id
   *
   * Get email details by ID
   * TASK 9.1: KPIs, estados e acesso
   */
  @Get('emails/:id')
  @DashboardProtected() // Basic Auth + Audit
  @HttpCode(HttpStatus.OK)
  async getEmailById(
    @Param('id') id: string,
    @Request() req: any,
  ) {
    return this.dashboardService.getEmailById(id);
  }

  /**
   * GET /dashboard/error-breakdown
   *
   * Get error breakdown by category
   * TASK 9.1: KPIs, estados e acesso
   */
  @Get('error-breakdown')
  @DashboardProtected() // Basic Auth + Audit
  @HttpCode(HttpStatus.OK)
  async getErrorBreakdown(
    @Request() req: any,
    @Query() query: GetErrorBreakdownDto,
  ) {
    return this.dashboardService.getErrorBreakdown(query.period, query.companyId);
  }

  /**
   * POST /dashboard/emails/export
   *
   * Export emails to CSV with masking and watermark
   * TASK 9.2: Integração com logs/eventos e runbooks
   *
   * Limit: 10k rows max
   * Masking: cpfCnpj, email
   * Watermark: Exported by {username} at {timestamp}
   */
  @Post('emails/export')
  @Throttle({ default: { limit: 5, ttl: 60000 } }) // 5 exports per minute
  @DashboardProtected() // Basic Auth + Audit
  @HttpCode(HttpStatus.OK)
  async exportEmails(
    @Body() body: ExportEmailsDto,
    @Request() req: any,
  ) {
    const username = req.user?.username || 'unknown';
    const ipAddress = req.ip || req.connection?.remoteAddress;
    return this.dashboardService.exportEmailsToCSV(body, username, ipAddress);
  }
}
