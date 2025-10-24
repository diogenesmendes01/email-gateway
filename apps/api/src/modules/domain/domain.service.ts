/**
 * @email-gateway/api - Domain Management Service
 *
 * Service para gerenciamento de domínios, DNS e configurações SES
 *
 * TASK 6.2 — SES, domínio e DNS (SPF/DKIM)
 * Lógica de negócio para verificação de domínio, criação de registros DNS,
 * validação de região/quota e warm-up de volumetria
 */

import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { prisma } from '@email-gateway/database';
import { DomainVerificationStatus as PrismaDomainVerificationStatus } from '@prisma/client';

// DTOs
import {
  DomainVerificationRequest,
  DomainVerificationResponse,
  DNSRecordsResponse,
  SESQuotaStatusResponse,
  WarmupConfigRequest,
  WarmupConfigResponse,
  SandboxChecklistResponse,
  RegionValidationResponse,
  DomainListResponse,
  DomainVerificationStatus,
  DKIMVerificationStatus,
  DNSRecord,
  ChecklistItem,
} from './dto/domain.dto';

// Domain management service from worker (TODO: move to shared package)
import { DomainManagementService } from '../../../../worker/src/services/domain-management.service';

/**
 * Service de gerenciamento de domínios
 */
@Injectable()
export class DomainService {
  private readonly logger = new Logger(DomainService.name);
  private domainManagementService: DomainManagementService;

  constructor(private configService: ConfigService) {
    const region = this.configService.get<string>('AWS_REGION', 'us-east-1');
    this.domainManagementService = new DomainManagementService(region);
  }

  /**
   * Lista domínios configurados para uma empresa
   */
  async listDomains(companyId: string): Promise<DomainListResponse> {
    // Busca domínios no banco de dados
    const domains = await prisma.domain.findMany({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
    });

    // Converte para response format
    const domainResponses: DomainVerificationResponse[] = await Promise.all(
      domains.map(async (domain) => {
        try {
          const status = await this.domainManagementService.verifyDomainStatus(domain.domain);
          return {
            domain: domain.domain,
            status: status.status,
            verificationToken: status.verificationToken,
            dnsRecords: status.dnsRecords,
            dkimTokens: status.dkimTokens,
            dkimStatus: status.dkimStatus,
            lastChecked: status.lastChecked?.toISOString(),
            errorMessage: status.errorMessage,
          };
        } catch (error) {
          return {
            domain: domain.domain,
            status: DomainVerificationStatus.FAILED,
            dnsRecords: [],
            errorMessage: error instanceof Error ? error.message : 'Unknown error',
          };
        }
      })
    );

    const verified = domainResponses.filter(d => d.status === DomainVerificationStatus.SUCCESS).length;
    const pending = domainResponses.filter(d => d.status === DomainVerificationStatus.PENDING).length;
    const failed = domainResponses.filter(d => d.status === DomainVerificationStatus.FAILED).length;

    return {
      domains: domainResponses,
      total: domains.length,
      verified,
      pending,
      failed,
    };
  }

