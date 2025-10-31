import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaClient } from '@email-gateway/database';

// TODO: Import DNSVerifierService from API or create shared service
type DNSVerifierService = any;
type PrismaService = PrismaClient;

export interface DomainVerificationJob {
  domainId: string;
  forceCheck?: boolean; // Force check even if recently checked
  notifyOnFailure?: boolean; // Send notification if verification fails
}

@Injectable()
@Processor('dns-verification')
export class DNSVerificationWorker extends WorkerHost {
  private readonly logger = new Logger(DNSVerificationWorker.name);

  constructor(
    private readonly dnsVerifier: DNSVerifierService,
    private readonly prisma: PrismaService,
  ) {
    super();
  }

  async process(job: Job<DomainVerificationJob>): Promise<void> {
    const { domainId, forceCheck = false, notifyOnFailure = false } = job.data;

    this.logger.log(`Processing DNS verification job for domain: ${domainId}`);

    try {
      // Get domain info
      const domain = await this.prisma.domain.findUnique({
        where: { id: domainId },
        select: { domain: true },
      });

      if (!domain) {
        throw new Error(`Domain not found: ${domainId}`);
      }

      // Check if we should skip verification (recently checked)
      if (!forceCheck) {
        const onboarding = await this.prisma.domainOnboarding.findUnique({
          where: { domainId },
          select: { lastCheckAt: true, nextCheckAt: true },
        });

        if (onboarding?.lastCheckAt && onboarding.nextCheckAt) {
          const now = new Date();
          if (now < onboarding.nextCheckAt) {
            this.logger.log(`Skipping DNS verification for ${domain.domain} - next check at ${onboarding.nextCheckAt}`);
            return;
          }
        }
      }

      this.logger.log(`Starting DNS verification for domain: ${domain.domain}`);

      // Run verification
      const result = await this.dnsVerifier.verifyAllRecords(domainId);

      // Log results
      const passedChecks = result.checks.filter((check: any) => check.valid).length;
      const totalChecks = result.checks.length;

      this.logger.log(
        `DNS verification completed for ${domain.domain}: ${passedChecks}/${totalChecks} checks passed`
      );

      // If all passed and production ready, update domain status
      if (result.allPassed && result.productionReady) {
        await this.markDomainProductionReady(domainId, domain.domain);
      }

      // Handle failures
      if (!result.allPassed && notifyOnFailure) {
        await this.notifyVerificationFailure(domainId, domain.domain, result);
      }

      this.logger.log(`DNS verification job completed for domain: ${domainId}`);
    } catch (error) {
      this.logger.error(`DNS verification job failed for domain ${domainId}:`, error);

      // Update job progress and mark as failed
      await job.updateProgress(0);

      throw error;
    }
  }

  @OnWorkerEvent('completed')
  async onCompleted(job: Job<DomainVerificationJob>) {
    this.logger.log(`DNS verification job completed: ${job.id}`);
  }

  @OnWorkerEvent('failed')
  async onFailed(job: Job<DomainVerificationJob>, err: Error) {
    this.logger.error(`DNS verification job failed: ${job.id}`, err);
  }

  @OnWorkerEvent('active')
  async onActive(job: Job<DomainVerificationJob>) {
    this.logger.log(`DNS verification job started: ${job.id}`);
  }

  /**
   * Mark domain as production ready
   */
  private async markDomainProductionReady(domainId: string, domainName: string): Promise<void> {
    this.logger.log(`Marking domain as production ready: ${domainName}`);

    await this.prisma.domain.update({
      where: { id: domainId },
      data: {
        isProductionReady: true,
        updatedAt: new Date(),
      },
    });

    await this.prisma.domainOnboarding.update({
      where: { domainId },
      data: {
        readyForProduction: true,
        productionApprovedAt: new Date(),
        productionApprovedBy: 'automated-verification',
        updatedAt: new Date(),
      },
    });

    // TODO: Send notification to domain owner
    // TODO: Update company reputation metrics
  }

  /**
   * Notify about verification failure
   */
  private async notifyVerificationFailure(
    domainId: string,
    domainName: string,
    result: any
  ): Promise<void> {
    this.logger.warn(`DNS verification failed for domain: ${domainName}`);

    const failedChecks = result.checks.filter((check: any) => !check.valid);

    // TODO: Send email notification to domain owner
    // TODO: Create alert in monitoring system
    // TODO: Update domain status to reflect issues

    this.logger.warn(`Failed checks for ${domainName}:`, failedChecks);
  }
}
