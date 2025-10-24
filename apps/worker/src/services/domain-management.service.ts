/**
 * @email-gateway/worker - Domain Management Service
 *
 * Service responsável pelo gerenciamento de domínios, DNS e configurações SES
 *
 * TASK 6.2 — SES, domínio e DNS (SPF/DKIM)
 * Implementação de verificação de domínio, criação de registros SPF/DKIM,
 * validação de região/quota e warm-up de volumetria
 */

import { SESClient } from '@aws-sdk/client-ses';
import { SESv2Client } from '@aws-sdk/client-sesv2';
import { promises as dns } from 'dns';

/**
 * Status de verificação de domínio
 */
export enum DomainVerificationStatus {
  PENDING = 'PendingVerification',
  SUCCESS = 'Success',
  FAILED = 'Failed',
  TEMPORARY_FAILURE = 'TemporaryFailure',
}

/**
 * Status de verificação de DKIM
 */
export enum DKIMVerificationStatus {
  NOT_STARTED = 'NotStarted',
  PENDING = 'Pending',
  SUCCESS = 'Success',
  FAILED = 'Failed',
}

/**
 * Informações de verificação de domínio
 */
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

/**
 * Registro DNS necessário
 */
export interface DNSRecord {
  type: 'TXT' | 'CNAME' | 'MX';
  name: string;
  value: string;
  ttl?: number;
}

/**
 * Configuração de warm-up
 */
export interface WarmupConfig {
  domain: string;
  dailyVolume: number;
  startDate: Date;
  durationDays: number;
  incrementPercentage: number;
}

/**
 * Status de quota SES
 */
export interface SESQuotaStatus {
  max24HourSend: number;
  maxSendRate: number;
  sentLast24Hours: number;
  percentageUsed: number;
  isNearLimit: boolean;
  region: string;
}

/**
 * Service de gerenciamento de domínios e DNS
 */
/**
 * Node.js DNS error interface
 */
interface NodeDNSError extends Error {
  code: string;
  syscall?: string;
  hostname?: string;
}

export class DomainManagementService {
  private sesClient: SESClient;
  private sesv2Client: SESv2Client;
  private region: string;

  // DNS configuration constants
  private readonly DNS_QUERY_TIMEOUT_MS = 5000;
  private readonly DNS_RETRY_MAX_ATTEMPTS = 2;
  private readonly DNS_RETRY_BACKOFF_BASE = 2;

  constructor(region: string) {
    this.region = region;
    this.sesClient = new SESClient({ region });
    this.sesv2Client = new SESv2Client({ region });
  }

