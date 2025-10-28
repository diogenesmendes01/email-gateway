export interface DomainVerificationResult {
    domain: string;
    status: 'PENDING' | 'VERIFIED' | 'FAILED' | 'TEMPORARY_FAILURE';
    errorMessage?: string;
    verificationToken?: string;
}
export interface DKIMVerificationResult {
    domain: string;
    status: 'PENDING' | 'VERIFIED' | 'FAILED';
    tokens: string[];
    records: Array<{
        name: string;
        value: string;
        type: 'TXT';
    }>;
    errorMessage?: string;
}
export interface DNSValidationResult {
    domain: string;
    spfValid: boolean;
    dkimValid: boolean;
    dmarcValid: boolean;
    missingRecords: string[];
    errors: string[];
}
export interface SESQuotaInfo {
    max24HourSend: number;
    maxSendRate: number;
    sentLast24Hours: number;
    remainingQuota: number;
    quotaPercentage: number;
}
export interface WarmupConfig {
    dailyLimit: number;
    weeklyIncrease: number;
    maxDailyLimit: number;
    isActive: boolean;
}
export declare class DomainManagementService {
    private sesClient;
    private sesv2Client;
    private region;
    constructor(region?: string);
    verifyDomain(domain: string): Promise<DomainVerificationResult>;
    getDomainVerificationStatus(domain: string): Promise<DomainVerificationResult>;
    enableDKIM(domain: string): Promise<DKIMVerificationResult>;
    validateDNSRecords(domain: string, expectedRecords: {
        spf?: string;
        dkim?: Array<{
            name: string;
            value: string;
        }>;
        dmarc?: string;
    }): Promise<DNSValidationResult>;
    getSESQuota(): Promise<SESQuotaInfo>;
    validateSESRegion(): Promise<{
        region: string;
        isRecommended: boolean;
        recommendations: string[];
    }>;
    configureWarmup(_domain: string, config: WarmupConfig): Promise<void>;
    getSandboxToProductionChecklist(domain: string): Promise<{
        domain: string;
        checklist: Array<{
            item: string;
            status: 'PENDING' | 'COMPLETED' | 'FAILED';
            description: string;
        }>;
    }>;
}
