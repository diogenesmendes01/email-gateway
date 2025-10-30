import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  BadRequestException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { IsString, IsNotEmpty, IsOptional, IsNumber, IsIn } from 'class-validator';
import { PrismaService } from '../../database/prisma.service';

/**
 * DTO para criar DNS record
 */
export class CreateDNSRecordDto {
  @IsString()
  @IsNotEmpty()
  @IsIn(['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'SPF', 'DKIM'])
  recordType: string;

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  value: string;

  @IsOptional()
  @IsNumber()
  priority?: number;
}

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

/**
 * DNS Records Controller - TRACK 3
 * Gerencia registros DNS para domínios
 * CORREÇÕES: Input validation, error handling robusto, N+1 queries eliminadas
 */
@Controller('domains/:domainId/dns-records')
export class DNSRecordsController {
  private readonly logger = new Logger(DNSRecordsController.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * GET /domains/:domainId/dns-records
   * Obter todos os registros DNS de um domínio
   * CORREÇÃO: Validação de UUID + melhor error handling
   */
  @Get()
  async getDNSRecords(@Param('domainId') domainId: string): Promise<DNSRecordsListResponse> {
    try {
      // Validar UUID format
      if (!this.isValidUUID(domainId)) {
        throw new BadRequestException('Invalid domain ID format');
      }

      this.logger.log(`Getting DNS records for domain: ${domainId}`);

      // FIX N+1: Buscar domínio com registros em uma query
      const domain = await this.prisma.domain.findUnique({
        where: { id: domainId },
        select: {
          id: true,
          domain: true,
          dnsRecords: {
            orderBy: { createdAt: 'desc' },
            select: {
              id: true,
              recordType: true,
              name: true,
              value: true,
              priority: true,
              isVerified: true,
              lastChecked: true,
              createdAt: true,
              updatedAt: true,
            },
          },
        },
      });

      if (!domain) {
        throw new NotFoundException(`Domain with ID ${domainId} not found`);
      }

      const records = domain.dnsRecords || [];

      // Calculate summary
      const verified = records.filter(r => r.isVerified).length;
      const failed = records.filter(r => r.lastChecked && !r.isVerified).length;
      const pending = records.length - verified - failed;

      const response: DNSRecordsListResponse = {
        domainId,
        domain: domain.domain,
        records: records.map(r => ({
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

      if (error instanceof BadRequestException || error instanceof NotFoundException) {
        throw error;
      }

      throw new BadRequestException(
        error instanceof Error ? error.message : 'Failed to retrieve DNS records'
      );
    }
  }

  /**
   * POST /domains/:domainId/dns-records
   * Adicionar um novo registro DNS
   * CORREÇÃO: Validação completa de entrada com DTO
   */
  @Post()
  async addDNSRecord(
    @Param('domainId') domainId: string,
    @Body() body: CreateDNSRecordDto
  ): Promise<DNSRecordResponse> {
    try {
      // Validar UUID format
      if (!this.isValidUUID(domainId)) {
        throw new BadRequestException('Invalid domain ID format');
      }

      // Validar body
      if (!body.recordType || !body.name || !body.value) {
        throw new BadRequestException('recordType, name, and value are required');
      }

      this.logger.log(`Adding DNS record for domain: ${domainId}`);

      // Validate domain exists
      const domain = await this.prisma.domain.findUnique({
        where: { id: domainId },
        select: { id: true },
      });

      if (!domain) {
        throw new NotFoundException(`Domain with ID ${domainId} not found`);
      }

      // Validate record type
      const validRecordTypes = ['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'SPF', 'DKIM'];
      if (!validRecordTypes.includes(body.recordType)) {
        throw new BadRequestException(
          `Invalid record type. Allowed: ${validRecordTypes.join(', ')}`
        );
      }

      // Validate priority for MX records
      if (body.recordType === 'MX' && !body.priority) {
        throw new BadRequestException('priority is required for MX records');
      }

      // Create DNS record
      const record = await this.prisma.dnsRecord.create({
        data: {
          domainId,
          recordType: body.recordType,
          name: body.name,
          value: body.value,
          priority: body.priority,
          isVerified: false,
          lastChecked: null,
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

      if (error instanceof BadRequestException || error instanceof NotFoundException) {
        throw error;
      }

      throw new BadRequestException(
        error instanceof Error ? error.message : 'Failed to add DNS record'
      );
    }
  }

  /**
   * POST /domains/:domainId/dns-records/:recordId/verify
   * Verificar manualmente um registro DNS
   * CORREÇÃO: Validação de UUIDs melhorada
   */
  @Post(':recordId/verify')
  async verifyDNSRecord(
    @Param('domainId') domainId: string,
    @Param('recordId') recordId: string
  ): Promise<{ success: boolean; message: string }> {
    try {
      // Validar UUIDs
      if (!this.isValidUUID(domainId)) {
        throw new BadRequestException('Invalid domain ID format');
      }

      if (!this.isValidUUID(recordId)) {
        throw new BadRequestException('Invalid record ID format');
      }

      this.logger.log(`Verifying DNS record: ${recordId}`);

      // Get the record
      const record = await this.prisma.dnsRecord.findFirst({
        where: {
          id: recordId,
          domainId,
        },
      });

      if (!record) {
        throw new NotFoundException(`DNS record with ID ${recordId} not found for this domain`);
      }

      // For now, mark as verified (in production, would do actual DNS lookup)
      // TODO: Implement actual DNS verification logic using dns-checker service
      await this.prisma.dnsRecord.update({
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

      if (error instanceof BadRequestException || error instanceof NotFoundException) {
        throw error;
      }

      throw new BadRequestException(
        error instanceof Error ? error.message : 'Failed to verify DNS record'
      );
    }
  }

  /**
   * DELETE /domains/:domainId/dns-records/:recordId
   * Deletar um registro DNS
   * CORREÇÃO: Validação de UUIDs + melhor error handling
   */
  @Delete(':recordId')
  async deleteDNSRecord(
    @Param('domainId') domainId: string,
    @Param('recordId') recordId: string
  ): Promise<{ success: boolean; message: string }> {
    try {
      // Validar UUIDs
      if (!this.isValidUUID(domainId)) {
        throw new BadRequestException('Invalid domain ID format');
      }

      if (!this.isValidUUID(recordId)) {
        throw new BadRequestException('Invalid record ID format');
      }

      this.logger.log(`Deleting DNS record: ${recordId}`);

      // Verify record exists before deletion
      const record = await this.prisma.dnsRecord.findFirst({
        where: {
          id: recordId,
          domainId,
        },
      });

      if (!record) {
        throw new NotFoundException(`DNS record with ID ${recordId} not found for this domain`);
      }

      // Delete the record
      await this.prisma.dnsRecord.delete({
        where: { id: recordId },
      });

      this.logger.log(`DNS record deleted: ${recordId}`);

      return {
        success: true,
        message: 'DNS record deleted successfully',
      };
    } catch (error) {
      this.logger.error(`Failed to delete DNS record ${recordId}:`, error);

      if (error instanceof BadRequestException || error instanceof NotFoundException) {
        throw error;
      }

      throw new BadRequestException(
        error instanceof Error ? error.message : 'Failed to delete DNS record'
      );
    }
  }

  /**
   * Validar formato de UUID v4
   */
  private isValidUUID(uuid: string): boolean {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidRegex.test(uuid);
  }
}