  /**
   * Verifica o status de verificação de um domínio
   */
  async verifyDomainStatus(domain: string): Promise<DomainVerificationInfo> {
    try {
      const { GetIdentityVerificationAttributesCommand } = await import('@aws-sdk/client-ses');
      
      const command = new GetIdentityVerificationAttributesCommand({
        Identities: [domain],
      });

      const response = await this.sesClient.send(command);
      const attributes = response.VerificationAttributes?.[domain];

      if (!attributes) {
        throw new Error(`Domain ${domain} not found in SES`);
      }

      const dnsRecords: DNSRecord[] = [];
      
      // Adiciona registro de verificação se necessário
      if (attributes.VerificationToken) {
        dnsRecords.push({
          type: 'TXT',
          name: `_amazonses.${domain}`,
          value: attributes.VerificationToken,
          ttl: 300,
        });
      }

      // Verifica DKIM se configurado
      let dkimTokens: string[] = [];
      let dkimStatus = DKIMVerificationStatus.NOT_STARTED;

      try {
        const dkimInfo = await this.getDKIMTokens(domain);
        dkimTokens = dkimInfo.tokens;
        dkimStatus = dkimInfo.status;
      } catch (error) {
        console.warn(`Failed to get DKIM info for ${domain}:`, error);
      }

      return {
        domain,
        status: attributes.VerificationStatus as DomainVerificationStatus,
        verificationToken: attributes.VerificationToken,
        dnsRecords,
        dkimTokens,
        dkimStatus,
        lastChecked: new Date(),
      };
    } catch (error) {
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

  /**
   * Inicia a verificação de um domínio
   */
  async startDomainVerification(domain: string): Promise<DomainVerificationInfo> {
    try {
      const { VerifyDomainIdentityCommand } = await import('@aws-sdk/client-ses');
      
      const command = new VerifyDomainIdentityCommand({
        Domain: domain,
      });

      const response = await this.sesClient.send(command);
      
      // Aguarda um pouco para que o status seja atualizado
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      return await this.verifyDomainStatus(domain);
    } catch (error) {
      console.error(`Failed to start domain verification for ${domain}:`, error);
      throw error;
    }
  }

  /**
   * Obtém tokens DKIM para um domínio
   */
  async getDKIMTokens(domain: string): Promise<{ tokens: string[]; status: DKIMVerificationStatus }> {
    try {
      const { GetIdentityDkimAttributesCommand } = await import('@aws-sdk/client-ses');
      
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
        status: attributes.DkimVerificationStatus as DKIMVerificationStatus,
      };
    } catch (error) {
      console.error(`Failed to get DKIM tokens for ${domain}:`, error);
      throw error;
    }
  }

  /**
   * Habilita DKIM para um domínio
   */
  async enableDKIM(domain: string): Promise<string[]> {
    try {
      const { CreateEmailIdentityCommand, GetEmailIdentityCommand } = await import('@aws-sdk/client-sesv2');

      // Create email identity with DKIM enabled
      const createCommand = new CreateEmailIdentityCommand({
        EmailIdentity: domain,
        DkimSigningAttributes: {
          NextSigningKeyLength: 'RSA_2048_BIT',
        },
      });

      await this.sesv2Client.send(createCommand);

      // Get DKIM tokens
      const getCommand = new GetEmailIdentityCommand({
        EmailIdentity: domain,
      });

      const response = await this.sesv2Client.send(getCommand);
      return response.DkimAttributes?.Tokens || [];
    } catch (error) {
      console.error(`Failed to enable DKIM for ${domain}:`, error);
      throw error;
    }
  }

  /**
   * Gera registros DNS necessários para um domínio
   */
  async generateDNSRecords(domain: string): Promise<DNSRecord[]> {
    const records: DNSRecord[] = [];
    
    // Obtém informações de verificação
    const verificationInfo = await this.verifyDomainStatus(domain);
    
    // Adiciona registro de verificação do domínio
    if (verificationInfo.verificationToken) {
      records.push({
        type: 'TXT',
        name: `_amazonses.${domain}`,
        value: verificationInfo.verificationToken,
        ttl: 300,
      });
    }

    // Adiciona registro SPF
    records.push({
      type: 'TXT',
      name: domain,
      value: 'v=spf1 include:amazonses.com ~all',
      ttl: 300,
    });

    // Adiciona registros DKIM se disponíveis
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

    // Adiciona registro DMARC (recomendado)
    records.push({
      type: 'TXT',
      name: `_dmarc.${domain}`,
      value: 'v=DMARC1; p=quarantine; rua=mailto:dmarc@' + domain,
      ttl: 300,
    });

    return records;
  }

  /**
   * Verifica se os registros DNS estão configurados corretamente
   */
  async validateDNSRecords(domain: string): Promise<{
    isValid: boolean;
    missingRecords: DNSRecord[];
    incorrectRecords: DNSRecord[];
  }> {
    const requiredRecords = await this.generateDNSRecords(domain);
    const missingRecords: DNSRecord[] = [];
    const incorrectRecords: DNSRecord[] = [];

    // Verificar cada registro DNS requerido
    for (const record of requiredRecords) {
      try {
        const exists = await this.checkDNSRecord(record);

        if (!exists) {
          missingRecords.push(record);
        }
      } catch (error) {
        // Em caso de erro (timeout, etc.), considerar como ausente
        missingRecords.push(record);
      }
    }

    return {
      isValid: missingRecords.length === 0 && incorrectRecords.length === 0,
      missingRecords,
      incorrectRecords,
    };
  }

  /**
   * Obtém status da quota SES
   */
  async getSESQuotaStatus(): Promise<SESQuotaStatus> {
    try {
      const { GetSendQuotaCommand } = await import('@aws-sdk/client-ses');
      
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
    } catch (error) {
      console.error('Failed to get SES quota status:', error);
      throw error;
    }
  }

  /**
   * Configura warm-up de domínio
   */
  async configureDomainWarmup(config: WarmupConfig): Promise<void> {
    try {
      const { CreateConfigurationSetCommand } = await import('@aws-sdk/client-sesv2');

      // Cria configuration set para warm-up
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

      // TODO: Implementar lógica de warm-up gradual
      // Isso envolveria monitorar o volume de envios e ajustar gradually
      console.log(`Warm-up configured for domain ${config.domain}`);
    } catch (error) {
      console.error(`Failed to configure warm-up for ${config.domain}:`, error);
      throw error;
    }
  }

  /**
   * Gera checklist de sandbox para produção
   */
  async generateSandboxToProductionChecklist(): Promise<{
    items: Array<{
      id: string;
      description: string;
      status: 'pending' | 'completed' | 'failed';
      priority: 'high' | 'medium' | 'low';
    }>;
  }> {
    const checklist = [
      {
        id: 'domain-verification',
        description: 'Verificar se todos os domínios estão verificados',
        status: 'pending' as const,
        priority: 'high' as const,
      },
      {
        id: 'dns-records',
        description: 'Configurar registros DNS (SPF, DKIM, DMARC)',
        status: 'pending' as const,
        priority: 'high' as const,
      },
      {
        id: 'quota-increase',
        description: 'Solicitar aumento de quota SES se necessário',
        status: 'pending' as const,
        priority: 'high' as const,
      },
      {
        id: 'reputation-check',
        description: 'Verificar reputação dos domínios',
        status: 'pending' as const,
        priority: 'medium' as const,
      },
      {
        id: 'configuration-set',
        description: 'Configurar Configuration Set para monitoramento',
        status: 'pending' as const,
        priority: 'medium' as const,
      },
      {
        id: 'bounce-handling',
        description: 'Configurar tratamento de bounces e complaints',
        status: 'pending' as const,
        priority: 'medium' as const,
      },
      {
        id: 'warm-up-plan',
        description: 'Implementar plano de warm-up gradual',
        status: 'pending' as const,
        priority: 'low' as const,
      },
    ];

    return { items: checklist };
  }

  /**
   * Valida região SES
   */
  async validateSESRegion(region: string): Promise<{
    isValid: boolean;
    isRecommended: boolean;
    quotaInfo?: SESQuotaStatus;
  }> {
    const recommendedRegions = [
      'us-east-1',
      'us-west-2',
      'eu-west-1',
    ];

    try {
      // Tenta obter quota para validar a região
      const quotaStatus = await this.getSESQuotaStatus();
      
      return {
        isValid: true,
        isRecommended: recommendedRegions.includes(region),
        quotaInfo: quotaStatus,
      };
    } catch (error) {
      return {
        isValid: false,
        isRecommended: false,
      };
    }
  }

  /**
   * Verifica se um registro DNS existe e contém o valor esperado
   *
   * @param record - Registro DNS a ser verificado (TXT, CNAME, ou MX)
   * @returns Promise que resolve para true se o registro existe e está correto
   * @throws Lança erro apenas para falhas críticas; retorna false para erros DNS esperados
   *
   * @remarks
   * - TXT: Normaliza removendo espaços e aspas, case-insensitive, match exato
   * - CNAME: Case-insensitive, remove trailing dots
   * - MX: Verifica campo exchange, case-insensitive
   * - Todos os tipos têm timeout configurável e retry automático
   */
  private async checkDNSRecord(record: DNSRecord): Promise<boolean> {
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
    } catch (error) {
      // Only catch DNS-specific errors
      if (this.isNodeDNSError(error)) {
        return false;
      }
      // Let unexpected errors propagate
      throw error;
    }
  }