  /**
   * Adiciona novo domínio para verificação
   */
  async addDomain(
    companyId: string,
    request: DomainVerificationRequest,
  ): Promise<DomainVerificationResponse> {
    // Valida formato do domínio
    if (!this.isValidDomain(request.domain)) {
      throw new BadRequestException(`Invalid domain format: ${request.domain}`);
    }

    // Verifica se o domínio já existe
    const existingDomain = await prisma.domain.findFirst({
      where: {
        companyId,
        domain: request.domain,
      },
    });

    if (existingDomain) {
      throw new BadRequestException(`Domain ${request.domain} already exists`);
    }

    try {
      // Inicia verificação do domínio
      const verificationInfo = await this.domainManagementService.startDomainVerification(request.domain);

      // Salva no banco de dados
      await prisma.domain.create({
        data: {
          companyId,
          domain: request.domain,
          status: verificationInfo.status as unknown as PrismaDomainVerificationStatus,
          dkimTokens: verificationInfo.dkimTokens || [],
        },
      });

      // Habilita DKIM se solicitado
      if (request.enableDKIM) {
        await this.domainManagementService.enableDKIM(request.domain);
      }

      return {
        domain: request.domain,
        status: verificationInfo.status,
        verificationToken: verificationInfo.verificationToken,
        dnsRecords: verificationInfo.dnsRecords,
        dkimTokens: verificationInfo.dkimTokens,
        dkimStatus: verificationInfo.dkimStatus,
        lastChecked: verificationInfo.lastChecked?.toISOString(),
        errorMessage: verificationInfo.errorMessage,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorStack = error instanceof Error ? error.stack : undefined;

      this.logger.error({
        message: 'Failed to add domain',
        domain: request.domain,
        error: errorMessage,
        stack: errorStack,
      });

      throw new BadRequestException(`Failed to add domain: ${errorMessage}`);
    }
  }

  /**
   * Obtém status de verificação de um domínio
   */
  async getDomainStatus(
    companyId: string,
    domain: string,
  ): Promise<DomainVerificationResponse> {
    // Busca domínio no banco
    const dbDomain = await prisma.domain.findFirst({
      where: {
        companyId,
        domain: domain,
      },
    });

    if (!dbDomain) {
      throw new NotFoundException(`Domain ${domain} not found`);
    }

    try {
      // Obtém status atualizado do SES
      const verificationInfo = await this.domainManagementService.verifyDomainStatus(domain);

      // Atualiza status no banco se mudou
      const newStatus = verificationInfo.status as unknown as PrismaDomainVerificationStatus;
      if (newStatus !== dbDomain.status) {
        await prisma.domain.update({
          where: { id: dbDomain.id },
          data: {
            status: newStatus,
            lastChecked: new Date(),
          },
        });
      }

      return {
        domain,
        status: verificationInfo.status,
        verificationToken: verificationInfo.verificationToken,
        dnsRecords: verificationInfo.dnsRecords,
        dkimTokens: verificationInfo.dkimTokens,
        dkimStatus: verificationInfo.dkimStatus,
        lastChecked: verificationInfo.lastChecked?.toISOString(),
        errorMessage: verificationInfo.errorMessage,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorStack = error instanceof Error ? error.stack : undefined;

      this.logger.error({
        message: 'Failed to get domain status',
        domain,
        error: errorMessage,
        stack: errorStack,
      });

      return {
        domain,
        status: DomainVerificationStatus.FAILED,
        dnsRecords: [],
        errorMessage,
      };
    }
  }

  /**
   * Inicia verificação de um domínio
   */
  async verifyDomain(
    companyId: string,
    domain: string,
  ): Promise<DomainVerificationResponse> {
    // Verifica se o domínio existe
    const dbDomain = await prisma.domain.findFirst({
      where: {
        companyId,
        domain: domain,
      },
    });

    if (!dbDomain) {
      throw new NotFoundException(`Domain ${domain} not found`);
    }

    try {
      // Inicia verificação
      const verificationInfo = await this.domainManagementService.startDomainVerification(domain);

      // Atualiza no banco
      await prisma.domain.update({
        where: { id: dbDomain.id },
        data: {
          status: verificationInfo.status as unknown as PrismaDomainVerificationStatus,
          lastChecked: new Date(),
        },
      });

      return {
        domain,
        status: verificationInfo.status,
        verificationToken: verificationInfo.verificationToken,
        dnsRecords: verificationInfo.dnsRecords,
        dkimTokens: verificationInfo.dkimTokens,
        dkimStatus: verificationInfo.dkimStatus,
        lastChecked: verificationInfo.lastChecked?.toISOString(),
        errorMessage: verificationInfo.errorMessage,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorStack = error instanceof Error ? error.stack : undefined;

      this.logger.error({
        message: 'Failed to verify domain',
        domain,
        error: errorMessage,
        stack: errorStack,
      });

      throw new BadRequestException(`Failed to verify domain: ${errorMessage}`);
    }
  }

  /**
   * Obtém registros DNS necessários para um domínio
   */
  async getDNSRecords(
    companyId: string,
    domain: string,
  ): Promise<DNSRecordsResponse> {
    // Verifica se o domínio existe
    const dbDomain = await prisma.domain.findFirst({
      where: {
        companyId,
        domain: domain,
      },
    });

    if (!dbDomain) {
      throw new NotFoundException(`Domain ${domain} not found`);
    }

    try {
      const records = await this.domainManagementService.generateDNSRecords(domain);
      
      return {
        domain,
        records,
        isValid: true,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorStack = error instanceof Error ? error.stack : undefined;

      this.logger.error({
        message: 'Failed to get DNS records',
        domain,
        error: errorMessage,
        stack: errorStack,
      });

      return {
        domain,
        records: [],
        isValid: false,
        errorMessage,
      };
    }
  }

  /**
   * Habilita DKIM para um domínio
   */
  async enableDKIM(
    companyId: string,
    domain: string,
  ): Promise<DNSRecordsResponse> {
    // Verifica se o domínio existe
    const dbDomain = await prisma.domain.findFirst({
      where: {
        companyId,
        domain: domain,
      },
    });

    if (!dbDomain) {
      throw new NotFoundException(`Domain ${domain} not found`);
    }

    try {
      // Habilita DKIM
      const dkimTokens = await this.domainManagementService.enableDKIM(domain);

      // Atualiza no banco
      await prisma.domain.update({
        where: { id: dbDomain.id },
        data: {
          dkimStatus: 'PENDING',
          dkimTokens,
        },
      });

      // Obtém registros DNS atualizados
      const records = await this.domainManagementService.generateDNSRecords(domain);

      return {
        domain,
        records,
        isValid: true,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorStack = error instanceof Error ? error.stack : undefined;

      this.logger.error({
        message: 'Failed to enable DKIM',
        domain,
        error: errorMessage,
        stack: errorStack,
      });

      return {
        domain,
        records: [],
        isValid: false,
        errorMessage,
      };
    }
  }

  /**
   * Valida registros DNS de um domínio
   */
  async validateDNS(
    companyId: string,
    domain: string,
  ): Promise<DNSRecordsResponse> {
    // Verifica se o domínio existe
    const dbDomain = await prisma.domain.findFirst({
      where: {
        companyId,
        domain: domain,
      },
    });

    if (!dbDomain) {
      throw new NotFoundException(`Domain ${domain} not found`);
    }

    try {
      const validation = await this.domainManagementService.validateDNSRecords(domain);
      const records = await this.domainManagementService.generateDNSRecords(domain);

      return {
        domain,
        records,
        missingRecords: validation.missingRecords,
        incorrectRecords: validation.incorrectRecords,
        isValid: validation.isValid,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorStack = error instanceof Error ? error.stack : undefined;

      this.logger.error({
        message: 'Failed to validate DNS',
        domain,
        error: errorMessage,
        stack: errorStack,
      });

      return {
        domain,
        records: [],
        isValid: false,
        errorMessage,
      };
    }
  }

  /**
   * Obtém status da quota SES
   */
  async getSESQuotaStatus(companyId: string): Promise<SESQuotaStatusResponse> {
    try {
      const quotaStatus = await this.domainManagementService.getSESQuotaStatus();
      const remainingQuota = quotaStatus.max24HourSend - quotaStatus.sentLast24Hours;

      return {
        ...quotaStatus,
        remainingQuota: Math.max(0, remainingQuota),
        lastUpdated: new Date().toISOString(),
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorStack = error instanceof Error ? error.stack : undefined;

      this.logger.error({
        message: 'Failed to get SES quota status',
        companyId,
        error: errorMessage,
        stack: errorStack,
      });

      throw new BadRequestException(`Failed to get SES quota status: ${errorMessage}`);
    }
  }

  /**
   * Configura warm-up para um domínio
   */
  async configureWarmup(
    companyId: string,
    domain: string,
    config: WarmupConfigRequest,
  ): Promise<WarmupConfigResponse> {
    // Verifica se o domínio existe
    const dbDomain = await prisma.domain.findFirst({
      where: {
        companyId,
        domain: domain,
      },
    });

    if (!dbDomain) {
      throw new NotFoundException(`Domain ${domain} not found`);
    }

    try {
      await this.domainManagementService.configureDomainWarmup({
        domain,
        ...config,
        startDate: new Date(config.startDate),
      });

      return {
        domain,
        config,
        success: true,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorStack = error instanceof Error ? error.stack : undefined;

      this.logger.error({
        message: 'Failed to configure warm-up',
        domain,
        companyId,
        error: errorMessage,
        stack: errorStack,
      });

      return {
        domain,
        config,
        success: false,
        errorMessage,
      };
    }
  }

  /**
   * Obtém checklist de sandbox para produção
   */
  async getSandboxChecklist(companyId: string): Promise<SandboxChecklistResponse> {
    try {
      const checklist = await this.domainManagementService.generateSandboxToProductionChecklist();
      
      // Calcula estatísticas
      const completedItems = checklist.items.filter(item => item.status === 'completed').length;
      const pendingItems = checklist.items.filter(item => item.status === 'pending').length;
      const failedItems = checklist.items.filter(item => item.status === 'failed').length;
      const totalItems = checklist.items.length;
      const completionPercentage = totalItems > 0 ? (completedItems / totalItems) * 100 : 0;

      return {
        items: checklist.items,
        completionPercentage,
        pendingItems,
        completedItems,
        failedItems,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorStack = error instanceof Error ? error.stack : undefined;

      this.logger.error({
        message: 'Failed to get sandbox checklist',
        companyId,
        error: errorMessage,
        stack: errorStack,
      });

      throw new BadRequestException(`Failed to get sandbox checklist: ${errorMessage}`);
    }
  }

  /**
   * Valida região SES
   */
  async validateRegion(companyId: string, region?: string): Promise<RegionValidationResponse> {
    try {
      const regionToValidate = region || this.configService.get<string>('AWS_REGION', 'us-east-1');
      const validation = await this.domainManagementService.validateSESRegion(regionToValidate);

      return {
        region: regionToValidate,
        ...validation,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorStack = error instanceof Error ? error.stack : undefined;

      this.logger.error({
        message: 'Failed to validate region',
        region: region || 'default',
        companyId,
        error: errorMessage,
        stack: errorStack,
      });

      throw new BadRequestException(`Failed to validate region: ${errorMessage}`);
    }
  }

  /**
   * Remove um domínio
   */
  async removeDomain(companyId: string, domain: string): Promise<void> {
    // Verifica se o domínio existe
    const dbDomain = await prisma.domain.findFirst({
      where: {
        companyId,
        domain: domain,
      },
    });

    if (!dbDomain) {
      throw new NotFoundException(`Domain ${domain} not found`);
    }

    try {
      // Remove do banco de dados
      await prisma.domain.delete({
        where: { id: dbDomain.id },
      });

      // TODO: Implementar remoção do SES se necessário
      // await this.domainManagementService.removeDomainFromSES(domain);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorStack = error instanceof Error ? error.stack : undefined;

      this.logger.error({
        message: 'Failed to remove domain',
        domain,
        companyId,
        error: errorMessage,
        stack: errorStack,
      });

      throw new BadRequestException(`Failed to remove domain: ${errorMessage}`);
    }
  }

  /**
   * Valida formato de domínio
   */
  private isValidDomain(domain: string): boolean {
    const domainRegex = /^[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?)*$/;
    return domainRegex.test(domain);
  }
}
