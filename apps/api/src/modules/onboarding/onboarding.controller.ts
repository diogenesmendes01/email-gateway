import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { IsString, IsNotEmpty, IsOptional, ValidateIf, IsUUID } from 'class-validator';
import { DKIMGeneratorService } from './dkim-generator.service';
import { DNSVerifierService } from './dns-verifier.service';
import { ChecklistGeneratorService } from './checklist-generator.service';
import { ProductionReadinessService } from './production-readiness.service';

/**
 * DTO de validação para iniciar onboarding
 */
export class StartOnboardingDto {
  @IsString()
  @IsNotEmpty()
  @IsUUID()
  domainId: string;
}

/**
 * DTO de validação para aprovar produção
 */
export class ApproveProductionDto {
  @IsString()
  @IsNotEmpty()
  approvedBy: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

/**
 * Onboarding Controller - TRACK 3
 * Gerencia o processo de onboarding de domínios para ESP self-hosted
 * CORREÇÕES: Input validation com DTOs, error handling robusto
 */
@Controller('domains/:domainId/onboarding')
export class OnboardingController {
  private readonly logger = new Logger(OnboardingController.name);

  constructor(
    private readonly dkimGenerator: DKIMGeneratorService,
    private readonly dnsVerifier: DNSVerifierService,
    private readonly checklistGenerator: ChecklistGeneratorService,
    private readonly productionReadiness: ProductionReadinessService,
  ) {}

  /**
   * POST /domains/:domainId/onboarding/start
   * Iniciar o processo de onboarding para um domínio
   * CORREÇÃO: Adicionada validação de UUID para domainId
   */
  @Post('start')
  async startOnboarding(@Param('domainId') domainId: string) {
    try {
      // Validar UUID format
      if (!this.isValidUUID(domainId)) {
        throw new BadRequestException('Invalid domain ID format');
      }

      this.logger.log(`Starting onboarding process for domain: ${domainId}`);

      const result = await this.checklistGenerator.initializeOnboarding(domainId);

      return {
        status: 'started',
        domainId,
        onboardingId: result.onboardingId,
        checklist: result.checklist,
        message: 'Domain onboarding process started successfully',
      };
    } catch (error) {
      this.logger.error(`Failed to start onboarding for domain ${domainId}:`, error);

      if (error instanceof BadRequestException) {
        throw error;
      }

      throw new BadRequestException(
        error instanceof Error ? error.message : 'Failed to start domain onboarding'
      );
    }
  }

  /**
   * GET /domains/:domainId/onboarding/status
   * Obter status atual do onboarding
   * CORREÇÃO: Melhor tratamento de erros
   */
  @Get('status')
  async getOnboardingStatus(@Param('domainId') domainId: string) {
    try {
      // Validar UUID format
      if (!this.isValidUUID(domainId)) {
        throw new BadRequestException('Invalid domain ID format');
      }

      const status = await this.checklistGenerator.getOnboardingStatus(domainId);

      if (!status) {
        throw new BadRequestException('Onboarding status not found for this domain');
      }

      return {
        domainId,
        status: status.status,
        progress: status.progress,
        checklist: status.checklist,
        lastChecked: status.lastChecked,
        nextCheck: status.nextCheck,
      };
    } catch (error) {
      this.logger.error(`Failed to get onboarding status for domain ${domainId}:`, error);

      if (error instanceof BadRequestException) {
        throw error;
      }

      throw new BadRequestException(
        error instanceof Error ? error.message : 'Failed to retrieve onboarding status'
      );
    }
  }

  /**
   * POST /domains/:domainId/onboarding/generate-dkim
   * Gerar par de chaves DKIM para domínio
   * CORREÇÃO: Validação de entrada melhorada
   */
  @Post('generate-dkim')
  async generateDKIM(@Param('domainId') domainId: string) {
    try {
      // Validar UUID format
      if (!this.isValidUUID(domainId)) {
        throw new BadRequestException('Invalid domain ID format');
      }

      this.logger.log(`Generating DKIM for domain: ${domainId}`);

      // Get domain info first
      const domain = await this.checklistGenerator.getDomainInfo(domainId);
      if (!domain) {
        throw new BadRequestException('Domain not found');
      }

      // Validate domain format
      if (!this.isValidDomain(domain.domain)) {
        throw new BadRequestException('Invalid domain format');
      }

      // Generate DKIM keys
      const dkimResult = await this.dkimGenerator.generateKeyPair(domain.domain);

      // Store in database
      await this.dkimGenerator.storeDKIMKeys(domainId, dkimResult);

      this.logger.log(`DKIM generated and stored for domain: ${domainId}`);

      return {
        status: 'success',
        domainId,
        selector: dkimResult.selector,
        dnsRecord: {
          type: dkimResult.dnsRecord.type,
          name: dkimResult.dnsRecord.name,
          value: dkimResult.dnsRecord.value,
          ttl: dkimResult.dnsRecord.ttl,
        },
        instructions: {
          title: 'Add this DNS record to your domain',
          description: 'Add a TXT record with the following details to enable DKIM signing',
          steps: [
            'Go to your DNS provider',
            'Add a new TXT record',
            `Name: ${dkimResult.dnsRecord.name}`,
            `Value: ${dkimResult.dnsRecord.value}`,
            `TTL: ${dkimResult.dnsRecord.ttl}`,
          ],
        },
      };
    } catch (error) {
      this.logger.error(`Failed to generate DKIM for domain ${domainId}:`, error);

      if (error instanceof BadRequestException) {
        throw error;
      }

      throw new BadRequestException(
        error instanceof Error ? error.message : 'Failed to generate DKIM keys'
      );
    }
  }

