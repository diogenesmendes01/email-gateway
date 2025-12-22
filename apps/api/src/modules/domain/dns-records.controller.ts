import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  HttpException,
  HttpStatus,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { ApiProtected, Company } from '../auth/decorators';
import { MetricsService } from '../metrics/metrics.service';

interface DNSRecordResponse {
  id: string;
  recordType: string;
  name: string;
  value: string;
  priority?: number;
  isVerified: boolean;
  lastChecked?: Date;
  createdAt: Date;
  updatedAt: Date;
}

interface DNSRecordsListResponse {
  domainId: string;
  domain: string;
  records: DNSRecordResponse[];
  summary: {
    total: number;
    verified: number;
    pending: number;
    failed: number;
  };
}

@Controller('domains/:domainId/dns-records')
@ApiProtected()
export class DNSRecordsController {
  private readonly logger = new Logger(DNSRecordsController.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly metricsService: MetricsService,
  ) {}

  /**
   * GET /domains/:domainId/dns-records
   * Get all DNS records for a domain
   */
  @Get()
  async getDNSRecords(
    @Param('domainId') domainId: string,
    @Company() companyId: string,
  ): Promise<DNSRecordsListResponse> {
    try {
      this.logger.log(`Getting DNS records for domain: ${domainId}`);

      // TASK-038: Validate domain ownership
      const domain = await this.prisma.domain.findFirst({
        where: {
          id: domainId,
          companyId,
        },
        select: { domain: true },
      });

      if (!domain) {
        // TASK-038: Record domain access denied metric
        this.metricsService.recordDomainAccessDenied(companyId, domainId, 'get');
        throw new NotFoundException('Domain not found or does not belong to your company');
      }

      // Get DNS records
      const records = await this.prisma.dNSRecord.findMany({
        where: { domainId },
        orderBy: { createdAt: 'desc' },
      });

      // Calculate summary
      const verified = records.filter((r: any) => r.isVerified).length;
      const failed = records.filter((r: any) => r.lastChecked && !r.isVerified).length;
      const pending = records.length - verified - failed;

      const response: DNSRecordsListResponse = {
        domainId,
        domain: domain.domain,
        records: records.map((r: any) => ({
          id: r.id,
          recordType: r.recordType,
          name: r.name,
          value: r.value,
          priority: r.priority || undefined,
          isVerified: r.isVerified,
          lastChecked: r.lastChecked || undefined,
          createdAt: r.createdAt,
          updatedAt: r.updatedAt,
        })),
        summary: {
          total: records.length,
          verified,
          pending,
          failed,
        },
      };

      return response;
    } catch (error) {
      this.logger.error(`Failed to get DNS records for domain ${domainId}:`, error);
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        {
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'Failed to retrieve DNS records',
          error: (error as Error).message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * POST /domains/:domainId/dns-records
   * Add a new DNS record
   */
  @Post()
  async addDNSRecord(
    @Param('domainId') domainId: string,
    @Company() companyId: string,
    @Body() body: {
      recordType: string;
      name: string;
      value: string;
      priority?: number;
    }
  ): Promise<DNSRecordResponse> {
    try {
      this.logger.log(`Adding DNS record for domain: ${domainId}`);

      // TASK-038: Validate domain ownership
      const domain = await this.prisma.domain.findFirst({
        where: {
          id: domainId,
          companyId,
        },
        select: { id: true },
      });

      if (!domain) {
        // TASK-038: Record domain access denied metric
        this.metricsService.recordDomainAccessDenied(companyId, domainId, 'post');
        throw new NotFoundException('Domain not found or does not belong to your company');
      }

      // Create DNS record
      const record = await this.prisma.dNSRecord.create({
        data: {
          domainId,
          recordType: body.recordType,
          name: body.name,
          value: body.value,
          priority: body.priority,
          isVerified: false,
        },
      });

      this.logger.log(`DNS record created: ${record.id}`);

      return {
        id: record.id,
        recordType: record.recordType,
        name: record.name,
        value: record.value,
        priority: record.priority || undefined,
        isVerified: record.isVerified,
        lastChecked: record.lastChecked || undefined,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
      };
    } catch (error) {
      this.logger.error(`Failed to add DNS record for domain ${domainId}:`, error);
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        {
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'Failed to add DNS record',
          error: (error as Error).message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * POST /domains/:domainId/dns-records/:recordId/verify
   * Manually verify a DNS record
   */
  @Post(':recordId/verify')
  async verifyDNSRecord(
    @Param('domainId') domainId: string,
    @Param('recordId') recordId: string,
    @Company() companyId: string,
  ): Promise<{ success: boolean; message: string }> {
    try {
      this.logger.log(`Verifying DNS record: ${recordId}`);

      // TASK-038: Get the record and validate domain ownership
      const record = await this.prisma.dNSRecord.findFirst({
        where: {
          id: recordId,
          domainId,
        },
        include: {
          domain: {
            where: { companyId },
            select: { id: true },
          },
        },
      });

      if (!record || !record.domain) {
        // TASK-038: Record domain access denied metric
        this.metricsService.recordDomainAccessDenied(companyId, domainId, 'verify');
        throw new NotFoundException('DNS record not found or domain does not belong to your company');
      }

      // For now, mark as verified (in production, would do actual DNS lookup)
      // TODO: Implement actual DNS verification logic
      await this.prisma.dNSRecord.update({
        where: { id: recordId },
        data: {
          isVerified: true,
          lastChecked: new Date(),
        },
      });

      return {
        success: true,
        message: 'DNS record verified successfully',
      };
    } catch (error) {
      this.logger.error(`Failed to verify DNS record ${recordId}:`, error);
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        {
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'Failed to verify DNS record',
          error: (error as Error).message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * DELETE /domains/:domainId/dns-records/:recordId
   * Delete a DNS record
   */
  @Delete(':recordId')
  async deleteDNSRecord(
    @Param('domainId') domainId: string,
    @Param('recordId') recordId: string,
    @Company() companyId: string,
  ): Promise<{ success: boolean; message: string }> {
    try {
      this.logger.log(`Deleting DNS record: ${recordId}`);

      // TASK-038: Delete the record with domain ownership validation
      const result = await this.prisma.dNSRecord.deleteMany({
        where: {
          id: recordId,
          domain: {
            id: domainId,
            companyId,
          },
        },
      });

      if (result.count === 0) {
        // TASK-038: Record domain access denied metric
        this.metricsService.recordDomainAccessDenied(companyId, domainId, 'delete');
        throw new NotFoundException('DNS record not found or domain does not belong to your company');
      }

      this.logger.log(`DNS record deleted: ${recordId}`);

      return {
        success: true,
        message: 'DNS record deleted successfully',
      };
    } catch (error) {
      this.logger.error(`Failed to delete DNS record ${recordId}:`, error);
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        {
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'Failed to delete DNS record',
          error: (error as Error).message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
