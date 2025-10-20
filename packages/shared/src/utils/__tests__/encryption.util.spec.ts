/**
 * @email-gateway/shared - Encryption Utilities Tests
 *
 * Testes para utilitários de criptografia e hash
 *
 * TASK 5.2 — PII, masking, criptografia, retenção e acesso
 */

import {
  encrypt,
  decrypt,
  serializeEncrypted,
  deserializeEncrypted,
  generateHmacSha256,
  generateSha256,
  isValidHash,
  normalizeCpfCnpjForHash,
  hashCpfCnpjHmac,
  hashCpfCnpjSha256,
  encryptCpfCnpj,
  decryptCpfCnpj,
  deriveKey,
} from '../encryption.util';

describe('Encryption Utilities', () => {
  const testKey = Buffer.from('0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef', 'hex'); // 32 bytes
  const testPassword = 'test-password-123';
  const testSalt = Buffer.from('0123456789abcdef0123456789abcdef', 'hex');

  describe('deriveKey', () => {
    it('should derive a key from password and salt', () => {
      const key = deriveKey(testPassword, testSalt);
      
      expect(key).toBeInstanceOf(Buffer);
      expect(key.length).toBe(32);
    });

    it('should produce consistent keys with same inputs', () => {
      const key1 = deriveKey(testPassword, testSalt);
      const key2 = deriveKey(testPassword, testSalt);
      
      expect(key1).toEqual(key2);
    });

    it('should produce different keys with different passwords', () => {
      const key1 = deriveKey(testPassword, testSalt);
      const key2 = deriveKey('different-password', testSalt);
      
      expect(key1).not.toEqual(key2);
    });
  });

  describe('encrypt/decrypt', () => {
    it('should encrypt and decrypt data correctly', () => {
      const originalData = 'sensitive-data-123';
      
      const { encrypted, iv, tag } = encrypt(originalData, testKey);
      const decrypted = decrypt(encrypted, testKey, iv, tag);
      
      expect(decrypted).toBe(originalData);
    });

    it('should produce different encrypted data each time', () => {
      const originalData = 'sensitive-data-123';
      
      const result1 = encrypt(originalData, testKey);
      const result2 = encrypt(originalData, testKey);
      
      expect(result1.encrypted).not.toEqual(result2.encrypted);
      expect(result1.iv).not.toEqual(result2.iv);
    });

    it('should fail to decrypt with wrong key', () => {
      const originalData = 'sensitive-data-123';
      const wrongKey = Buffer.from('fedcba9876543210fedcba9876543210', 'hex');
      
      const { encrypted, iv, tag } = encrypt(originalData, testKey);
      
      expect(() => {
        decrypt(encrypted, wrongKey, iv, tag);
      }).toThrow();
    });
  });

  describe('serializeEncrypted/deserializeEncrypted', () => {
    it('should serialize and deserialize encrypted data', () => {
      const originalData = 'sensitive-data-123';
      const { encrypted, iv, tag } = encrypt(originalData, testKey);
      
      const serialized = serializeEncrypted(encrypted, iv, tag);
      const { encrypted: deserializedEncrypted, iv: deserializedIv, tag: deserializedTag } = 
        deserializeEncrypted(serialized);
      
      expect(deserializedEncrypted).toEqual(encrypted);
      expect(deserializedIv).toEqual(iv);
      expect(deserializedTag).toEqual(tag);
    });

    it('should produce valid base64 string', () => {
      const originalData = 'sensitive-data-123';
      const { encrypted, iv, tag } = encrypt(originalData, testKey);
      
      const serialized = serializeEncrypted(encrypted, iv, tag);
      
      expect(serialized).toMatch(/^[A-Za-z0-9+/]+=*$/);
    });
  });

  describe('generateHmacSha256', () => {
    it('should generate consistent HMAC-SHA256 hash', () => {
      const data = 'test-data';
      const secret = 'test-secret';
      
      const hash1 = generateHmacSha256(data, secret);
      const hash2 = generateHmacSha256(data, secret);
      
      expect(hash1).toBe(hash2);
      expect(hash1).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should produce different hashes with different secrets', () => {
      const data = 'test-data';
      const secret1 = 'secret1';
      const secret2 = 'secret2';
      
      const hash1 = generateHmacSha256(data, secret1);
      const hash2 = generateHmacSha256(data, secret2);
      
      expect(hash1).not.toBe(hash2);
    });
  });

  describe('generateSha256', () => {
    it('should generate consistent SHA-256 hash', () => {
      const data = 'test-data';
      
      const hash1 = generateSha256(data);
      const hash2 = generateSha256(data);
      
      expect(hash1).toBe(hash2);
      expect(hash1).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should produce different hashes for different data', () => {
      const data1 = 'data1';
      const data2 = 'data2';
      
      const hash1 = generateSha256(data1);
      const hash2 = generateSha256(data2);
      
      expect(hash1).not.toBe(hash2);
    });
  });

  describe('isValidHash', () => {
    it('should validate correct SHA-256 hash', () => {
      const validHash = 'a665a45920422f9d417e4867efdc4fb8a04a1f3fff1fa07e998e86f7f7a27ae3';
      
      expect(isValidHash(validHash)).toBe(true);
    });

    it('should reject invalid hash formats', () => {
      expect(isValidHash('invalid')).toBe(false);
      expect(isValidHash('123')).toBe(false);
      expect(isValidHash('')).toBe(false);
      expect(isValidHash(null as any)).toBe(false);
      expect(isValidHash(undefined as any)).toBe(false);
    });
  });

  describe('normalizeCpfCnpjForHash', () => {
    it('should remove formatting from CPF', () => {
      const cpf = '123.456.789-00';
      const normalized = normalizeCpfCnpjForHash(cpf);
      
      expect(normalized).toBe('12345678900');
    });

    it('should remove formatting from CNPJ', () => {
      const cnpj = '12.345.678/0001-95';
      const normalized = normalizeCpfCnpjForHash(cnpj);
      
      expect(normalized).toBe('12345678000195');
    });

    it('should handle already normalized input', () => {
      const cpf = '12345678900';
      const normalized = normalizeCpfCnpjForHash(cpf);
      
      expect(normalized).toBe('12345678900');
    });
  });

  describe('hashCpfCnpjHmac', () => {
    it('should hash CPF with HMAC-SHA256', () => {
      const cpf = '123.456.789-00';
      const secret = 'test-secret';
      
      const hash = hashCpfCnpjHmac(cpf, secret);
      
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should produce consistent hashes for same CPF/CNPJ', () => {
      const cpf = '123.456.789-00';
      const secret = 'test-secret';
      
      const hash1 = hashCpfCnpjHmac(cpf, secret);
      const hash2 = hashCpfCnpjHmac(cpf, secret);
      
      expect(hash1).toBe(hash2);
    });
  });

  describe('hashCpfCnpjSha256', () => {
    it('should hash CPF with SHA-256', () => {
      const cpf = '123.456.789-00';
      
      const hash = hashCpfCnpjSha256(cpf);
      
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should produce consistent hashes for same CPF/CNPJ', () => {
      const cpf = '123.456.789-00';
      
      const hash1 = hashCpfCnpjSha256(cpf);
      const hash2 = hashCpfCnpjSha256(cpf);
      
      expect(hash1).toBe(hash2);
    });
  });

  describe('encryptCpfCnpj/decryptCpfCnpj', () => {
    it('should encrypt and decrypt CPF/CNPJ', () => {
      const cpf = '123.456.789-00';
      const password = 'test-password';
      
      const { encrypted, salt } = encryptCpfCnpj(cpf, password);
      const decrypted = decryptCpfCnpj(encrypted, password, salt);
      
      expect(decrypted).toBe('12345678900'); // Normalized
    });

    it('should produce different encrypted data each time', () => {
      const cpf = '123.456.789-00';
      const password = 'test-password';
      
      const result1 = encryptCpfCnpj(cpf, password);
      const result2 = encryptCpfCnpj(cpf, password);
      
      expect(result1.encrypted).not.toBe(result2.encrypted);
      expect(result1.salt).not.toBe(result2.salt);
    });

    it('should fail to decrypt with wrong password', () => {
      const cpf = '123.456.789-00';
      const password = 'test-password';
      const wrongPassword = 'wrong-password';
      
      const { encrypted, salt } = encryptCpfCnpj(cpf, password);
      
      expect(() => {
        decryptCpfCnpj(encrypted, wrongPassword, salt);
      }).toThrow();
    });
  });
});