  /**
   * POST /domains/:domainId/onboarding/verify
   * Disparar manualmente a verificação de DNS
   * CORREÇÃO: Validação de entrada e melhor tratamento de erros
   */
  @Post('verify')
  async verifyDNS(@Param('domainId') domainId: string) {
    try {
      // Validar UUID format
      if (!this.isValidUUID(domainId)) {
        throw new BadRequestException('Invalid domain ID format');
      }

      this.logger.log(`Triggering DNS verification for domain: ${domainId}`);

      const verificationResult = await this.dnsVerifier.verifyAllRecords(domainId);

      return {
        domainId,
        success: verificationResult.allPassed,
        domain: verificationResult.domain,
        checks: verificationResult.checks,
        productionReady: verificationResult.productionReady,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error(`Failed to verify DNS for domain ${domainId}:`, error);

      if (error instanceof BadRequestException) {
        throw error;
      }

      throw new BadRequestException(
        error instanceof Error ? error.message : 'Failed to verify DNS records'
      );
    }
  }

  /**
   * GET /domains/:domainId/onboarding/checklist
   * Obter checklist completo de onboarding
   * CORREÇÃO: Validação de entrada
   */
  @Get('checklist')
  async getChecklist(@Param('domainId') domainId: string) {
    try {
      // Validar UUID format
      if (!this.isValidUUID(domainId)) {
        throw new BadRequestException('Invalid domain ID format');
      }

      const checklist = await this.checklistGenerator.generateChecklist(domainId);

      if (!checklist || !checklist.items) {
        throw new BadRequestException('Checklist not found for this domain');
      }

      return {
        domainId,
        checklist,
        summary: {
          total: checklist.items.length,
          completed: checklist.items.filter(item => item.status === 'completed').length,
          pending: checklist.items.filter(item => item.status === 'pending').length,
          failed: checklist.items.filter(item => item.status === 'failed').length,
        },
      };
    } catch (error) {
      this.logger.error(`Failed to get checklist for domain ${domainId}:`, error);

      if (error instanceof BadRequestException) {
        throw error;
      }

      throw new BadRequestException(
        error instanceof Error ? error.message : 'Failed to generate checklist'
      );
    }
  }

  /**
   * POST /domains/:domainId/onboarding/approve-production
   * Marcar domínio como pronto para produção (apenas admin)
   * CORREÇÃO: Validação completa de body com DTO
   */
  @Post('approve-production')
  async approveForProduction(
    @Param('domainId') domainId: string,
    @Body() body: ApproveProductionDto
  ) {
    try {
      // Validar UUID format
      if (!this.isValidUUID(domainId)) {
        throw new BadRequestException('Invalid domain ID format');
      }

      // Validar body - basic validation (class-validator deveria ser usado em interceptor)
      if (!body.approvedBy || typeof body.approvedBy !== 'string' || body.approvedBy.trim().length === 0) {
        throw new BadRequestException('approvedBy is required and must be a non-empty string');
      }

      if (body.notes !== undefined && typeof body.notes !== 'string') {
        throw new BadRequestException('notes must be a string if provided');
      }

      this.logger.log(`Approving domain for production: ${domainId} by ${body.approvedBy}`);

      const result = await this.productionReadiness.markProductionReady(
        domainId,
        body.approvedBy,
        body.notes
      );

      return {
        domainId,
        status: 'production_ready',
        approvedAt: result.approvedAt,
        approvedBy: result.approvedBy,
        message: 'Domain approved for production use',
      };
    } catch (error) {
      this.logger.error(`Failed to approve domain for production ${domainId}:`, error);

      if (error instanceof BadRequestException) {
        throw error;
      }

      throw new BadRequestException(
        error instanceof Error ? error.message : 'Failed to approve domain for production'
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

  /**
   * Validar formato de domínio
   */
  private isValidDomain(domain: string): boolean {
    const domainRegex = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i;
    return domainRegex.test(domain);
  }
}
