/**
 * @email-gateway/api - Quota Controller
 *
 * Controller para gerenciamento de quotas diárias
 *
 * TASK-029: Daily Quota Service
 * Endpoint para consultar uso de quota
 */

import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  UseGuards,
  Request,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';

// Guards
import { ApiKeyGuard } from '../../auth/auth.guard';
import { RateLimitGuard } from '../../auth/rate-limit.guard';

// Services
import { DailyQuotaService, QuotaResult } from '../services/daily-quota.service';

@ApiTags('Quota Management')
@Controller('v1/company/quota')
@UseGuards(ApiKeyGuard, RateLimitGuard)
export class QuotaController {
  constructor(private readonly dailyQuotaService: DailyQuotaService) {}

  /**
   * GET /v1/company/quota
   * Obtém informações de quota diária da empresa
   * TASK-029: Endpoint to query quota usage
   */
  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Obtém informações de quota diária' })
  @ApiResponse({
    status: 200,
    description: 'Informações de quota retornadas com sucesso',
    schema: {
      type: 'object',
      properties: {
        allowed: { type: 'boolean', description: 'Se há quota disponível' },
        current: { type: 'number', description: 'Emails enviados hoje' },
        limit: { type: 'number', description: 'Limite diário configurado' },
        resetsAt: { type: 'string', format: 'date-time', description: 'Quando reseta (meia-noite UTC)' },
        remaining: { type: 'number', description: 'Emails restantes' },
        percentageUsed: { type: 'number', description: 'Porcentagem usada' },
      },
    },
  })
  async getQuota(@Request() req: any): Promise<QuotaResult & { remaining: number; percentageUsed: number }> {
    const companyId = req.companyId;
    const quota = await this.dailyQuotaService.getQuotaInfo(companyId);

    return {
      ...quota,
      remaining: Math.max(0, quota.limit - quota.current),
      percentageUsed: quota.limit > 0 ? (quota.current / quota.limit) * 100 : 0,
    };
  }
}
