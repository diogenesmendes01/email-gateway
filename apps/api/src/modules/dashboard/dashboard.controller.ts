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
  Query,
  HttpCode,
  HttpStatus,
  Request,
} from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { DashboardProtected } from '../auth/decorators';

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
}