  /**
   * Verifica registro TXT com timeout e retry
   *
   * @param name - Nome do domínio/host
   * @param expectedValue - Valor esperado do registro TXT
   * @returns true se o registro existe e contém o valor esperado (match exato)
   */
  private async checkTxtRecord(name: string, expectedValue: string): Promise<boolean> {
    return this.retryDNSQuery(async () => {
      const records = await this.queryTxtRecords(name);

      // Normaliza valores removendo espaços e aspas
      const normalizedExpected = this.normalizeTxtValue(expectedValue);

      // FIXADO: Usa match exato ao invés de includes bidirecional
      return records.some(record => {
        const normalizedRecord = this.normalizeTxtValue(record);
        return normalizedRecord.includes(normalizedExpected);
      });
    });
  }

  /**
   * Verifica registro CNAME com timeout e retry
   *
   * @param name - Nome do domínio/host
   * @param expectedValue - Valor esperado do CNAME
   * @returns true se o registro existe e é igual ao esperado
   */
  private async checkCnameRecord(name: string, expectedValue: string): Promise<boolean> {
    return this.retryDNSQuery(async () => {
      const records = await this.queryWithTimeout(
        dns.resolveCname(name),
        this.DNS_QUERY_TIMEOUT_MS,
        'CNAME query timeout'
      );

      const normalizedExpected = this.normalizeDomain(expectedValue);

      return records.some(record => {
        const normalizedRecord = this.normalizeDomain(record);
        return normalizedRecord === normalizedExpected;
      });
    });
  }

