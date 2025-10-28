"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.DomainManagementService = exports.DKIMVerificationStatus = exports.DomainVerificationStatus = void 0;
const client_ses_1 = require("@aws-sdk/client-ses");
const client_sesv2_1 = require("@aws-sdk/client-sesv2");
const dns_1 = require("dns");
var DomainVerificationStatus;
(function (DomainVerificationStatus) {
    DomainVerificationStatus["PENDING"] = "PendingVerification";
    DomainVerificationStatus["SUCCESS"] = "Success";
    DomainVerificationStatus["FAILED"] = "Failed";
    DomainVerificationStatus["TEMPORARY_FAILURE"] = "TemporaryFailure";
})(DomainVerificationStatus || (exports.DomainVerificationStatus = DomainVerificationStatus = {}));
var DKIMVerificationStatus;
(function (DKIMVerificationStatus) {
    DKIMVerificationStatus["NOT_STARTED"] = "NotStarted";
    DKIMVerificationStatus["PENDING"] = "Pending";
    DKIMVerificationStatus["SUCCESS"] = "Success";
    DKIMVerificationStatus["FAILED"] = "Failed";
})(DKIMVerificationStatus || (exports.DKIMVerificationStatus = DKIMVerificationStatus = {}));
class DomainManagementService {
    constructor(region) {
        this.DNS_QUERY_TIMEOUT_MS = 5000;
        this.DNS_RETRY_MAX_ATTEMPTS = 2;
        this.DNS_RETRY_BACKOFF_BASE = 2;
        this.region = region;
        this.sesClient = new client_ses_1.SESClient({ region });
        this.sesv2Client = new client_sesv2_1.SESv2Client({ region });
    }
    async verifyDomainStatus(domain) {
        try {
            const { GetIdentityVerificationAttributesCommand } = await Promise.resolve().then(() => __importStar(require('@aws-sdk/client-ses')));
            const command = new GetIdentityVerificationAttributesCommand({
                Identities: [domain],
            });
            const response = await this.sesClient.send(command);
            const attributes = response.VerificationAttributes?.[domain];
            if (!attributes) {
                throw new Error(`Domain ${domain} not found in SES`);
            }
            const dnsRecords = [];
            if (attributes.VerificationToken) {
                dnsRecords.push({
                    type: 'TXT',
                    name: `_amazonses.${domain}`,
                    value: attributes.VerificationToken,
                    ttl: 300,
                });
            }
            let dkimTokens = [];
            let dkimStatus = DKIMVerificationStatus.NOT_STARTED;
            try {
                const dkimInfo = await this.getDKIMTokens(domain);
                dkimTokens = dkimInfo.tokens;
                dkimStatus = dkimInfo.status;
            }
            catch (error) {
                console.warn(`Failed to get DKIM info for ${domain}:`, error);
            }
            return {
                domain,
                status: attributes.VerificationStatus,
                verificationToken: attributes.VerificationToken,
                dnsRecords,
                dkimTokens,
                dkimStatus,
                lastChecked: new Date(),
            };
        }
        catch (error) {
            console.error(`Failed to verify domain status for ${domain}:`, error);
            return {
                domain,
                status: DomainVerificationStatus.FAILED,
                errorMessage: error instanceof Error ? error.message : 'Unknown error',
                dnsRecords: [],
                lastChecked: new Date(),
            };
        }
    }
    async startDomainVerification(domain) {
        try {
            const { VerifyDomainIdentityCommand } = await Promise.resolve().then(() => __importStar(require('@aws-sdk/client-ses')));
            const command = new VerifyDomainIdentityCommand({
                Domain: domain,
            });
            const response = await this.sesClient.send(command);
            await new Promise(resolve => setTimeout(resolve, 2000));
            return await this.verifyDomainStatus(domain);
        }
        catch (error) {
            console.error(`Failed to start domain verification for ${domain}:`, error);
            throw error;
        }
    }
    async getDKIMTokens(domain) {
        try {
            const { GetIdentityDkimAttributesCommand } = await Promise.resolve().then(() => __importStar(require('@aws-sdk/client-ses')));
            const command = new GetIdentityDkimAttributesCommand({
                Identities: [domain],
            });
            const response = await this.sesClient.send(command);
            const attributes = response.DkimAttributes?.[domain];
            if (!attributes) {
                throw new Error(`DKIM attributes not found for domain ${domain}`);
            }
            return {
                tokens: attributes.DkimTokens || [],
                status: attributes.DkimVerificationStatus,
            };
        }
        catch (error) {
            console.error(`Failed to get DKIM tokens for ${domain}:`, error);
            throw error;
        }
    }
    async enableDKIM(domain) {
        try {
            const { CreateEmailIdentityCommand, GetEmailIdentityCommand } = await Promise.resolve().then(() => __importStar(require('@aws-sdk/client-sesv2')));
            const createCommand = new CreateEmailIdentityCommand({
                EmailIdentity: domain,
                DkimSigningAttributes: {
                    NextSigningKeyLength: 'RSA_2048_BIT',
                },
            });
            await this.sesv2Client.send(createCommand);
            const getCommand = new GetEmailIdentityCommand({
                EmailIdentity: domain,
            });
            const response = await this.sesv2Client.send(getCommand);
            return response.DkimAttributes?.Tokens || [];
        }
        catch (error) {
            console.error(`Failed to enable DKIM for ${domain}:`, error);
            throw error;
        }
    }
    async generateDNSRecords(domain) {
        const records = [];
        const verificationInfo = await this.verifyDomainStatus(domain);
        if (verificationInfo.verificationToken) {
            records.push({
                type: 'TXT',
                name: `_amazonses.${domain}`,
                value: verificationInfo.verificationToken,
                ttl: 300,
            });
        }
        records.push({
            type: 'TXT',
            name: domain,
            value: 'v=spf1 include:amazonses.com ~all',
            ttl: 300,
        });
        if (verificationInfo.dkimTokens && verificationInfo.dkimTokens.length > 0) {
            for (const token of verificationInfo.dkimTokens) {
                records.push({
                    type: 'CNAME',
                    name: `${token}._domainkey.${domain}`,
                    value: `${token}.dkim.amazonses.com`,
                    ttl: 300,
                });
            }
        }
        records.push({
            type: 'TXT',
            name: `_dmarc.${domain}`,
            value: 'v=DMARC1; p=quarantine; rua=mailto:dmarc@' + domain,
            ttl: 300,
        });
        return records;
    }
    async validateDNSRecords(domain) {
        const requiredRecords = await this.generateDNSRecords(domain);
        const missingRecords = [];
        const incorrectRecords = [];
        for (const record of requiredRecords) {
            try {
                const exists = await this.checkDNSRecord(record);
                if (!exists) {
                    missingRecords.push(record);
                }
            }
            catch (error) {
                missingRecords.push(record);
            }
        }
        return {
            isValid: missingRecords.length === 0 && incorrectRecords.length === 0,
            missingRecords,
            incorrectRecords,
        };
    }
    async getSESQuotaStatus() {
        try {
            const { GetSendQuotaCommand } = await Promise.resolve().then(() => __importStar(require('@aws-sdk/client-ses')));
            const command = new GetSendQuotaCommand({});
            const response = await this.sesClient.send(command);
            const max24HourSend = response.Max24HourSend || 0;
            const sentLast24Hours = response.SentLast24Hours || 0;
            const percentageUsed = max24HourSend > 0 ? (sentLast24Hours / max24HourSend) * 100 : 0;
            return {
                max24HourSend,
                maxSendRate: response.MaxSendRate || 0,
                sentLast24Hours,
                percentageUsed,
                isNearLimit: percentageUsed > 80,
                region: this.region,
            };
        }
        catch (error) {
            console.error('Failed to get SES quota status:', error);
            throw error;
        }
    }
    async configureDomainWarmup(config) {
        try {
            const { CreateConfigurationSetCommand } = await Promise.resolve().then(() => __importStar(require('@aws-sdk/client-sesv2')));
            const command = new CreateConfigurationSetCommand({
                ConfigurationSetName: `warmup-${config.domain}`,
                DeliveryOptions: {
                    TlsPolicy: 'REQUIRE',
                },
                ReputationOptions: {
                    ReputationMetricsEnabled: true,
                },
                SendingOptions: {
                    SendingEnabled: true,
                },
            });
            await this.sesv2Client.send(command);
            console.log(`Warm-up configured for domain ${config.domain}`);
        }
        catch (error) {
            console.error(`Failed to configure warm-up for ${config.domain}:`, error);
            throw error;
        }
    }
    async generateSandboxToProductionChecklist() {
        const checklist = [
            {
                id: 'domain-verification',
                description: 'Verificar se todos os domínios estão verificados',
                status: 'pending',
                priority: 'high',
            },
            {
                id: 'dns-records',
                description: 'Configurar registros DNS (SPF, DKIM, DMARC)',
                status: 'pending',
                priority: 'high',
            },
            {
                id: 'quota-increase',
                description: 'Solicitar aumento de quota SES se necessário',
                status: 'pending',
                priority: 'high',
            },
            {
                id: 'reputation-check',
                description: 'Verificar reputação dos domínios',
                status: 'pending',
                priority: 'medium',
            },
            {
                id: 'configuration-set',
                description: 'Configurar Configuration Set para monitoramento',
                status: 'pending',
                priority: 'medium',
            },
            {
                id: 'bounce-handling',
                description: 'Configurar tratamento de bounces e complaints',
                status: 'pending',
                priority: 'medium',
            },
            {
                id: 'warm-up-plan',
                description: 'Implementar plano de warm-up gradual',
                status: 'pending',
                priority: 'low',
            },
        ];
        return { items: checklist };
    }
    async validateSESRegion(region) {
        const recommendedRegions = [
            'us-east-1',
            'us-west-2',
            'eu-west-1',
        ];
        try {
            const quotaStatus = await this.getSESQuotaStatus();
            return {
                isValid: true,
                isRecommended: recommendedRegions.includes(region),
                quotaInfo: quotaStatus,
            };
        }
        catch (error) {
            return {
                isValid: false,
                isRecommended: false,
            };
        }
    }
    async checkDNSRecord(record) {
        try {
            switch (record.type) {
                case 'TXT':
                    return await this.checkTxtRecord(record.name, record.value);
                case 'CNAME':
                    return await this.checkCnameRecord(record.name, record.value);
                case 'MX':
                    return await this.checkMxRecord(record.name, record.value);
                default:
                    return false;
            }
        }
        catch (error) {
            if (this.isNodeDNSError(error)) {
                return false;
            }
            throw error;
        }
    }
    async checkTxtRecord(name, expectedValue) {
        return this.retryDNSQuery(async () => {
            const records = await this.queryTxtRecords(name);
            const normalizedExpected = this.normalizeTxtValue(expectedValue);
            return records.some(record => {
                const normalizedRecord = this.normalizeTxtValue(record);
                return normalizedRecord.includes(normalizedExpected);
            });
        });
    }
    async checkCnameRecord(name, expectedValue) {
        return this.retryDNSQuery(async () => {
            const records = await this.queryWithTimeout(dns_1.promises.resolveCname(name), this.DNS_QUERY_TIMEOUT_MS, 'CNAME query timeout');
            const normalizedExpected = this.normalizeDomain(expectedValue);
            return records.some(record => {
                const normalizedRecord = this.normalizeDomain(record);
                return normalizedRecord === normalizedExpected;
            });
        });
    }
    async checkMxRecord(name, expectedValue) {
        return this.retryDNSQuery(async () => {
            const records = await this.queryWithTimeout(dns_1.promises.resolveMx(name), this.DNS_QUERY_TIMEOUT_MS, 'MX query timeout');
            const normalizedExpected = this.normalizeDomain(expectedValue);
            return records.some(record => {
                const normalizedRecord = this.normalizeDomain(record.exchange);
                return normalizedRecord === normalizedExpected;
            });
        });
    }
    async queryTxtRecords(domain) {
        try {
            const records = await this.queryWithTimeout(dns_1.promises.resolveTxt(domain), this.DNS_QUERY_TIMEOUT_MS, 'TXT query timeout');
            return records.map(record => record.join(''));
        }
        catch (error) {
            if (this.isDNSNotFoundError(error)) {
                return [];
            }
            throw error;
        }
    }
    async queryWithTimeout(queryPromise, timeoutMs, errorMessage = 'DNS query timeout') {
        let timeoutId;
        const timeoutPromise = new Promise((_, reject) => {
            timeoutId = setTimeout(() => reject(new Error(errorMessage)), timeoutMs);
        });
        try {
            const result = await Promise.race([queryPromise, timeoutPromise]);
            clearTimeout(timeoutId);
            return result;
        }
        catch (error) {
            clearTimeout(timeoutId);
            throw error;
        }
    }
    async retryDNSQuery(queryFn) {
        let lastError;
        for (let attempt = 0; attempt <= this.DNS_RETRY_MAX_ATTEMPTS; attempt++) {
            try {
                return await queryFn();
            }
            catch (error) {
                lastError = error instanceof Error ? error : new Error('Unknown error');
                if (this.isDNSNotFoundError(error)) {
                    throw error;
                }
                if (attempt < this.DNS_RETRY_MAX_ATTEMPTS) {
                    const delayMs = Math.pow(this.DNS_RETRY_BACKOFF_BASE, attempt) * 1000;
                    await new Promise(resolve => setTimeout(resolve, delayMs));
                }
            }
        }
        throw lastError;
    }
    normalizeDomain(domain) {
        return domain
            .toLowerCase()
            .trim()
            .replace(/\.+$/, '')
            .replace(/\s+/g, '');
    }
    normalizeTxtValue(value) {
        return value
            .replace(/["'\s]+/g, '')
            .toLowerCase()
            .trim();
    }
    isNodeDNSError(error) {
        return (error instanceof Error &&
            'code' in error &&
            typeof error.code === 'string');
    }
    isDNSNotFoundError(error) {
        return (this.isNodeDNSError(error) &&
            (error.code === 'ENOTFOUND' || error.code === 'ENODATA'));
    }
}
exports.DomainManagementService = DomainManagementService;
//# sourceMappingURL=domain-management.service.js.map