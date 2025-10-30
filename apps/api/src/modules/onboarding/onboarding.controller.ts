import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { DKIMGeneratorService } from './dkim-generator.service';
import { DNSVerifierService } from './dns-verifier.service';
import { ChecklistGeneratorService } from './checklist-generator.service';
import { ProductionReadinessService } from './production-readiness.service';

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
   * Start the onboarding process for a domain
   */
  @Post('start')
  async startOnboarding(@Param('domainId') domainId: string) {
    try {
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
      throw new HttpException(
        {
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'Failed to start domain onboarding',
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * GET /domains/:domainId/onboarding/status
   * Get current onboarding status
   */
  @Get('status')
  async getOnboardingStatus(@Param('domainId') domainId: string) {
    try {
      const status = await this.checklistGenerator.getOnboardingStatus(domainId);

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
      throw new HttpException(
        {
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'Failed to retrieve onboarding status',
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * POST /domains/:domainId/onboarding/generate-dkim
   * Generate DKIM key pair for domain
   */
  @Post('generate-dkim')
  async generateDKIM(@Param('domainId') domainId: string) {
    try {
      this.logger.log(`Generating DKIM for domain: ${domainId}`);

      // Get domain info first
      const domain = await this.checklistGenerator.getDomainInfo(domainId);
      if (!domain) {
        throw new HttpException('Domain not found', HttpStatus.NOT_FOUND);
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
      throw new HttpException(
        {
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'Failed to generate DKIM keys',
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * POST /domains/:domainId/onboarding/verify
   * Manually trigger DNS verification
   */
  @Post('verify')
  async verifyDNS(@Param('domainId') domainId: string) {
    try {
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
      throw new HttpException(
        {
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'Failed to verify DNS records',
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * GET /domains/:domainId/onboarding/checklist
   * Get complete onboarding checklist
   */
  @Get('checklist')
  async getChecklist(@Param('domainId') domainId: string) {
    try {
      const checklist = await this.checklistGenerator.generateChecklist(domainId);

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
      throw new HttpException(
        {
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'Failed to generate checklist',
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * POST /domains/:domainId/onboarding/approve-production
   * Mark domain as production ready (admin only)
   */
  @Post('approve-production')
  async approveForProduction(
    @Param('domainId') domainId: string,
    @Body() body: { approvedBy: string; notes?: string }
  ) {
    try {
      this.logger.log(`Approving domain for production: ${domainId}`);

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
      throw new HttpException(
        {
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'Failed to approve domain for production',
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
