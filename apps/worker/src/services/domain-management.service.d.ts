export declare enum DomainVerificationStatus {
    PENDING = "PendingVerification",
    SUCCESS = "Success",
    FAILED = "Failed",
    TEMPORARY_FAILURE = "TemporaryFailure"
}
export declare enum DKIMVerificationStatus {
    NOT_STARTED = "NotStarted",
    PENDING = "Pending",
    SUCCESS = "Success",
    FAILED = "Failed"
}
export interface DomainVerificationInfo {
    domain: string;
    status: DomainVerificationStatus;
    verificationToken?: string;
    dnsRecords: DNSRecord[];
    dkimTokens?: string[];
    dkimStatus?: DKIMVerificationStatus;
    lastChecked?: Date;
    errorMessage?: string;
}
export interface DNSRecord {
    type: 'TXT' | 'CNAME' | 'MX';
    name: string;
    value: string;
    ttl?: number;
}
export interface WarmupConfig {
    domain: string;
    dailyVolume: number;
    startDate: Date;
    durationDays: number;
    incrementPercentage: number;
}
export interface SESQuotaStatus {
    max24HourSend: number;
    maxSendRate: number;
    sentLast24Hours: number;
    percentageUsed: number;
    isNearLimit: boolean;
    region: string;
}
export declare class DomainManagementService {
    private sesClient;
    private sesv2Client;
    private region;
    private readonly DNS_QUERY_TIMEOUT_MS;
    private readonly DNS_RETRY_MAX_ATTEMPTS;
    private readonly DNS_RETRY_BACKOFF_BASE;
    constructor(region: string);
    verifyDomainStatus(domain: string): Promise<DomainVerificationInfo>;
    startDomainVerification(domain: string): Promise<DomainVerificationInfo>;
    getDKIMTokens(domain: string): Promise<{
        tokens: string[];
        status: DKIMVerificationStatus;
    }>;
    enableDKIM(domain: string): Promise<string[]>;
    generateDNSRecords(domain: string): Promise<DNSRecord[]>;
    validateDNSRecords(domain: string): Promise<{
        isValid: boolean;
        missingRecords: DNSRecord[];
        incorrectRecords: DNSRecord[];
    }>;
    getSESQuotaStatus(): Promise<SESQuotaStatus>;
    configureDomainWarmup(config: WarmupConfig): Promise<void>;
    generateSandboxToProductionChecklist(): Promise<{
        items: Array<{
            id: string;
            description: string;
            status: 'pending' | 'completed' | 'failed';
            priority: 'high' | 'medium' | 'low';
        }>;
    }>;
    validateSESRegion(region: string): Promise<{
        isValid: boolean;
        isRecommended: boolean;
        quotaInfo?: SESQuotaStatus;
    }>;
    private checkDNSRecord;
    private checkTxtRecord;
    private checkCnameRecord;
    private checkMxRecord;
    private queryTxtRecords;
    private queryWithTimeout;
    private retryDNSQuery;
    private normalizeDomain;
    private normalizeTxtValue;
    private isNodeDNSError;
    private isDNSNotFoundError;
}
