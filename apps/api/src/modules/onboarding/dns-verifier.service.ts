import { Injectable, Logger } from '@nestjs/common';
import { DNSCheckerService } from './dns-checker.service';
import { DKIMGeneratorService } from './dkim-generator.service';
import { PrismaService } from '../../database/prisma.service';
import { DomainOnboardingStatus } from '@certshift/database';

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

@Injectable()
export class DNSVerifierService {
  private readonly logger = new Logger(DNSVerifierService.name);

  constructor(
    private readonly dnsChecker: DNSCheckerService,
    private readonly dkimGenerator: DKIMGeneratorService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Verify all DNS records for a domain
   */
  async verifyAllRecords(domainId: string): Promise<VerificationResult> {
    this.logger.log(`Starting DNS verification for domain: ${domainId}`);

    try {
      // Get domain and onboarding info
      const domain = await this.prisma.domain.findUnique({
        where: { id: domainId },
        select: { domain: true },
      });

      if (!domain) {
        throw new Error('Domain not found');
      }

      const onboarding = await this.prisma.domainOnboarding.findUnique({
        where: { domainId },
        select: {
          dkimGenerated: true,
          dkimSelector: true,
          spfRecord: true,
          returnPath: true,
          trackingDomain: true,
        },
      });

      if (!onboarding) {
        throw new Error('Domain onboarding not found');
      }

      // Run all checks in parallel
      const checks = await Promise.all([
        this.verifyDKIM(domain.domain, onboarding),
        this.verifySPF(domain.domain, onboarding),
        this.verifyReturnPath(domain.domain, onboarding),
        this.verifyTrackingDomain(domain.domain, onboarding),
      ]);

      // Update onboarding status based on results
      const allPassed = checks.every(check => check.valid);
      const newStatus = allPassed
        ? DomainOnboardingStatus.PRODUCTION_READY
        : DomainOnboardingStatus.DNS_CONFIGURED;

      await this.updateVerificationStatus(domainId, checks, newStatus);

      this.logger.log(`DNS verification completed for domain ${domain.domain}: ${allPassed ? 'PASSED' : 'FAILED'}`);

      return {
        domain: domain.domain,
        checks,
        allPassed,
        productionReady: allPassed,
      };
    } catch (error) {
      this.logger.error(`DNS verification failed for domain ${domainId}:`, error);
      throw new Error(`DNS verification failed: ${error.message}`);
    }
  }

  /**
   * Verify DKIM DNS record
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
    const expectedValue = await this.getExpectedDKIMValue(domain, onboarding.dkimSelector);

    try {
      const result = await this.dnsChecker.lookupTXT(recordName);
      const foundValue = result.join('');

      // Check if the record contains the expected DKIM key
      const valid = foundValue.includes(expectedValue);

      return {
        type: 'DKIM',
        record: recordName,
        expected: expectedValue,
        found: foundValue,
        valid,
        error: valid ? undefined : 'DKIM record does not match expected value',
      };
    } catch (error) {
      return {
        type: 'DKIM',
        record: recordName,
        expected: expectedValue,
        valid: false,
        error: `DNS lookup failed: ${error.message}`,
      };
    }
  }

  /**
   * Verify SPF DNS record
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
        error: `DNS lookup failed: ${error.message}`,
      };
    }
  }

  /**
   * Verify Return-Path domain
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
        error: `Return-path domain not resolvable: ${error.message}`,
      };
    }
  }

  /**
   * Verify Tracking domain
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
        error: `Tracking domain not resolvable: ${error.message}`,
      };
    }
  }

  /**
   * Get expected DKIM value for verification
   */
  private async getExpectedDKIMValue(domain: string, selector: string): Promise<string> {
    // Get the public key from database
    const privateKey = await this.dkimGenerator.getPrivateKeyForSigning(domain);
    if (!privateKey) {
      throw new Error('DKIM private key not found');
    }

    // For verification, we need the public key part
    // This is a simplified version - in production you'd derive from private key
    const onboarding = await this.prisma.domainOnboarding.findFirst({
      where: { dkimSelector: selector },
      select: { dkimPublic: true },
    });

    if (!onboarding?.dkimPublic) {
      throw new Error('DKIM public key not found');
    }

    return onboarding.dkimPublic;
  }

  /**
   * Update verification status in database
   */
  private async updateVerificationStatus(
    domainId: string,
    checks: DNSCheckResult[],
    newStatus: DomainOnboardingStatus
  ): Promise<void> {
    const now = new Date();

    await this.prisma.domainOnboarding.update({
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
      await this.prisma.dnsRecord.upsert({
        where: {
          domainId_recordType_name: {
            domainId,
            recordType: 'TXT',
            name: check.record,
          },
        },
        create: {
          domainId,
          recordType: 'TXT',
          name: check.record,
          value: check.found || '',
          isVerified: check.valid,
          lastChecked: now,
        },
        update: {
          value: check.found || '',
          isVerified: check.valid,
          lastChecked: now,
        },
      });
    }
  }
}
