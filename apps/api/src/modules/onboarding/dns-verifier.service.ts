import { Injectable, Logger, NotFoundException, InternalServerErrorException } from '@nestjs/common';
import { DNSCheckerService } from './dns-checker.service';
import { DKIMGeneratorService } from './dkim-generator.service';
import { PrismaService } from '../../database/prisma.service';
import { DomainOnboardingStatus } from '@email-gateway/database';

export interface VerificationResult {
  domain: string;
  checks: DNSCheckResult[];
  allPassed: boolean;
  productionReady: boolean;
}

export interface DNSCheckResult {
  type: 'DKIM' | 'SPF' | 'ReturnPath' | 'Tracking';
  record: string;
  expected: string;
  found?: string;
  valid: boolean;
  error?: string;
}

/**
 * DNS Verifier Service - TRACK 3
 * Verifica todos os registros DNS necessários para autenticação de email
 * CORREÇÕES: N+1 queries eliminadas, error handling robusto, transações Prisma
 */
@Injectable()
export class DNSVerifierService {
  private readonly logger = new Logger(DNSVerifierService.name);

  constructor(
    private readonly dnsChecker: DNSCheckerService,
    private readonly dkimGenerator: DKIMGeneratorService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Verificar todos os registros DNS de um domínio
   * CORREÇÃO: Agora faz um fetch único com includes em vez de N+1 queries
   */
  async verifyAllRecords(domainId: string): Promise<VerificationResult> {
    try {
      this.logger.log(`Starting DNS verification for domain: ${domainId}`);

      // FIX N+1: Buscar domínio e onboarding em uma única query com select específico
      const domainWithOnboarding = await this.prisma.domain.findUnique({
        where: { id: domainId },
        select: {
          id: true,
          domain: true,
          onboarding: {
            select: {
              id: true,
              dkimGenerated: true,
              dkimSelector: true,
              dkimPublic: true,
              spfRecord: true,
              returnPath: true,
              trackingDomain: true,
            },
          },
        },
      });

      if (!domainWithOnboarding) {
        throw new NotFoundException(`Domain with ID ${domainId} not found`);
      }

      if (!domainWithOnboarding.onboarding) {
        throw new NotFoundException(`Onboarding configuration for domain ${domainId} not found`);
      }

      const domain = domainWithOnboarding.domain;
      const onboarding = domainWithOnboarding.onboarding;

      // Run all checks in parallel
      const checks = await Promise.all([
        this.verifyDKIM(domain, onboarding),
        this.verifySPF(domain, onboarding),
        this.verifyReturnPath(domain, onboarding),
        this.verifyTrackingDomain(domain, onboarding),
      ]);

      // Determine new status
      const allPassed = checks.every(check => check.valid);
      const newStatus = allPassed
        ? DomainOnboardingStatus.PRODUCTION_READY
        : DomainOnboardingStatus.DNS_CONFIGURED;

      // Update verification status in a single transaction
      await this.updateVerificationStatus(domainId, checks, newStatus);

      this.logger.log(
        `DNS verification completed for domain ${domain}: ${allPassed ? 'PASSED' : 'FAILED'}`
      );

      return {
        domain,
        checks,
        allPassed,
        productionReady: allPassed,
      };
    } catch (error) {
      this.logger.error(`DNS verification failed for domain ${domainId}:`, error);

      if (error instanceof NotFoundException) {
        throw error;
      }

      throw new InternalServerErrorException(
        `DNS verification failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Verificar registro DKIM DNS
   */
  private async verifyDKIM(domain: string, onboarding: any): Promise<DNSCheckResult> {
    if (!onboarding.dkimGenerated || !onboarding.dkimSelector) {
      return {
        type: 'DKIM',
        record: `dkim._domainkey.${domain}`,
        expected: 'DKIM record not generated',
        valid: false,
        error: 'DKIM not generated yet',
      };
    }

    const recordName = `${onboarding.dkimSelector}._domainkey.${domain}`;

    try {
      // Use cached public key from onboarding instead of looking up again
      const expectedValue = onboarding.dkimPublic;

      if (!expectedValue) {
        return {
          type: 'DKIM',
          record: recordName,
          expected: 'DKIM public key',
          valid: false,
          error: 'DKIM public key not found in onboarding',
        };
      }

      const result = await this.dnsChecker.lookupTXT(recordName);
      const foundValue = result.join('');

      // Check if the record contains the expected DKIM key
      const valid = foundValue.includes(expectedValue);

      return {
        type: 'DKIM',
        record: recordName,
        expected: expectedValue.substring(0, 50) + '...',
        found: foundValue.substring(0, 50) + '...',
        valid,
        error: valid ? undefined : 'DKIM record does not match expected value',
      };
    } catch (error) {
      return {
        type: 'DKIM',
        record: recordName,
        expected: 'DKIM public key',
        valid: false,
        error: `DNS lookup failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Verificar registro SPF DNS
   */
  private async verifySPF(domain: string, onboarding: any): Promise<DNSCheckResult> {
    const recordName = domain;

    try {
      const result = await this.dnsChecker.lookupTXT(recordName);
      const txtRecords = result.filter(record => record.startsWith('v=spf1'));

      if (txtRecords.length === 0) {
        return {
          type: 'SPF',
          record: recordName,
          expected: 'v=spf1 include:_spf.certshift.com ~all',
          valid: false,
          error: 'No SPF record found',
        };
      }

      const spfRecord = txtRecords[0];
      const expectedSPF = onboarding.spfRecord || 'v=spf1 include:_spf.certshift.com ~all';

      // Basic SPF validation - check if it includes our domain
      const valid = spfRecord.includes('certshift.com') || spfRecord === expectedSPF;

      return {
        type: 'SPF',
        record: recordName,
        expected: expectedSPF,
        found: spfRecord,
        valid,
        error: valid ? undefined : 'SPF record does not include CertShift',
      };
    } catch (error) {
      return {
        type: 'SPF',
        record: recordName,
        expected: 'v=spf1 include:_spf.certshift.com ~all',
        valid: false,
        error: `DNS lookup failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Verificar domínio Return-Path
   */
  private async verifyReturnPath(domain: string, onboarding: any): Promise<DNSCheckResult> {
    const returnPathDomain = onboarding.returnPath || `bounce.${domain}`;

    try {
      // Try to resolve the domain
      await this.dnsChecker.lookupA(returnPathDomain);

      return {
        type: 'ReturnPath',
        record: returnPathDomain,
        expected: 'A/AAAA record exists',
        valid: true,
      };
    } catch (error) {
      return {
        type: 'ReturnPath',
        record: returnPathDomain,
        expected: 'A/AAAA record exists',
        valid: false,
        error: `Return-path domain not resolvable: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Verificar domínio de Tracking
   */
  private async verifyTrackingDomain(domain: string, onboarding: any): Promise<DNSCheckResult> {
    const trackingDomain = onboarding.trackingDomain || `track.${domain}`;

    try {
      // Try to resolve the domain
      await this.dnsChecker.lookupA(trackingDomain);

      return {
        type: 'Tracking',
        record: trackingDomain,
        expected: 'A/AAAA record exists',
        valid: true,
      };
    } catch (error) {
      return {
        type: 'Tracking',
        record: trackingDomain,
        expected: 'A/AAAA record exists',
        valid: false,
        error: `Tracking domain not resolvable: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Atualizar status de verificação no banco (com transação)
   * CORREÇÃO: Agora usa transação Prisma para garantir atomicidade
   */
  private async updateVerificationStatus(
    domainId: string,
    checks: DNSCheckResult[],
    newStatus: DomainOnboardingStatus
  ): Promise<void> {
    try {
      const now = new Date();

      // Use transaction to ensure atomicity
      await this.prisma.$transaction(async (tx) => {
        // Update domain onboarding status
        await tx.domainOnboarding.update({
          where: { domainId },
          data: {
            status: newStatus,
            lastCheckAt: now,
            nextCheckAt: new Date(now.getTime() + 60 * 60 * 1000), // Next check in 1 hour
            checkAttempts: { increment: 1 },
            updatedAt: now,
          },
        });

        // Update individual DNS records
        for (const check of checks) {
          const existing = await tx.dNSRecord.findFirst({
            where: {
              domainId,
              recordType: 'TXT',
              name: check.record,
            },
          });

          if (existing) {
            await tx.dNSRecord.update({
              where: { id: existing.id },
              data: {
                value: check.found || '',
                isVerified: check.valid,
                lastChecked: now,
              },
            });
          } else {
            await tx.dNSRecord.create({
              data: {
                domainId,
                recordType: 'TXT',
                name: check.record,
                value: check.found || '',
                isVerified: check.valid,
                lastChecked: now,
              },
            });
          }
        }
      });
    } catch (error) {
      this.logger.error(
        `Failed to update verification status for domain ${domainId}:`,
        error
      );
      throw new InternalServerErrorException('Failed to update verification status');
    }
  }
}
