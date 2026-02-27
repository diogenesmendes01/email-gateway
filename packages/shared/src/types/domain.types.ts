/**
 * Domain Management Types
 *
 * Types para gerenciamento de domínios e DNS (SPF/DKIM)
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

export interface WarmupConfigRequest {
  dailyLimit: number;
  weeklyIncrease: number;
  maxDailyLimit: number;
  isActive: boolean;
}
