import { Injectable, Logger } from '@nestjs/common';
import { DKIMCrypto, DKIMKeyPair, DKIMDNSRecord } from '@certshift/shared/src/crypto/dkim-crypto';
import { PrismaService } from '../../database/prisma.service';

export interface DKIMGenerationResult {
  selector: string;
  publicKey: string;
  privateKey: string; // Encrypted
  dnsRecord: DKIMDNSRecord;
  keyPair: DKIMKeyPair;
}

@Injectable()
export class DKIMGeneratorService {
  private readonly logger = new Logger(DKIMGeneratorService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Generate complete DKIM key pair and DNS record for a domain
   */
  async generateKeyPair(domain: string): Promise<DKIMGenerationResult> {
    this.logger.log(`Generating DKIM key pair for domain: ${domain}`);

    try {
      // Generate RSA key pair
      const keyPair = DKIMCrypto.generateKeyPair();

      // Generate selector
      const selector = DKIMCrypto.generateSelector();

      // Encrypt private key for storage
      const encryptedPrivateKey = DKIMCrypto.encryptPrivateKey(keyPair.privateKey);

      // Generate DNS record
      const dnsRecord = DKIMCrypto.generateDNSRecord(selector, keyPair.publicKey, domain);

      // Validate the key pair
      const isValid = DKIMCrypto.validateKeyPair(keyPair.publicKey, keyPair.privateKey);
      if (!isValid) {
        throw new Error('Generated DKIM key pair validation failed');
      }

      this.logger.log(`DKIM key pair generated successfully for domain: ${domain}, selector: ${selector}`);

      return {
        selector,
        publicKey: DKIMCrypto.formatPublicKeyForDNS(keyPair.publicKey),
        privateKey: encryptedPrivateKey,
        dnsRecord,
        keyPair,
      };
    } catch (error) {
      this.logger.error(`Failed to generate DKIM key pair for domain ${domain}:`, error);
      throw new Error(`DKIM key pair generation failed: ${error.message}`);
    }
  }

  /**
   * Store DKIM keys in database for a domain onboarding
   */
  async storeDKIMKeys(domainId: string, dkimData: DKIMGenerationResult): Promise<void> {
    this.logger.log(`Storing DKIM keys for domain onboarding: ${domainId}`);

    try {
      await this.prisma.domainOnboarding.update({
        where: { domainId },
        data: {
          dkimGenerated: true,
          dkimPublic: dkimData.publicKey,
          dkimPrivate: dkimData.privateKey,
          dkimSelector: dkimData.selector,
          updatedAt: new Date(),
        },
      });

      // Also create DNS record entry
      await this.prisma.dnsRecord.create({
        data: {
          domainId,
          recordType: 'TXT',
          name: dkimData.dnsRecord.name,
          value: dkimData.dnsRecord.value,
          isVerified: false,
        },
      });

      this.logger.log(`DKIM keys stored successfully for domain onboarding: ${domainId}`);
    } catch (error) {
      this.logger.error(`Failed to store DKIM keys for domain ${domainId}:`, error);
      throw new Error(`Failed to store DKIM keys: ${error.message}`);
    }
  }

  /**
   * Retrieve DKIM private key for signing (decrypted)
   */
  async getPrivateKeyForSigning(domainId: string): Promise<string | null> {
    try {
      const onboarding = await this.prisma.domainOnboarding.findUnique({
        where: { domainId },
        select: {
          dkimPrivate: true,
        },
      });

      if (!onboarding?.dkimPrivate) {
        return null;
      }

      return DKIMCrypto.decryptPrivateKey(onboarding.dkimPrivate);
    } catch (error) {
      this.logger.error(`Failed to retrieve DKIM private key for domain ${domainId}:`, error);
      return null;
    }
  }

  /**
   * Get DKIM selector for a domain
   */
  async getSelector(domainId: string): Promise<string | null> {
    try {
      const onboarding = await this.prisma.domainOnboarding.findUnique({
        where: { domainId },
        select: {
          dkimSelector: true,
        },
      });

      return onboarding?.dkimSelector || null;
    } catch (error) {
      this.logger.error(`Failed to retrieve DKIM selector for domain ${domainId}:`, error);
      return null;
    }
  }

  /**
   * Validate DKIM setup for a domain
   */
  async validateDKIMSetup(domainId: string): Promise<{
    isValid: boolean;
    hasKeys: boolean;
    selector?: string;
    dnsRecord?: string;
  }> {
    try {
      const onboarding = await this.prisma.domainOnboarding.findUnique({
        where: { domainId },
        select: {
          dkimGenerated: true,
          dkimSelector: true,
          dkimPublic: true,
          dkimPrivate: true,
        },
      });

      if (!onboarding?.dkimGenerated) {
        return { isValid: false, hasKeys: false };
      }

      const hasKeys = !!(onboarding.dkimPublic && onboarding.dkimPrivate && onboarding.dkimSelector);

      if (!hasKeys) {
        return { isValid: false, hasKeys: false };
      }

      // Try to decrypt and validate
      try {
        const privateKey = DKIMCrypto.decryptPrivateKey(onboarding.dkimPrivate!);
        const isValid = DKIMCrypto.validateKeyPair(onboarding.dkimPublic!, privateKey);

        return {
          isValid,
          hasKeys: true,
          selector: onboarding.dkimSelector!,
          dnsRecord: `${onboarding.dkimSelector!}._domainkey`,
        };
      } catch (error) {
        return { isValid: false, hasKeys: true, selector: onboarding.dkimSelector! };
      }
    } catch (error) {
      this.logger.error(`Failed to validate DKIM setup for domain ${domainId}:`, error);
      return { isValid: false, hasKeys: false };
    }
  }
}
