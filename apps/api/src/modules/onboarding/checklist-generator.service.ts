import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { DomainOnboardingStatus } from '@email-gateway/database';

export interface OnboardingChecklist {
  domainId: string;
  items: ChecklistItem[];
  summary: {
    total: number;
    completed: number;
    pending: number;
    failed: number;
    inProgress: number;
  };
  overallProgress: number; // 0-100
}

export interface ChecklistItem {
  id: string;
  title: string;
  description: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  priority: 'low' | 'medium' | 'high' | 'critical';
  category: 'dns' | 'dkim' | 'spf' | 'dmarc' | 'verification' | 'approval';
  lastChecked?: Date;
  errorMessage?: string;
  instructions?: string[];
  autoCheckable: boolean;
  dependsOn?: string[]; // IDs of items this depends on
}

export interface OnboardingStatus {
  status: DomainOnboardingStatus;
  progress: {
    percentage: number;
    completed: number;
    total: number;
  };
  checklist: ChecklistItem[];
  lastChecked?: Date;
  nextCheck?: Date;
}

@Injectable()
export class ChecklistGeneratorService {
  private readonly logger = new Logger(ChecklistGeneratorService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Initialize onboarding process for a domain
   */
  async initializeOnboarding(domainId: string): Promise<{
    onboardingId: string;
    checklist: OnboardingChecklist;
  }> {
    this.logger.log(`Initializing onboarding for domain: ${domainId}`);

    // Check if onboarding already exists
    let onboarding = await this.prisma.domainOnboarding.findUnique({
      where: { domainId },
    });

    if (!onboarding) {
      // Create new onboarding record
      onboarding = await this.prisma.domainOnboarding.create({
        data: {
          domainId,
          status: DomainOnboardingStatus.DNS_PENDING,
        },
      });

      this.logger.log(`Created onboarding record: ${onboarding.id}`);
    }

    const checklist = await this.generateChecklist(domainId);

    return {
      onboardingId: onboarding.id,
      checklist,
    };
  }

  /**
   * Generate complete onboarding checklist
   */
  async generateChecklist(domainId: string): Promise<OnboardingChecklist> {
    const domain = await this.getDomainInfo(domainId);
    if (!domain) {
      throw new Error('Domain not found');
    }

    const onboarding = await this.prisma.domainOnboarding.findUnique({
      where: { domainId },
      select: {
        status: true,
        dkimGenerated: true,
        spfRecord: true,
        returnPath: true,
        trackingDomain: true,
        readyForProduction: true,
        lastCheckAt: true,
        checkAttempts: true,
      },
    });

    if (!onboarding) {
      throw new Error('Domain onboarding not found');
    }

    // Define all checklist items
    const items: ChecklistItem[] = [
      // DKIM Setup
      {
        id: 'dkim-generate',
        title: 'Generate DKIM Keys',
        description: 'Generate RSA 2048-bit key pair for DKIM signing',
        status: onboarding.dkimGenerated ? 'completed' : 'pending',
        priority: 'critical',
        category: 'dkim',
        autoCheckable: true,
        instructions: [
          'Click "Generate DKIM" button',
          'DKIM keys will be automatically generated',
          'Add the provided DNS record to your domain',
        ],
      },

      // DNS Records
      {
        id: 'dns-dkim',
        title: 'DKIM DNS Record',
        description: 'Add DKIM public key to DNS as TXT record',
        status: 'pending', // This needs DNS verification
        priority: 'critical',
        category: 'dns',
        autoCheckable: true,
        dependsOn: ['dkim-generate'],
        instructions: [
          'Go to your DNS provider (Route53, Cloudflare, etc.)',
          'Add a TXT record with the provided name and value',
          'Wait for DNS propagation (can take up to 24 hours)',
        ],
      },

      {
        id: 'dns-spf',
        title: 'SPF DNS Record',
        description: 'Configure SPF record to authorize email sending',
        status: onboarding.spfRecord ? 'completed' : 'pending',
        priority: 'high',
        category: 'dns',
        autoCheckable: true,
        instructions: [
          'Add TXT record: @ (or yourdomain.com)',
          'Value: v=spf1 include:_spf.certshift.com ~all',
          'This authorizes CertShift to send emails on your behalf',
        ],
      },

      {
        id: 'dns-return-path',
        title: 'Return-Path Domain',
        description: 'Configure dedicated domain for bounce handling',
        status: onboarding.returnPath ? 'completed' : 'pending',
        priority: 'medium',
        category: 'dns',
        autoCheckable: true,
        instructions: [
          'Create subdomain: bounce.yourdomain.com',
          'Point it to our bounce processing servers',
          'Contact support for the target IP addresses',
        ],
      },

      {
        id: 'dns-tracking',
        title: 'Tracking Domain',
        description: 'Configure domain for email tracking pixels and links',
        status: onboarding.trackingDomain ? 'completed' : 'pending',
        priority: 'medium',
        category: 'dns',
        autoCheckable: true,
        instructions: [
          'Create subdomain: track.yourdomain.com',
          'Point it to our tracking servers',
          'Contact support for the target IP addresses',
        ],
      },

      // Verification Steps
      {
        id: 'verify-dns',
        title: 'DNS Verification',
        description: 'Verify all DNS records are correctly configured',
        status: 'pending',
        priority: 'critical',
        category: 'verification',
        autoCheckable: true,
        dependsOn: ['dns-dkim', 'dns-spf', 'dns-return-path', 'dns-tracking'],
        instructions: [
          'Click "Verify DNS" to check all records',
          'Fix any failed records',
          'Re-run verification until all pass',
        ],
      },

      // Production Approval
      {
        id: 'production-approval',
        title: 'Production Approval',
        description: 'Domain approved for production email sending',
        status: onboarding.readyForProduction ? 'completed' : 'pending',
        priority: 'critical',
        category: 'approval',
        autoCheckable: true,
        dependsOn: ['verify-dns'],
        instructions: [
          'All DNS records must be verified',
          'Domain will be automatically approved once verification passes',
          'You will receive a confirmation email',
        ],
      },
    ];

    // Calculate status based on current state
    await this.updateChecklistStatus(items, domainId, onboarding);

    // Calculate summary
    const completed = items.filter(item => item.status === 'completed').length;
    const pending = items.filter(item => item.status === 'pending').length;
    const failed = items.filter(item => item.status === 'failed').length;
    const inProgress = items.filter(item => item.status === 'in_progress').length;

    const checklist: OnboardingChecklist = {
      domainId,
      items,
      summary: {
        total: items.length,
        completed,
        pending,
        failed,
        inProgress,
      },
      overallProgress: Math.round((completed / items.length) * 100),
    };

    return checklist;
  }

  /**
   * Get current onboarding status
   */
  async getOnboardingStatus(domainId: string): Promise<OnboardingStatus> {
    const checklist = await this.generateChecklist(domainId);

    const onboarding = await this.prisma.domainOnboarding.findUnique({
      where: { domainId },
      select: {
        status: true,
        lastCheckAt: true,
        nextCheckAt: true,
      },
    });

    if (!onboarding) {
      throw new Error('Domain onboarding not found');
    }

    return {
      status: onboarding.status,
      progress: {
        percentage: checklist.overallProgress,
        completed: checklist.summary.completed,
        total: checklist.summary.total,
      },
      checklist: checklist.items,
      lastChecked: onboarding.lastCheckAt || undefined,
      nextCheck: onboarding.nextCheckAt || undefined,
    };
  }

  /**
   * Get domain information
   */
  async getDomainInfo(domainId: string): Promise<{ id: string; domain: string } | null> {
    try {
      return await this.prisma.domain.findUnique({
        where: { id: domainId },
        select: { id: true, domain: true },
      });
    } catch (error) {
      this.logger.error(`Failed to get domain info for ${domainId}:`, error);
      return null;
    }
  }

  /**
   * Update checklist item status based on current domain state
   */
  private async updateChecklistStatus(
    items: ChecklistItem[],
    domainId: string,
    onboarding: any
  ): Promise<void> {
    // Check DNS records status
    const dnsRecords = await this.prisma.dNSRecord.findMany({
      where: { domainId },
      select: {
        recordType: true,
        name: true,
        isVerified: true,
        lastChecked: true,
      },
    });

    // Update DNS verification status
    for (const item of items) {
      switch (item.id) {
        case 'dns-dkim':
          const dkimRecord = dnsRecords.find((r: any) => r.name.includes('._domainkey.'));
          if (dkimRecord) {
            item.status = dkimRecord.isVerified ? 'completed' : 'failed';
            item.lastChecked = dkimRecord.lastChecked || undefined;
          }
          break;

        case 'dns-spf':
          const spfRecord = dnsRecords.find((r: any) => r.recordType === 'TXT' && !r.name.includes('._domainkey.'));
          if (spfRecord) {
            item.status = spfRecord.isVerified ? 'completed' : 'failed';
            item.lastChecked = spfRecord.lastChecked || undefined;
          }
          break;

        case 'verify-dns':
          const allVerified = dnsRecords.every((r: any) => r.isVerified);
          item.status = allVerified ? 'completed' : 'pending';
          break;
      }
    }
  }
}
