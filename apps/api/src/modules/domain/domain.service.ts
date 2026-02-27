/**
 * @email-gateway/api - Domain Management Service
 *
 * Service para gerenciamento de domínios e DNS (SPF/DKIM)
 * Usa banco de dados (Prisma) e verificação DNS nativa (dns/promises)
 * Sem dependência de AWS SES.
 */

import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { prisma } from '@email-gateway/database';
import { DomainVerificationStatus as PrismaDomainVerificationStatus } from '@prisma/client';
import * as crypto from 'crypto';
import * as dns from 'dns/promises';

// DTOs
import {
  DomainVerificationRequest,
  DomainVerificationResponse,
  DNSRecordsResponse,
  WarmupConfigRequest,
  WarmupConfigResponse,
  DomainListResponse,
  DomainVerificationStatus,
  DKIMVerificationStatus,
  DNSRecord,
} from './dto/domain.dto';

@Injectable()
export class DomainService {
  private readonly logger = new Logger(DomainService.name);

  /**
   * Lista domínios configurados para uma empresa
   */
  async listDomains(companyId: string): Promise<DomainListResponse> {
    const domains = await prisma.domain.findMany({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
      include: { onboarding: true },
    });

    const domainResponses: DomainVerificationResponse[] = domains.map((domain) => ({
      domain: domain.domain,
      status: this.mapPrismaStatus(domain.status),
      dnsRecords: [],
      dkimTokens: domain.dkimTokens,
      dkimStatus: this.mapDkimStatus(domain.dkimStatus),
      lastChecked: domain.lastChecked?.toISOString(),
      errorMessage: domain.errorMessage ?? undefined,
    }));

    const verified = domainResponses.filter(d => d.status === DomainVerificationStatus.SUCCESS).length;
    const pending = domainResponses.filter(d => d.status === DomainVerificationStatus.PENDING).length;
    const failed = domainResponses.filter(d => d.status === DomainVerificationStatus.FAILED).length;

    return {
      domains: domainResponses,
      total: domains.length,
      verified,
      pending,
      failed,
    };
  }

