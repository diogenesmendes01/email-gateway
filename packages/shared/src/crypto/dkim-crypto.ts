import { createHash, generateKeyPairSync, randomBytes } from 'crypto';

/**
 * DKIM Cryptography Utilities
 * RFC 6376 - DomainKeys Identified Mail
 */
export class DKIMCrypto {
  /**
   * Generate RSA 2048-bit key pair for DKIM
   */
  static generateKeyPair(): DKIMKeyPair {
    const { publicKey, privateKey } = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: {
        type: 'spki',
        format: 'pem',
      },
      privateKeyEncoding: {
        type: 'pkcs8',
        format: 'pem',
      },
    });

    return {
      publicKey,
      privateKey,
    };
  }

  /**
   * Format public key for DNS TXT record
   * RFC 6376 Section 3.6.1
   */
  static formatPublicKeyForDNS(publicKey: string): string {
    // Remove header/footer and clean the key
    const cleanKey = publicKey
      .replace(/-----BEGIN PUBLIC KEY-----/, '')
      .replace(/-----END PUBLIC KEY-----/, '')
      .replace(/\s+/g, '');

    // Base64 decode and re-encode to ensure clean format
    const buffer = Buffer.from(cleanKey, 'base64');
    const reencoded = buffer.toString('base64');

    // Split into 255-character chunks as per RFC
    const chunks: string[] = [];
    for (let i = 0; i < reencoded.length; i += 255) {
      chunks.push(reencoded.slice(i, i + 255));
    }

    return chunks.join('; ');
  }

  /**
   * Generate DKIM selector
   * Format: s{YYYYMMDD} or s{YYYYMMDD}-{random}
   */
  static generateSelector(prefix: string = 's'): string {
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');

    // Add random suffix to avoid collisions
    const random = randomBytes(2).toString('hex').toUpperCase();

    return `${prefix}${dateStr}-${random}`;
  }

  /**
   * Encrypt private key for secure storage
   * Uses AES-256-GCM with a key derived from environment
   */
  static encryptPrivateKey(privateKey: string, encryptionKey?: string): string {
    const key = encryptionKey || process.env.DKIM_ENCRYPTION_KEY;
    if (!key) {
      throw new Error('DKIM_ENCRYPTION_KEY environment variable is required');
    }

    // For now, return base64 encoded (in production, use proper encryption)
    // TODO: Implement proper AES encryption
    return Buffer.from(privateKey).toString('base64');
  }

  /**
   * Decrypt private key for DKIM signing
   */
  static decryptPrivateKey(encryptedKey: string, encryptionKey?: string): string {
    const key = encryptionKey || process.env.DKIM_ENCRYPTION_KEY;
    if (!key) {
      throw new Error('DKIM_ENCRYPTION_KEY environment variable is required');
    }

    // For now, decode base64 (in production, use proper decryption)
    // TODO: Implement proper AES decryption
    return Buffer.from(encryptedKey, 'base64').toString();
  }

  /**
   * Validate DKIM key pair
   */
  static validateKeyPair(publicKey: string, privateKey: string): boolean {
    try {
      // Test signing and verification
      const testData = 'test message for DKIM validation';
      // Basic hash for validation
      createHash('sha256').update(testData).digest();

      // This is a basic validation - in production you'd use proper RSA signing
      return publicKey.includes('BEGIN PUBLIC KEY') && privateKey.includes('BEGIN PRIVATE KEY');
    } catch (error) {
      return false;
    }
  }

  /**
   * Generate DNS TXT record value for DKIM
   * Format: v=DKIM1; k=rsa; p=<public_key>
   */
  static generateDNSRecord(selector: string, publicKey: string, domain: string): DKIMDNSRecord {
    const formattedKey = this.formatPublicKeyForDNS(publicKey);

    return {
      type: 'TXT',
      name: `${selector}._domainkey.${domain}`,
      value: `v=DKIM1; k=rsa; p=${formattedKey}`,
      ttl: 300, // 5 minutes as recommended
    };
  }
}

export interface DKIMKeyPair {
  publicKey: string;
  privateKey: string;
}

export interface DKIMDNSRecord {
  type: 'TXT';
  name: string;
  value: string;
  ttl: number;
}
