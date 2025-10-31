/**
 * Domain Management Service
 * 
 * TASK 6.2 - SES Domain and DNS Management
 * 
 * Responsabilidades:
 * - Verificação de domínio no SES
 * - Geração de registros SPF/DKIM/DMARC
 * - Validação de DNS
 * - Monitoramento de quota SES
 * - Warm-up de volumetria
 * - Checklist sandbox→produção
 */

import { SESClient, VerifyDomainIdentityCommand, GetIdentityVerificationAttributesCommand, GetSendQuotaCommand } from '@aws-sdk/client-ses';
import { SESv2Client, CreateEmailIdentityCommand, GetEmailIdentityCommand } from '@aws-sdk/client-sesv2';
import * as dns from 'dns/promises';

// Domain verification result for SES operations
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

export class DomainManagementService {
  private sesClient: SESClient;
  private sesv2Client: SESv2Client;
  private region: string;

  constructor(region: string = 'us-east-1') {
    this.region = region;
    this.sesClient = new SESClient({ region });
    this.sesv2Client = new SESv2Client({ region });
  }

  /**
   * Verifica domínio no SES
   */
  async verifyDomain(domain: string): Promise<DomainVerificationResult> {
    try {
      const command = new VerifyDomainIdentityCommand({
        Domain: domain,
      });

      const result = await this.sesClient.send(command);
      
      return {
        domain,
        status: 'PENDING',
        verificationToken: result.VerificationToken,
      };
    } catch (error) {
      const errorCode = (error as any).Code || 'UNKNOWN_ERROR';
      const isRetryable = ['ThrottlingException', 'ServiceUnavailable'].includes(errorCode);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      return {
        domain,
        status: isRetryable ? 'TEMPORARY_FAILURE' : 'FAILED',
        errorMessage: `${errorCode}: ${errorMessage}`,
      };
    }
  }

