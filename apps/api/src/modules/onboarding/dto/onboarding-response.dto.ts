import { DomainOnboardingStatus } from '@certshift/database';

export class OnboardingStatusResponseDto {
  domainId: string;
  status: DomainOnboardingStatus;
  progress: {
    percentage: number;
    completed: number;
    total: number;
  };
  checklist: ChecklistItemDto[];
  lastChecked?: Date;
  nextCheck?: Date;
}

export class ChecklistItemDto {
  id: string;
  title: string;
  description: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  priority: 'low' | 'medium' | 'high' | 'critical';
  category: 'dns' | 'dkim' | 'spf' | 'dmarc' | 'verification' | 'approval';
  lastChecked?: Date;
  errorMessage?: string;
  instructions?: string[];
}

export class DKIMGenerationResponseDto {
  status: 'success' | 'error';
  domainId: string;
  selector: string;
  dnsRecord: {
    type: string;
    name: string;
    value: string;
    ttl: number;
  };
  instructions: {
    title: string;
    description: string;
    steps: string[];
  };
}

export class DNSVerificationResponseDto {
  domainId: string;
  success: boolean;
  domain: string;
  checks: DNSCheckResultDto[];
  productionReady: boolean;
  timestamp: string;
}

export class DNSCheckResultDto {
  type: 'DKIM' | 'SPF' | 'DMARC' | 'ReturnPath' | 'Tracking';
  record: string;
  expected: string;
  found?: string;
  valid: boolean;
  error?: string;
}

export class ApproveProductionDto {
  approvedBy: string;
  notes?: string;
}

export class ProductionApprovalResponseDto {
  domainId: string;
  status: 'production_ready';
  approvedAt: Date;
  approvedBy: string;
  message: string;
}
