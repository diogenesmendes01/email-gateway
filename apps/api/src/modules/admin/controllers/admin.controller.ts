/**
 * @email-gateway/api - Admin Controller
 *
 * Controller para curadoria e gerenciamento de empresas
 *
 * TASK-034: Sistema de Curadoria de Clientes
 * Endpoints para aprovar, rejeitar, suspender e reativar empresas
 */

import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { BasicAuthGuard } from '../../auth/basic-auth.guard';
import { AdminGuard } from '../../auth/admin.guard';
import { prisma } from '@email-gateway/database';

interface ApproveDto {
  adminUsername: string;
  dailyEmailLimit?: number;
}

interface RejectDto {
  reason: string;
}

interface SuspendDto {
  reason: string;
}

@ApiTags('Admin - Company Curation')
@Controller('v1/admin/companies')
@UseGuards(BasicAuthGuard, AdminGuard)
export class AdminController {
  private readonly logger = new Logger(AdminController.name);

  /**
   * GET /v1/admin/companies/pending
   * Lista empresas pendentes de aprovação
   * TASK-034: List pending companies
   */
  @Get('pending')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Lista empresas pendentes de aprovação' })
  @ApiResponse({ status: 200, description: 'Lista retornada com sucesso' })
  async listPending() {
    try {
      const companies = await prisma.company.findMany({
        where: {
          isApproved: false,
          isActive: true,
          isSuspended: false,
        },
        select: {
          id: true,
          name: true,
          createdAt: true,
          bounceRate: true,
          complaintRate: true,
          dailyEmailLimit: true,
          _count: {
            select: {
              emailOutbox: {
                where: { status: 'SENT' },
              },
            },
          },
        },
        orderBy: {
          createdAt: 'asc',
        },
      });

      this.logger.log({
        message: 'Listed pending companies',
        count: companies.length,
      });

      return companies;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      this.logger.error({
        message: 'Failed to list pending companies',
        error: errorMessage,
      });

      throw error;
    }
  }

  /**
   * POST /v1/admin/companies/:id/approve
   * Aprova uma empresa e aumenta o limite diário
   * TASK-034: Approve company
   */
  @Post(':id/approve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Aprova uma empresa' })
  @ApiResponse({ status: 200, description: 'Empresa aprovada com sucesso' })
  async approve(@Param('id') companyId: string, @Body() dto: ApproveDto) {
    try {
      const company = await prisma.company.findUnique({
        where: { id: companyId },
        select: { name: true, isApproved: true },
      });

      if (!company) {
        throw new Error('Company not found');
      }

      if (company.isApproved) {
        throw new Error('Company already approved');
      }

      await prisma.company.update({
        where: { id: companyId },
        data: {
          isApproved: true,
          approvedAt: new Date(),
          approvedBy: dto.adminUsername,
          dailyEmailLimit: dto.dailyEmailLimit || 5000, // Aumentar limite
        },
      });

      this.logger.log({
        message: 'Company approved',
        companyId,
        companyName: company.name,
        approvedBy: dto.adminUsername,
        newLimit: dto.dailyEmailLimit || 5000,
      });

      return {
        success: true,
        message: `Company ${company.name} approved successfully`,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      this.logger.error({
        message: 'Failed to approve company',
        companyId,
        error: errorMessage,
      });

      throw error;
    }
  }

  /**
   * POST /v1/admin/companies/:id/reject
   * Rejeita uma empresa (desativa)
   * TASK-034: Reject company
   */
  @Post(':id/reject')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Rejeita uma empresa' })
  @ApiResponse({ status: 200, description: 'Empresa rejeitada com sucesso' })
  async reject(@Param('id') companyId: string, @Body() dto: RejectDto) {
    try {
      const company = await prisma.company.findUnique({
        where: { id: companyId },
        select: { name: true },
      });

      if (!company) {
        throw new Error('Company not found');
      }

      await prisma.company.update({
        where: { id: companyId },
        data: {
          isActive: false,
          isSuspended: true,
          suspensionReason: `REJECTED: ${dto.reason}`,
        },
      });

      this.logger.warn({
        message: 'Company rejected',
        companyId,
        companyName: company.name,
        reason: dto.reason,
      });

      return {
        success: true,
        message: `Company ${company.name} rejected`,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      this.logger.error({
        message: 'Failed to reject company',
        companyId,
        error: errorMessage,
      });

      throw error;
    }
  }

  /**
   * POST /v1/admin/companies/:id/suspend
   * Suspende uma empresa aprovada
   * TASK-034: Suspend company
   */
  @Post(':id/suspend')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Suspende uma empresa' })
  @ApiResponse({ status: 200, description: 'Empresa suspensa com sucesso' })
  async suspend(@Param('id') companyId: string, @Body() dto: SuspendDto) {
    try {
      const company = await prisma.company.findUnique({
        where: { id: companyId },
        select: { name: true, isSuspended: true },
      });

      if (!company) {
        throw new Error('Company not found');
      }

      if (company.isSuspended) {
        throw new Error('Company already suspended');
      }

      await prisma.company.update({
        where: { id: companyId },
        data: {
          isSuspended: true,
          suspensionReason: dto.reason,
        },
      });

      this.logger.warn({
        message: 'Company suspended',
        companyId,
        companyName: company.name,
        reason: dto.reason,
      });

      return {
        success: true,
        message: `Company ${company.name} suspended`,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      this.logger.error({
        message: 'Failed to suspend company',
        companyId,
        error: errorMessage,
      });

      throw error;
    }
  }

  /**
   * POST /v1/admin/companies/:id/reactivate
   * Reativa uma empresa suspensa
   * TASK-034: Reactivate company
   */
  @Post(':id/reactivate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reativa uma empresa' })
  @ApiResponse({ status: 200, description: 'Empresa reativada com sucesso' })
  async reactivate(@Param('id') companyId: string) {
    try {
      const company = await prisma.company.findUnique({
        where: { id: companyId },
        select: { name: true, isSuspended: true, isActive: true },
      });

      if (!company) {
        throw new Error('Company not found');
      }

      if (!company.isSuspended && company.isActive) {
        throw new Error('Company is already active');
      }

      await prisma.company.update({
        where: { id: companyId },
        data: {
          isSuspended: false,
          isActive: true,
          suspensionReason: null,
        },
      });

      this.logger.log({
        message: 'Company reactivated',
        companyId,
        companyName: company.name,
      });

      return {
        success: true,
        message: `Company ${company.name} reactivated`,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      this.logger.error({
        message: 'Failed to reactivate company',
        companyId,
        error: errorMessage,
      });

      throw error;
    }
  }
}
