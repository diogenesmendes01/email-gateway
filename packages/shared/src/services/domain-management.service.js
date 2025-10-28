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
exports.DomainManagementService = void 0;
const client_ses_1 = require("@aws-sdk/client-ses");
const client_sesv2_1 = require("@aws-sdk/client-sesv2");
const dns = __importStar(require("dns/promises"));
class DomainManagementService {
    constructor(region = 'us-east-1') {
        this.region = region;
        this.sesClient = new client_ses_1.SESClient({ region });
        this.sesv2Client = new client_sesv2_1.SESv2Client({ region });
    }
    async verifyDomain(domain) {
        try {
            const command = new client_ses_1.VerifyDomainIdentityCommand({
                Domain: domain,
            });
            const result = await this.sesClient.send(command);
            return {
                domain,
                status: 'PENDING',
                verificationToken: result.VerificationToken,
            };
        }
        catch (error) {
            const errorCode = error.Code || 'UNKNOWN_ERROR';
            const isRetryable = ['ThrottlingException', 'ServiceUnavailable'].includes(errorCode);
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            return {
                domain,
                status: isRetryable ? 'TEMPORARY_FAILURE' : 'FAILED',
                errorMessage: `${errorCode}: ${errorMessage}`,
            };
        }
    }
    async getDomainVerificationStatus(domain) {
        try {
            const command = new client_ses_1.GetIdentityVerificationAttributesCommand({
                Identities: [domain],
            });
            const result = await this.sesClient.send(command);
            const attributes = result.VerificationAttributes?.[domain];
            if (!attributes) {
                return {
                    domain,
                    status: 'FAILED',
                    errorMessage: 'Domain not found in SES',
                };
            }
            const status = attributes.VerificationStatus === 'Success' ? 'VERIFIED' : 'PENDING';
            return {
                domain,
                status,
                verificationToken: attributes.VerificationToken,
            };
        }
        catch (error) {
            const errorCode = error.Code || 'UNKNOWN_ERROR';
            const isRetryable = ['ThrottlingException', 'ServiceUnavailable'].includes(errorCode);
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            return {
                domain,
                status: isRetryable ? 'TEMPORARY_FAILURE' : 'FAILED',
                errorMessage: `${errorCode}: ${errorMessage}`,
            };
        }
    }
    async enableDKIM(domain) {
        try {
            const command = new client_sesv2_1.CreateEmailIdentityCommand({
                EmailIdentity: domain,
                DkimSigningAttributes: {
                    NextSigningKeyLength: 'RSA_2048_BIT',
                },
            });
            await this.sesv2Client.send(command);
            const getCommand = new client_sesv2_1.GetEmailIdentityCommand({
                EmailIdentity: domain,
            });
            const identityResult = await this.sesv2Client.send(getCommand);
            const tokens = identityResult.DkimAttributes?.Tokens || [];
            const records = tokens.map((token) => ({
                name: `${token}._domainkey.${domain}`,
                value: `v=DKIM1; k=rsa; p=${token}`,
                type: 'TXT',
            }));
            return {
                domain,
                status: 'PENDING',
                tokens,
                records,
            };
        }
        catch (error) {
            const errorCode = error.Code || 'UNKNOWN_ERROR';
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            return {
                domain,
                status: 'FAILED',
                tokens: [],
                records: [],
                errorMessage: `${errorCode}: ${errorMessage}`,
            };
        }
    }
    async validateDNSRecords(domain, expectedRecords) {
        const result = {
            domain,
            spfValid: false,
            dkimValid: false,
            dmarcValid: false,
            missingRecords: [],
            errors: [],
        };
        try {
            if (expectedRecords.spf) {
                try {
                    const spfRecords = await dns.resolveTxt(domain);
                    const spfRecord = spfRecords.find(record => record.some(txt => txt.includes('v=spf1')));
                    if (spfRecord) {
                        result.spfValid = spfRecord.some(txt => txt.includes(expectedRecords.spf));
                    }
                    else {
                        result.missingRecords.push(`SPF record for ${domain}`);
                    }
                }
                catch (error) {
                    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                    result.errors.push(`SPF validation failed: ${errorMessage}`);
                }
            }
            if (expectedRecords.dkim) {
                for (const dkimRecord of expectedRecords.dkim) {
                    try {
                        const records = await dns.resolveTxt(dkimRecord.name);
                        const found = records.some(record => record.some(txt => txt.includes('v=DKIM1')));
                        if (!found) {
                            result.missingRecords.push(`DKIM record: ${dkimRecord.name}`);
                        }
                    }
                    catch (error) {
                        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                        result.errors.push(`DKIM validation failed for ${dkimRecord.name}: ${errorMessage}`);
                    }
                }
                result.dkimValid = result.missingRecords.length === 0;
            }
            if (expectedRecords.dmarc) {
                try {
                    const dmarcRecords = await dns.resolveTxt(`_dmarc.${domain}`);
                    const dmarcRecord = dmarcRecords.find(record => record.some(txt => txt.includes('v=DMARC1')));
                    if (dmarcRecord) {
                        result.dmarcValid = dmarcRecord.some(txt => txt.includes(expectedRecords.dmarc));
                    }
                    else {
                        result.missingRecords.push(`DMARC record for _dmarc.${domain}`);
                    }
                }
                catch (error) {
                    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                    result.errors.push(`DMARC validation failed: ${errorMessage}`);
                }
            }
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            result.errors.push(`DNS validation failed: ${errorMessage}`);
        }
        return result;
    }
    async getSESQuota() {
        try {
            const command = new client_ses_1.GetSendQuotaCommand({});
            const result = await this.sesClient.send(command);
            const max24HourSend = result.Max24HourSend || 0;
            const maxSendRate = result.MaxSendRate || 0;
            const sentLast24Hours = result.SentLast24Hours || 0;
            const remainingQuota = max24HourSend - sentLast24Hours;
            const quotaPercentage = max24HourSend > 0 ? (sentLast24Hours / max24HourSend) * 100 : 0;
            return {
                max24HourSend,
                maxSendRate,
                sentLast24Hours,
                remainingQuota,
                quotaPercentage,
            };
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            throw new Error(`Failed to get SES quota: ${errorMessage}`);
        }
    }
    async validateSESRegion() {
        const recommendedRegions = ['us-east-1', 'us-west-2', 'eu-west-1'];
        const isRecommended = recommendedRegions.includes(this.region);
        const recommendations = [];
        if (!isRecommended) {
            recommendations.push(`Consider using one of the recommended regions: ${recommendedRegions.join(', ')}`);
        }
        return {
            region: this.region,
            isRecommended,
            recommendations,
        };
    }
    async configureWarmup(_domain, config) {
        if (config.dailyLimit <= 0) {
            throw new Error('Daily limit must be greater than 0');
        }
        if (config.maxDailyLimit < config.dailyLimit) {
            throw new Error('Max daily limit must be greater than or equal to daily limit');
        }
    }
    async getSandboxToProductionChecklist(domain) {
        const checklist = [
            {
                item: 'Domain Verification',
                status: 'PENDING',
                description: 'Domain must be verified in SES',
            },
            {
                item: 'DKIM Configuration',
                status: 'PENDING',
                description: 'DKIM must be enabled and DNS records configured',
            },
            {
                item: 'SPF Record',
                status: 'PENDING',
                description: 'SPF record must be configured in DNS',
            },
            {
                item: 'DMARC Policy',
                status: 'PENDING',
                description: 'DMARC policy must be configured',
            },
            {
                item: 'SES Quota Check',
                status: 'PENDING',
                description: 'SES quota must be sufficient for production volume',
            },
            {
                item: 'Warm-up Configuration',
                status: 'PENDING',
                description: 'Warm-up must be configured for gradual volume increase',
            },
        ];
        return {
            domain,
            checklist,
        };
    }
}
exports.DomainManagementService = DomainManagementService;
//# sourceMappingURL=domain-management.service.js.map