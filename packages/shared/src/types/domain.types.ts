/**
 * Domain Management Types
 * 
 * TASK 6.2 - SES Domain and DNS Management
 */

export interface DomainCreateRequest {
  domain: string;
}

export interface DomainResponse {
  id: string;
  companyId: string;
  domain: string;
  status: 'PENDING' | 'VERIFIED' | 'FAILED' | 'TEMPORARY_FAILURE';
  dkimStatus: 'PENDING' | 'VERIFIED' | 'FAILED';
  dkimTokens: string[];
  spfRecord?: string;
  dkimRecords?: Array<{
    name: string;
    value: string;
    type: 'TXT';
  }>;
  dmarcRecord?: string;
  lastChecked?: Date;
  lastVerified?: Date;
  errorMessage?: string;
  warmupConfig?: {
    dailyLimit: number;
    weeklyIncrease: number;
    maxDailyLimit: number;
    isActive: boolean;
  };
  isProductionReady: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface DomainListResponse {
  domains: DomainResponse[];
  total: number;
}

export interface DomainStatusResponse {
  domain: string;
  status: 'PENDING' | 'VERIFIED' | 'FAILED' | 'TEMPORARY_FAILURE';
  dkimStatus: 'PENDING' | 'VERIFIED' | 'FAILED';
  lastChecked?: Date;
  lastVerified?: Date;
  errorMessage?: string;
}

export interface DNSRecordsResponse {
  domain: string;
  spfRecord?: string;
  dkimRecords: Array<{
    name: string;
    value: string;
    type: 'TXT';
  }>;
  dmarcRecord?: string;
}

export interface DNSValidationResponse {
  domain: string;
  spfValid: boolean;
  dkimValid: boolean;
  dmarcValid: boolean;
  missingRecords: string[];
  errors: string[];
}

export interface SESQuotaResponse {
  max24HourSend: number;
  maxSendRate: number;
  sentLast24Hours: number;
  remainingQuota: number;
  quotaPercentage: number;
}

export interface WarmupConfigRequest {
  dailyLimit: number;
  weeklyIncrease: number;
  maxDailyLimit: number;
  isActive: boolean;
}

export interface SandboxChecklistResponse {
  domain: string;
  checklist: Array<{
    item: string;
    status: 'PENDING' | 'COMPLETED' | 'FAILED';
    description: string;
  }>;
}

export interface RegionValidationResponse {
  region: string;
  isRecommended: boolean;
  recommendations: string[];
}