  /**
   * Adiciona novo domínio para verificação
   */
  async addDomain(
    companyId: string,
    request: DomainVerificationRequest,
  ): Promise<DomainVerificationResponse> {
    if (!this.isValidDomain(request.domain)) {
      throw new BadRequestException(`Invalid domain format: ${request.domain}`);
    }

    const existingDomain = await prisma.domain.findFirst({
      where: { companyId, domain: request.domain },
    });

    if (existingDomain) {
      throw new BadRequestException(`Domain ${request.domain} already exists`);
    }

    try {
      // Gera token de verificação único
      const verificationToken = crypto.randomBytes(32).toString('hex');

      // Cria domínio no banco
      const domain = await prisma.domain.create({
        data: {
          companyId,
          domain: request.domain,
          status: 'PENDING',
          dkimStatus: 'PENDING',
        },
      });

      // Registros DNS que o usuário precisa configurar
      const dnsRecords: DNSRecord[] = [
        {
          type: 'TXT',
          name: `_emailgateway.${request.domain}`,
          value: `v=emailgateway1 verify=${verificationToken}`,
          ttl: 300,
        },
      ];

      // Cria registros DNS no banco
      await prisma.dNSRecord.create({
        data: {
          domainId: domain.id,
          recordType: 'TXT',
          name: `_emailgateway.${request.domain}`,
          value: `v=emailgateway1 verify=${verificationToken}`,
          isVerified: false,
        },
      });

      // Se DKIM solicitado, gera par de chaves
      let dkimTokens: string[] = [];
      if (request.enableDKIM) {
        dkimTokens = await this.generateDKIM(domain.id, request.domain, dnsRecords);
      }

      // Cria registro de onboarding
      await prisma.domainOnboarding.create({
        data: {
          domainId: domain.id,
          status: 'DNS_PENDING',
          spfRecord: `v=spf1 include:${request.domain} ~all`,
          returnPath: `bounces.${request.domain}`,
        },
      });

      return {
        domain: request.domain,
        status: DomainVerificationStatus.PENDING,
        verificationToken,
        dnsRecords,
        dkimTokens,
        dkimStatus: request.enableDKIM ? DKIMVerificationStatus.PENDING : DKIMVerificationStatus.NOT_STARTED,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error({ message: 'Failed to add domain', domain: request.domain, error: errorMessage });
      throw new BadRequestException(`Failed to add domain: ${errorMessage}`);
    }
  }

  /**
   * Obtém status de verificação de um domínio
   */
  async getDomainStatus(
    companyId: string,
    domain: string,
  ): Promise<DomainVerificationResponse> {
    const dbDomain = await prisma.domain.findFirst({
      where: { companyId, domain },
      include: { onboarding: true },
    });

    if (!dbDomain) {
      throw new NotFoundException(`Domain ${domain} not found`);
    }

    const dnsRecords = await prisma.dNSRecord.findMany({
      where: { domainId: dbDomain.id },
    });

    return {
      domain,
      status: this.mapPrismaStatus(dbDomain.status),
      dnsRecords: dnsRecords.map(r => ({
        type: r.recordType as 'TXT' | 'CNAME' | 'MX',
        name: r.name,
        value: r.value,
        ttl: 300,
      })),
      dkimTokens: dbDomain.dkimTokens,
      dkimStatus: this.mapDkimStatus(dbDomain.dkimStatus),
      lastChecked: dbDomain.lastChecked?.toISOString(),
      errorMessage: dbDomain.errorMessage ?? undefined,
    };
  }

  /**
   * Inicia verificação de um domínio (checa DNS real)
   */
  async verifyDomain(
    companyId: string,
    domain: string,
  ): Promise<DomainVerificationResponse> {
    const dbDomain = await prisma.domain.findFirst({
      where: { companyId, domain },
    });

    if (!dbDomain) {
      throw new NotFoundException(`Domain ${domain} not found`);
    }

    try {
      // Busca registros DNS esperados
      const expectedRecords = await prisma.dNSRecord.findMany({
        where: { domainId: dbDomain.id },
      });

      let allVerified = true;

      for (const record of expectedRecords) {
        const verified = await this.verifyDNSRecord(record.name, record.recordType, record.value);
        await prisma.dNSRecord.update({
          where: { id: record.id },
          data: { isVerified: verified, lastChecked: new Date() },
        });
        if (!verified) allVerified = false;
      }

      const newStatus: PrismaDomainVerificationStatus = allVerified ? 'VERIFIED' : 'PENDING';

      await prisma.domain.update({
        where: { id: dbDomain.id },
        data: {
          status: newStatus,
          lastChecked: new Date(),
          ...(allVerified ? { lastVerified: new Date() } : {}),
        },
      });

      // Atualiza onboarding se verificado
      if (allVerified) {
        await prisma.domainOnboarding.updateMany({
          where: { domainId: dbDomain.id },
          data: { status: 'DKIM_VERIFIED' },
        });
      }

      return {
        domain,
        status: allVerified ? DomainVerificationStatus.SUCCESS : DomainVerificationStatus.PENDING,
        dnsRecords: expectedRecords.map(r => ({
          type: r.recordType as 'TXT' | 'CNAME' | 'MX',
          name: r.name,
          value: r.value,
          ttl: 300,
        })),
        dkimTokens: dbDomain.dkimTokens,
        lastChecked: new Date().toISOString(),
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error({ message: 'Failed to verify domain', domain, error: errorMessage });

      await prisma.domain.update({
        where: { id: dbDomain.id },
        data: {
          status: 'TEMPORARY_FAILURE',
          lastChecked: new Date(),
          errorMessage,
        },
      });

      throw new BadRequestException(`Failed to verify domain: ${errorMessage}`);
    }
  }

  /**
   * Obtém registros DNS necessários para um domínio
   */
  async getDNSRecords(
    companyId: string,
    domain: string,
  ): Promise<DNSRecordsResponse> {
    const dbDomain = await prisma.domain.findFirst({
      where: { companyId, domain },
    });

    if (!dbDomain) {
      throw new NotFoundException(`Domain ${domain} not found`);
    }

    const records = await prisma.dNSRecord.findMany({
      where: { domainId: dbDomain.id },
    });

    return {
      domain,
      records: records.map(r => ({
        type: r.recordType as 'TXT' | 'CNAME' | 'MX',
        name: r.name,
        value: r.value,
        ttl: 300,
      })),
      isValid: records.every(r => r.isVerified),
    };
  }

  /**
   * Habilita DKIM para um domínio
   */
  async enableDKIM(
    companyId: string,
    domain: string,
  ): Promise<DNSRecordsResponse> {
    const dbDomain = await prisma.domain.findFirst({
      where: { companyId, domain },
    });

    if (!dbDomain) {
      throw new NotFoundException(`Domain ${domain} not found`);
    }

    try {
      const dnsRecords: DNSRecord[] = [];
      await this.generateDKIM(dbDomain.id, domain, dnsRecords);

      await prisma.domain.update({
        where: { id: dbDomain.id },
        data: { dkimStatus: 'PENDING' },
      });

      // Retorna todos os registros DNS do domínio
      const allRecords = await prisma.dNSRecord.findMany({
        where: { domainId: dbDomain.id },
      });

      return {
        domain,
        records: allRecords.map(r => ({
          type: r.recordType as 'TXT' | 'CNAME' | 'MX',
          name: r.name,
          value: r.value,
          ttl: 300,
        })),
        isValid: false,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error({ message: 'Failed to enable DKIM', domain, error: errorMessage });
      return { domain, records: [], isValid: false, errorMessage };
    }
  }

  /**
   * Valida registros DNS de um domínio
   */
  async validateDNS(
    companyId: string,
    domain: string,
  ): Promise<DNSRecordsResponse> {
    const dbDomain = await prisma.domain.findFirst({
      where: { companyId, domain },
    });

    if (!dbDomain) {
      throw new NotFoundException(`Domain ${domain} not found`);
    }

    const records = await prisma.dNSRecord.findMany({
      where: { domainId: dbDomain.id },
    });

    const missingRecords: DNSRecord[] = [];
    const validRecords: DNSRecord[] = [];

    for (const record of records) {
      const verified = await this.verifyDNSRecord(record.name, record.recordType, record.value);
      const dnsRecord: DNSRecord = {
        type: record.recordType as 'TXT' | 'CNAME' | 'MX',
        name: record.name,
        value: record.value,
        ttl: 300,
      };

      if (verified) {
        validRecords.push(dnsRecord);
      } else {
        missingRecords.push(dnsRecord);
      }

      await prisma.dNSRecord.update({
        where: { id: record.id },
        data: { isVerified: verified, lastChecked: new Date() },
      });
    }

    return {
      domain,
      records: validRecords,
      missingRecords,
      isValid: missingRecords.length === 0 && records.length > 0,
    };
  }

  /**
   * Configura warm-up para um domínio
   */
  async configureWarmup(
    companyId: string,
    domain: string,
    config: WarmupConfigRequest,
  ): Promise<WarmupConfigResponse> {
    const dbDomain = await prisma.domain.findFirst({
      where: { companyId, domain },
    });

    if (!dbDomain) {
      throw new NotFoundException(`Domain ${domain} not found`);
    }

    try {
      await prisma.domain.update({
        where: { id: dbDomain.id },
        data: {
          warmupEnabled: true,
          warmupStartDate: new Date(config.startDate),
          warmupConfig: {
            dailyVolume: config.dailyVolume,
            durationDays: config.durationDays,
            incrementPercentage: config.incrementPercentage,
          },
        },
      });

      return { domain, config, success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error({ message: 'Failed to configure warm-up', domain, error: errorMessage });
      return { domain, config, success: false, errorMessage };
    }
  }

  /**
   * Remove um domínio
   */
  async removeDomain(companyId: string, domain: string): Promise<void> {
    const dbDomain = await prisma.domain.findFirst({
      where: { companyId, domain },
    });

    if (!dbDomain) {
      throw new NotFoundException(`Domain ${domain} not found`);
    }

    try {
      await prisma.domain.delete({
        where: { id: dbDomain.id },
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error({ message: 'Failed to remove domain', domain, error: errorMessage });
      throw new BadRequestException(`Failed to remove domain: ${errorMessage}`);
    }
  }

  /**
   * Obtém detalhes de um domínio específico por ID
   */
  async getDomainById(
    companyId: string,
    domainId: string,
  ): Promise<DomainVerificationResponse> {
    const dbDomain = await prisma.domain.findFirst({
      where: { id: domainId, companyId },
    });

    if (!dbDomain) {
      throw new NotFoundException(`Domain with ID ${domainId} not found`);
    }

    const dnsRecords = await prisma.dNSRecord.findMany({
      where: { domainId: dbDomain.id },
    });

    return {
      domain: dbDomain.domain,
      status: this.mapPrismaStatus(dbDomain.status),
      dnsRecords: dnsRecords.map(r => ({
        type: r.recordType as 'TXT' | 'CNAME' | 'MX',
        name: r.name,
        value: r.value,
        ttl: 300,
      })),
      dkimTokens: dbDomain.dkimTokens,
      dkimStatus: this.mapDkimStatus(dbDomain.dkimStatus),
      lastChecked: dbDomain.lastChecked?.toISOString(),
      errorMessage: dbDomain.errorMessage ?? undefined,
    };
  }

  /**
   * Define um domínio como padrão para a empresa
   */
  async setDefaultDomain(companyId: string, domainId: string) {
    const dbDomain = await prisma.domain.findFirst({
      where: { id: domainId, companyId },
    });

    if (!dbDomain) {
      throw new NotFoundException(`Domain with ID ${domainId} not found`);
    }

    if (dbDomain.status !== 'VERIFIED') {
      throw new BadRequestException(
        `Cannot set unverified domain as default. Current status: ${dbDomain.status}`
      );
    }

    try {
      const updatedCompany = await prisma.company.update({
        where: { id: companyId },
        data: {
          domainId: dbDomain.id,
          defaultFromAddress: `noreply@${dbDomain.domain}`,
          defaultFromName: null,
        },
      });

      this.logger.log({ message: 'Default domain set successfully', companyId, domainId, domain: dbDomain.domain });

      return {
        success: true,
        message: 'Default domain set successfully',
        domain: dbDomain.domain,
        defaultFromAddress: updatedCompany.defaultFromAddress,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error({ message: 'Failed to set default domain', companyId, domainId, error: errorMessage });
      throw new BadRequestException(`Failed to set default domain: ${errorMessage}`);
    }
  }

  // --- Private helpers ---

  private isValidDomain(domain: string): boolean {
    const domainRegex = /^[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?)*$/;
    return domainRegex.test(domain);
  }

  /**
   * Verifica um registro DNS real usando dns/promises
   */
  private async verifyDNSRecord(name: string, recordType: string, expectedValue: string): Promise<boolean> {
    try {
      if (recordType === 'TXT') {
        const records = await dns.resolveTxt(name);
        const flatRecords = records.map(r => r.join(''));
        return flatRecords.some(r => r.includes(expectedValue) || expectedValue.includes(r));
      }

      if (recordType === 'CNAME') {
        const records = await dns.resolveCname(name);
        return records.some(r => r === expectedValue || r === `${expectedValue}.`);
      }

      if (recordType === 'MX') {
        const records = await dns.resolveMx(name);
        return records.some(r => r.exchange === expectedValue || r.exchange === `${expectedValue}.`);
      }

      return false;
    } catch {
      // DNS lookup failed (NXDOMAIN, SERVFAIL, etc) = not verified
      return false;
    }
  }

  /**
   * Gera par de chaves DKIM e cria registros DNS
   */
  private async generateDKIM(domainId: string, domain: string, dnsRecords: DNSRecord[]): Promise<string[]> {
    const selector = `emailgw${Date.now().toString(36)}`;

    const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });

    // Extrai a chave pública sem headers PEM para o registro DNS
    const publicKeyBase64 = publicKey
      .replace('-----BEGIN PUBLIC KEY-----', '')
      .replace('-----END PUBLIC KEY-----', '')
      .replace(/\n/g, '');

    const dkimRecordName = `${selector}._domainkey.${domain}`;
    const dkimRecordValue = `v=DKIM1; k=rsa; p=${publicKeyBase64}`;

    // Adiciona registro DKIM ao array
    dnsRecords.push({
      type: 'TXT',
      name: dkimRecordName,
      value: dkimRecordValue,
      ttl: 300,
    });

    // Salva no banco
    await prisma.dNSRecord.create({
      data: {
        domainId,
        recordType: 'TXT',
        name: dkimRecordName,
        value: dkimRecordValue,
        isVerified: false,
      },
    });

    // Atualiza onboarding com chaves DKIM
    await prisma.domainOnboarding.updateMany({
      where: { domainId },
      data: {
        dkimGenerated: true,
        dkimPublic: publicKey,
        dkimPrivate: privateKey,
        dkimSelector: selector,
      },
    });

    // Atualiza domain com tokens DKIM
    await prisma.domain.update({
      where: { id: domainId },
      data: { dkimTokens: [selector] },
    });

    return [selector];
  }

  private mapPrismaStatus(status: PrismaDomainVerificationStatus): DomainVerificationStatus {
    const map: Record<string, DomainVerificationStatus> = {
      PENDING: DomainVerificationStatus.PENDING,
      VERIFIED: DomainVerificationStatus.SUCCESS,
      FAILED: DomainVerificationStatus.FAILED,
      TEMPORARY_FAILURE: DomainVerificationStatus.TEMPORARY_FAILURE,
    };
    return map[status] ?? DomainVerificationStatus.PENDING;
  }

  private mapDkimStatus(status: string): DKIMVerificationStatus {
    const map: Record<string, DKIMVerificationStatus> = {
      NOT_STARTED: DKIMVerificationStatus.NOT_STARTED,
      PENDING: DKIMVerificationStatus.PENDING,
      VERIFIED: DKIMVerificationStatus.SUCCESS,
      FAILED: DKIMVerificationStatus.FAILED,
    };
    return map[status] ?? DKIMVerificationStatus.NOT_STARTED;
  }
}
