import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { DomainOnboardingStatus } from '@certshift/database';

export interface ProductionReadinessResult {
  ready: boolean;
  approvedAt: Date;
  approvedBy: string;
  checks: ReadinessCheck[];
  warnings: string[];
  recommendations: string[];
}

export interface ReadinessCheck {
  id: string;
  name: string;
  description: string;
  passed: boolean;
  severity: 'low' | 'medium' | 'high' | 'critical';
  details?: string;
  fix?: string;
}

@Injectable()
export class ProductionReadinessService {
  private readonly logger = new Logger(ProductionReadinessService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Check if domain is ready for production
   */
  async checkProductionReadiness(domainId: string): Promise<ProductionReadinessResult> {
    this.logger.log(`Checking production readiness for domain: ${domainId}`);

    const checks: ReadinessCheck[] = [];
    const warnings: string[] = [];
    const recommendations: string[] = [];

    // Get domain and onboarding data
    const domain = await this.prisma.domain.findUnique({
      where: { id: domainId },
      select: {
        domain: true,
        isActive: true,
        createdAt: true,
      },
    });

    const onboarding = await this.prisma.domainOnboarding.findUnique({
      where: { domainId },
      select: {
        status: true,
        dkimGenerated: true,
        spfRecord: true,
        returnPath: true,
        trackingDomain: true,
        readyForProduction: true,
        productionApprovedAt: true,
        productionApprovedBy: true,
        checkAttempts: true,
        lastCheckAt: true,
      },
    });

    if (!domain || !onboarding) {
      throw new Error('Domain or onboarding record not found');
    }

    // Check 1: Domain is active
    checks.push({
      id: 'domain-active',
      name: 'Domain Active',
      description: 'Domain must be active in the system',
      passed: domain.isActive,
      severity: 'critical',
      details: domain.isActive ? 'Domain is active' : 'Domain is inactive',
      fix: domain.isActive ? undefined : 'Activate the domain in domain management',
    });

    // Check 2: DKIM keys generated
    checks.push({
      id: 'dkim-generated',
      name: 'DKIM Keys Generated',
      description: 'DKIM key pair must be generated for email signing',
      passed: onboarding.dkimGenerated,
      severity: 'critical',
      details: onboarding.dkimGenerated ? 'DKIM keys are generated' : 'DKIM keys not generated',
      fix: onboarding.dkimGenerated ? undefined : 'Generate DKIM keys first',
    });

    // Check 3: DNS records verified
    const dnsRecords = await this.prisma.dnsRecord.findMany({
      where: { domainId },
      select: { isVerified: true, recordType: true, name: true },
    });

    const verifiedRecords = dnsRecords.filter(r => r.isVerified).length;
    const totalRecords = dnsRecords.length;
    const dnsVerified = totalRecords > 0 && verifiedRecords === totalRecords;

    checks.push({
      id: 'dns-verified',
      name: 'DNS Records Verified',
      description: 'All required DNS records must be verified',
      passed: dnsVerified,
      severity: 'critical',
      details: `${verifiedRecords}/${totalRecords} DNS records verified`,
      fix: dnsVerified ? undefined : 'Verify all DNS records are correctly configured',
    });

    // Check 4: SPF record configured
    checks.push({
      id: 'spf-configured',
      name: 'SPF Record Configured',
      description: 'SPF record must be configured to prevent spoofing',
      passed: !!onboarding.spfRecord,
      severity: 'high',
      details: onboarding.spfRecord ? 'SPF record configured' : 'SPF record missing',
      fix: onboarding.spfRecord ? undefined : 'Configure SPF record in DNS',
    });

    // Check 5: Return-path configured
    checks.push({
      id: 'return-path-configured',
      name: 'Return-Path Configured',
      description: 'Return-path domain must be configured for bounce handling',
      passed: !!onboarding.returnPath,
      severity: 'high',
      details: onboarding.returnPath ? 'Return-path configured' : 'Return-path missing',
      fix: onboarding.returnPath ? undefined : 'Configure return-path domain in DNS',
    });

    // Check 6: Tracking domain configured (optional but recommended)
    checks.push({
      id: 'tracking-domain-configured',
      name: 'Tracking Domain Configured',
      description: 'Tracking domain configured for open/click tracking (recommended)',
      passed: !!onboarding.trackingDomain,
      severity: 'medium',
      details: onboarding.trackingDomain ? 'Tracking domain configured' : 'Tracking domain not configured',
      fix: onboarding.trackingDomain ? undefined : 'Configure tracking domain in DNS (optional)',
    });

    // Check 7: Domain age (prefer domains older than 30 days)
    const domainAge = Date.now() - domain.createdAt.getTime();
    const domainAgeDays = Math.floor(domainAge / (1000 * 60 * 60 * 24));
    const isMature = domainAgeDays >= 30;

    checks.push({
      id: 'domain-maturity',
      name: 'Domain Maturity',
      description: 'Domain should be at least 30 days old for better deliverability',
      passed: isMature,
      severity: 'medium',
      details: `Domain is ${domainAgeDays} days old`,
      fix: isMature ? undefined : 'Consider using a more established domain',
    });

    // Check 8: Recent verification attempts
    const recentChecks = onboarding.checkAttempts || 0;
    const hasRecentChecks = recentChecks > 0;

    checks.push({
      id: 'verification-attempts',
      name: 'DNS Verification Performed',
      description: 'DNS verification should be performed recently',
      passed: hasRecentChecks,
      severity: 'medium',
      details: `${recentChecks} verification attempts`,
      fix: hasRecentChecks ? undefined : 'Run DNS verification',
    });

    // Generate warnings and recommendations
    if (!isMature) {
      warnings.push('Domain is less than 30 days old. Consider warming up gradually.');
    }

    if (!onboarding.trackingDomain) {
      recommendations.push('Configure tracking domain for better analytics.');
    }

    if (recentChecks > 5) {
      warnings.push('Multiple verification attempts detected. Ensure DNS is configured correctly.');
    }

    // Determine overall readiness
    const criticalChecks = checks.filter(c => c.severity === 'critical');
    const allCriticalPassed = criticalChecks.every(c => c.passed);

    const ready = allCriticalPassed && onboarding.status === DomainOnboardingStatus.PRODUCTION_READY;

    return {
      ready,
      approvedAt: onboarding.productionApprovedAt || new Date(),
      approvedBy: onboarding.productionApprovedBy || 'system',
      checks,
      warnings,
      recommendations,
    };
  }

  /**
   * Mark domain as production ready
   */
  async markProductionReady(
    domainId: string,
    approvedBy: string,
    notes?: string
  ): Promise<ProductionReadinessResult> {
    this.logger.log(`Marking domain as production ready: ${domainId} by ${approvedBy}`);

    // First check readiness
    const readiness = await this.checkProductionReadiness(domainId);

    if (!readiness.ready) {
      throw new Error('Domain is not ready for production. All critical checks must pass.');
    }

    const now = new Date();

    // Update domain status
    await this.prisma.domain.update({
      where: { id: domainId },
      data: {
        onboardingStatus: DomainOnboardingStatus.PRODUCTION_READY,
        updatedAt: now,
      },
    });

    // Update onboarding status
    await this.prisma.domainOnboarding.update({
      where: { domainId },
      data: {
        status: DomainOnboardingStatus.PRODUCTION_READY,
        readyForProduction: true,
        productionApprovedAt: now,
        productionApprovedBy: approvedBy,
        updatedAt: now,
      },
    });

    // Log the approval
    this.logger.log(`Domain ${domainId} approved for production by ${approvedBy}`);

    // TODO: Send notification email to domain owner
    // TODO: Update company metrics
    // TODO: Enable domain for sending

    return {
      ...readiness,
      approvedAt: now,
      approvedBy,
    };
  }

  /**
   * Revoke production approval
   */
  async revokeProductionApproval(domainId: string, revokedBy: string, reason: string): Promise<void> {
    this.logger.log(`Revoking production approval for domain: ${domainId} by ${revokedBy}`);

    const now = new Date();

    await this.prisma.domain.update({
      where: { id: domainId },
      data: {
        onboardingStatus: DomainOnboardingStatus.DNS_CONFIGURED,
        updatedAt: now,
      },
    });

    await this.prisma.domainOnboarding.update({
      where: { domainId },
      data: {
        status: DomainOnboardingStatus.DNS_CONFIGURED,
        readyForProduction: false,
        updatedAt: now,
      },
    });

    // TODO: Send notification about revocation
    // TODO: Pause sending for this domain
    // TODO: Log the revocation reason
  }

  /**
   * Get domains ready for production approval
   */
  async getDomainsReadyForApproval(): Promise<Array<{
    domainId: string;
    domain: string;
    readiness: ProductionReadinessResult;
  }>> {
    // Find domains that have completed onboarding but not yet approved
    const domains = await this.prisma.domain.findMany({
      where: {
        onboardingStatus: DomainOnboardingStatus.DNS_CONFIGURED,
        isActive: true,
      },
      select: {
        id: true,
        domain: true,
      },
    });

    const results = await Promise.all(
      domains.map(async (domain) => {
        const readiness = await this.checkProductionReadiness(domain.id);
        return {
          domainId: domain.id,
          domain: domain.domain,
          readiness,
        };
      })
    );

    return results.filter(result => result.readiness.ready);
  }
}