  /**
   * Verifica status de verificação do domínio
   */
  async getDomainVerificationStatus(domain: string): Promise<DomainVerificationResult> {
    try {
      const command = new GetIdentityVerificationAttributesCommand({
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
    } catch (error) {
      const errorCode = (error as any).Code || 'UNKNOWN_ERROR';
      const isRetryable = ['ThrottlingException', 'ServiceUnavailable'].includes(errorCode);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      return {
        domain,
        status: isRetryable ? 'TEMPORARY_FAILURE' : 'FAILED',
        errorMessage: `${errorCode}: ${errorMessage}`,
      };
    }
  }

  /**
   * Habilita DKIM para o domínio
   */
  async enableDKIM(domain: string): Promise<DKIMVerificationResult> {
    try {
      const command = new CreateEmailIdentityCommand({
        EmailIdentity: domain,
        DkimSigningAttributes: {
          NextSigningKeyLength: 'RSA_2048_BIT',
        },
      });

      await this.sesv2Client.send(command);

      // Buscar tokens DKIM
      const getCommand = new GetEmailIdentityCommand({
        EmailIdentity: domain,
      });

      const identityResult = await this.sesv2Client.send(getCommand);
      const tokens = identityResult.DkimAttributes?.Tokens || [];

      const records = tokens.map((token: string) => ({
        name: `${token}._domainkey.${domain}`,
        value: `v=DKIM1; k=rsa; p=${token}`,
        type: 'TXT' as const,
      }));

      return {
        domain,
        status: 'PENDING',
        tokens,
        records,
      };
    } catch (error) {
      const errorCode = (error as any).Code || 'UNKNOWN_ERROR';
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

  /**
   * Valida registros DNS do domínio
   */
  async validateDNSRecords(domain: string, expectedRecords: {
    spf?: string;
    dkim?: Array<{ name: string; value: string }>;
    dmarc?: string;
  }): Promise<DNSValidationResult> {
    const result: DNSValidationResult = {
      domain,
      spfValid: false,
      dkimValid: false,
      dmarcValid: false,
      missingRecords: [],
      errors: [],
    };

    try {
      // Validar SPF
      if (expectedRecords.spf) {
        try {
          const spfRecords = await dns.resolveTxt(domain);
          const spfRecord = spfRecords.find(record => 
            record.some(txt => txt.includes('v=spf1'))
          );
          
          if (spfRecord) {
            result.spfValid = spfRecord.some(txt => txt.includes(expectedRecords.spf!));
          } else {
            result.missingRecords.push(`SPF record for ${domain}`);
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          result.errors.push(`SPF validation failed: ${errorMessage}`);
        }
      }

      // Validar DKIM
      if (expectedRecords.dkim) {
        for (const dkimRecord of expectedRecords.dkim) {
          try {
            const records = await dns.resolveTxt(dkimRecord.name);
            const found = records.some(record => 
              record.some(txt => txt.includes('v=DKIM1'))
            );
            
            if (!found) {
              result.missingRecords.push(`DKIM record: ${dkimRecord.name}`);
            }
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            result.errors.push(`DKIM validation failed for ${dkimRecord.name}: ${errorMessage}`);
          }
        }
        
        result.dkimValid = result.missingRecords.length === 0;
      }

      // Validar DMARC
      if (expectedRecords.dmarc) {
        try {
          const dmarcRecords = await dns.resolveTxt(`_dmarc.${domain}`);
          const dmarcRecord = dmarcRecords.find(record => 
            record.some(txt => txt.includes('v=DMARC1'))
          );
          
          if (dmarcRecord) {
            result.dmarcValid = dmarcRecord.some(txt => txt.includes(expectedRecords.dmarc!));
          } else {
            result.missingRecords.push(`DMARC record for _dmarc.${domain}`);
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          result.errors.push(`DMARC validation failed: ${errorMessage}`);
        }
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      result.errors.push(`DNS validation failed: ${errorMessage}`);
    }

    return result;
  }

  /**
   * Obtém informações de quota do SES
   */
  async getSESQuota(): Promise<SESQuotaInfo> {
    try {
      const command = new GetSendQuotaCommand({});
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
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to get SES quota: ${errorMessage}`);
    }
  }

  /**
   * Valida se a região SES é recomendada
   */
  async validateSESRegion(): Promise<{
    region: string;
    isRecommended: boolean;
    recommendations: string[];
  }> {
    const recommendedRegions = ['us-east-1', 'us-west-2', 'eu-west-1'];
    const isRecommended = recommendedRegions.includes(this.region);
    
    const recommendations: string[] = [];
    if (!isRecommended) {
      recommendations.push(`Consider using one of the recommended regions: ${recommendedRegions.join(', ')}`);
    }

    return {
      region: this.region,
      isRecommended,
      recommendations,
    };
  }

  /**
   * Configura warm-up para o domínio
   */
  async configureWarmup(_domain: string, config: WarmupConfig): Promise<void> {
    // TODO: Implementar configuração de warm-up no SES
    // Por enquanto, apenas valida a configuração
    if (config.dailyLimit <= 0) {
      throw new Error('Daily limit must be greater than 0');
    }

    if (config.maxDailyLimit < config.dailyLimit) {
      throw new Error('Max daily limit must be greater than or equal to daily limit');
    }
  }

  /**
   * Gera checklist para sandbox→produção
   */
  async getSandboxToProductionChecklist(domain: string): Promise<{
    domain: string;
    checklist: Array<{
      item: string;
      status: 'PENDING' | 'COMPLETED' | 'FAILED';
      description: string;
    }>;
  }> {
    const checklist = [
      {
        item: 'Domain Verification',
        status: 'PENDING' as const,
        description: 'Domain must be verified in SES',
      },
      {
        item: 'DKIM Configuration',
        status: 'PENDING' as const,
        description: 'DKIM must be enabled and DNS records configured',
      },
      {
        item: 'SPF Record',
        status: 'PENDING' as const,
        description: 'SPF record must be configured in DNS',
      },
      {
        item: 'DMARC Policy',
        status: 'PENDING' as const,
        description: 'DMARC policy must be configured',
      },
      {
        item: 'SES Quota Check',
        status: 'PENDING' as const,
        description: 'SES quota must be sufficient for production volume',
      },
      {
        item: 'Warm-up Configuration',
        status: 'PENDING' as const,
        description: 'Warm-up must be configured for gradual volume increase',
      },
    ];

    return {
      domain,
      checklist,
    };
  }
}