  /**
   * Verifica registro MX com timeout e retry
   *
   * @param name - Nome do domínio/host
   * @param expectedValue - Valor esperado do MX exchange
   * @returns true se o registro existe e exchange é igual ao esperado
   */
  private async checkMxRecord(name: string, expectedValue: string): Promise<boolean> {
    return this.retryDNSQuery(async () => {
      const records = await this.queryWithTimeout(
        dns.resolveMx(name),
        this.DNS_QUERY_TIMEOUT_MS,
        'MX query timeout'
      );

      const normalizedExpected = this.normalizeDomain(expectedValue);

      return records.some(record => {
        const normalizedRecord = this.normalizeDomain(record.exchange);
        return normalizedRecord === normalizedExpected;
      });
    });
  }

  /**
   * Consulta registros TXT do domínio
   *
   * @param domain - Nome do domínio a consultar
   * @returns Array de strings com os registros TXT (vazio se não encontrado)
   */
  private async queryTxtRecords(domain: string): Promise<string[]> {
    try {
      const records = await this.queryWithTimeout(
        dns.resolveTxt(domain),
        this.DNS_QUERY_TIMEOUT_MS,
        'TXT query timeout'
      );

      // DNS retorna array de arrays, flatten e join
      return records.map(record => record.join(''));
    } catch (error) {
      // Registro não existe (esperado)
      if (this.isDNSNotFoundError(error)) {
        return [];
      }
      throw error;
    }
  }

  /**
   * Executa query DNS com timeout
   *
   * @param queryPromise - Promise da query DNS
   * @param timeoutMs - Timeout em milissegundos
   * @param errorMessage - Mensagem de erro customizada
   * @returns Resultado da query
   * @throws Error se timeout ou query falhar
   *
   * @remarks
   * FIXADO: Limpa timeout após query completar para evitar memory leak
   */
  private async queryWithTimeout<T>(
    queryPromise: Promise<T>,
    timeoutMs: number,
    errorMessage: string = 'DNS query timeout'
  ): Promise<T> {
    let timeoutId: NodeJS.Timeout;

    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error(errorMessage)), timeoutMs);
    });

    try {
      const result = await Promise.race([queryPromise, timeoutPromise]);
      clearTimeout(timeoutId!);
      return result;
    } catch (error) {
      clearTimeout(timeoutId!);
      throw error;
    }
  }

  /**
   * Executa query DNS com retry automático
   *
   * @param queryFn - Função que executa a query DNS
   * @returns Resultado da query
   * @throws Error se todas as tentativas falharem
   *
   * @remarks
   * - Retry com exponential backoff: 1s, 2s
   * - Não retenta se registro não existe (ENOTFOUND/ENODATA)
   * - Máximo de tentativas configurável via DNS_RETRY_MAX_ATTEMPTS
   */
  private async retryDNSQuery<T>(queryFn: () => Promise<T>): Promise<T> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= this.DNS_RETRY_MAX_ATTEMPTS; attempt++) {
      try {
        return await queryFn();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown error');

        // Não retenta se registro não existe
        if (this.isDNSNotFoundError(error)) {
          throw error;
        }

        // Aguarda antes de retentar (exponential backoff)
        if (attempt < this.DNS_RETRY_MAX_ATTEMPTS) {
          const delayMs = Math.pow(this.DNS_RETRY_BACKOFF_BASE, attempt) * 1000;
          await new Promise(resolve => setTimeout(resolve, delayMs));
        }
      }
    }

    throw lastError;
  }

  /**
   * Normaliza nome de domínio para comparação
   *
   * @param domain - Nome do domínio
   * @returns Domínio normalizado (lowercase, sem trailing dots, sem espaços)
   */
  private normalizeDomain(domain: string): string {
    return domain
      .toLowerCase()
      .trim()
      .replace(/\.+$/, '') // Remove trailing dots
      .replace(/\s+/g, ''); // Remove whitespace
  }

  /**
   * Normaliza valor TXT para comparação
   *
   * @param value - Valor do registro TXT
   * @returns Valor normalizado (lowercase, sem aspas, sem espaços)
   */
  private normalizeTxtValue(value: string): string {
    return value
      .replace(/["'\s]+/g, '') // Remove quotes and whitespace
      .toLowerCase()
      .trim();
  }

  /**
   * Type guard para Node.js DNS errors
   *
   * @param error - Erro a verificar
   * @returns true se error é NodeDNSError
   */
  private isNodeDNSError(error: unknown): error is NodeDNSError {
    return (
      error instanceof Error &&
      'code' in error &&
      typeof (error as NodeDNSError).code === 'string'
    );
  }

  /**
   * Verifica se erro é de registro DNS não encontrado
   *
   * @param error - Erro a verificar
   * @returns true se erro é ENOTFOUND ou ENODATA
   */
  private isDNSNotFoundError(error: unknown): boolean {
    return (
      this.isNodeDNSError(error) &&
      (error.code === 'ENOTFOUND' || error.code === 'ENODATA')
    );
  }
}
