/**
 * @email-gateway/shared - Key Validation Tests
 *
 * Tests for encryption key validation utilities
 *
 * PR-BACKLOG: [PR18-TASK-8.1-03] Melhorar validação de ENCRYPTION_KEY
 */

import {
  validateEncryptionKey,
  validateEncryptionKeyOrThrow,
  getKeyGenerationCommand,
} from '../key-validation.util';

describe('Key Validation Utilities', () => {
  describe('validateEncryptionKey', () => {
    describe('valid keys', () => {
      it('should accept strong random key', () => {
        const strongKey = 'x7K9mP2vN8qR4tY6wE3sA5dF1gH0jL9z';
        const result = validateEncryptionKey(strongKey);

        expect(result.valid).toBe(true);
        expect(result.error).toBeUndefined();
      });

      it('should accept base64-encoded key', () => {
        const base64Key = 'YWJjZGVmZ2hpamtsbW5vcHFyc3R1dnd4eXowMTIzNDU2Nzg5';
        const result = validateEncryptionKey(base64Key);

        expect(result.valid).toBe(true);
      });

      it('should accept hex-encoded key', () => {
        const hexKey = 'a1b2c3d4e5f6789012345678901234567890abcdefabcdef';
        const result = validateEncryptionKey(hexKey);

        expect(result.valid).toBe(true);
      });

      it('should accept key with special characters', () => {
        const keyWithSpecial = 'aB3$dE5^gH7*jK9!mN2@pQ4%sT6&vW8#';
        const result = validateEncryptionKey(keyWithSpecial);

        expect(result.valid).toBe(true);
      });

      it('should accept very long key (> 32 chars)', () => {
        const longKey = 'a'.repeat(32) + 'b'.repeat(32) + 'c1234567890';
        const result = validateEncryptionKey(longKey);

        expect(result.valid).toBe(true);
      });
    });

    describe('length validation', () => {
      it('should reject key shorter than 32 characters', () => {
        const shortKey = 'too-short';
        const result = validateEncryptionKey(shortKey);

        expect(result.valid).toBe(false);
        expect(result.error).toContain('at least 32 characters');
        expect(result.error).toContain('openssl rand -base64 32');
      });

      it('should reject 31-character key', () => {
        const key31 = 'a'.repeat(31);
        const result = validateEncryptionKey(key31);

        expect(result.valid).toBe(false);
        expect(result.error).toContain('at least 32 characters');
      });

      it('should accept exactly 32-character key', () => {
        const key32 = 'abcdefghijklmnopqrstuvwxyz012345';
        const result = validateEncryptionKey(key32);

        expect(result.valid).toBe(true);
      });

      it('should reject empty string', () => {
        const result = validateEncryptionKey('');

        expect(result.valid).toBe(false);
        expect(result.error).toContain('non-empty string');
      });

      it('should reject null', () => {
        const result = validateEncryptionKey(null as any);

        expect(result.valid).toBe(false);
        expect(result.error).toContain('non-empty string');
      });

      it('should reject undefined', () => {
        const result = validateEncryptionKey(undefined as any);

        expect(result.valid).toBe(false);
        expect(result.error).toContain('non-empty string');
      });
    });

    describe('weak pattern detection', () => {
      it('should reject all-same-character key', () => {
        const sameCharKey = 'a'.repeat(32);
        const result = validateEncryptionKey(sameCharKey);

        expect(result.valid).toBe(false);
        expect(result.error).toContain('all same character');
      });

      it('should reject all-zeros key', () => {
        const zerosKey = '0'.repeat(32);
        const result = validateEncryptionKey(zerosKey);

        expect(result.valid).toBe(false);
        expect(result.error).toContain('all zeros');
      });

      it('should reject sequential hex pattern', () => {
        const hexPattern = '0123456789abcdef'.repeat(2);
        const result = validateEncryptionKey(hexPattern);

        expect(result.valid).toBe(false);
        expect(result.error).toContain('sequential hex pattern');
      });

      it('should reject sequential hex pattern (uppercase)', () => {
        const hexPattern = '0123456789ABCDEF'.repeat(2);
        const result = validateEncryptionKey(hexPattern);

        expect(result.valid).toBe(false);
        expect(result.error).toContain('sequential hex pattern');
      });

      it('should reject key with low entropy despite length', () => {
        // abcdefghijklmnopqrstuvwxyz has 26 unique chars, so it passes entropy
        // but this test verifies that obvious patterns still fail entropy if repeated
        const alphabetPattern = 'abcdabcdabcdabcdabcdabcdabcdabcd'; // Only 4 unique
        const result = validateEncryptionKey(alphabetPattern);

        expect(result.valid).toBe(false);
        expect(result.error).toContain('insufficient entropy');
      });
    });

    describe('placeholder detection', () => {
      const placeholders = [
        'changeme',
        'example',
        'test',
        'demo',
        'password',
        'secret',
        'default',
        'placeholder',
        'temp',
        'temporary',
      ];

      placeholders.forEach((placeholder) => {
        it(`should reject key containing "${placeholder}"`, () => {
          const key = placeholder + '-' + 'x'.repeat(32);
          const result = validateEncryptionKey(key);

          expect(result.valid).toBe(false);
          expect(result.error).toContain(placeholder);
          expect(result.error).toContain('openssl rand -base64 32');
        });

        it(`should reject key containing "${placeholder}" (case insensitive)`, () => {
          const key = placeholder.toUpperCase() + '-' + 'x'.repeat(32);
          const result = validateEncryptionKey(key);

          expect(result.valid).toBe(false);
          expect(result.error).toContain(placeholder);
        });
      });

      it('should reject key with multiple placeholders', () => {
        const key = 'changeme-test-example-secret-1234567890';
        const result = validateEncryptionKey(key);

        expect(result.valid).toBe(false);
        // Will catch first placeholder in the list
        expect(result.error).toContain('placeholder word');
      });
    });

    describe('entropy validation', () => {
      it('should reject key with insufficient unique characters', () => {
        const lowEntropyKey = 'abababababababababababababababab'; // Only 2 unique chars
        const result = validateEncryptionKey(lowEntropyKey);

        expect(result.valid).toBe(false);
        expect(result.error).toContain('insufficient entropy');
        expect(result.error).toContain('2 unique characters');
      });

      it('should reject key with only 5 unique characters', () => {
        const lowEntropyKey = 'abcdeabcdeabcdeabcdeabcdeabcdeab';
        const result = validateEncryptionKey(lowEntropyKey);

        expect(result.valid).toBe(false);
        expect(result.error).toContain('insufficient entropy');
      });

      it('should accept key with 10 unique characters (minimum)', () => {
        const minEntropyKey = 'abcdefghij'.repeat(4).substring(0, 32);
        const result = validateEncryptionKey(minEntropyKey);

        expect(result.valid).toBe(true);
      });

      it('should accept key with high entropy', () => {
        const highEntropyKey = 'aB1!cD2@eF3#gH4$iJ5%kL6^mN7&oP8*';
        const result = validateEncryptionKey(highEntropyKey);

        expect(result.valid).toBe(true);
      });
    });

    describe('real-world examples', () => {
      it('should reject AWS example access key', () => {
        const awsExample = 'AKIAIOSFODNN7EXAMPLEabcdefghij12'; // 32 chars
        const result = validateEncryptionKey(awsExample);

        expect(result.valid).toBe(false);
        expect(result.error).toContain('example');
      });

      it('should reject common weak keys', () => {
        const weakKeys = [
          'your-encryption-key-here-123456', // 32 chars, has "test" pattern
          'please-changeme-this-key-12345678', // 34 chars, has "changeme"
          'test-key-for-development-only-1234', // 35 chars, has "test"
          'default-encryption-key-value-123456', // 36 chars, has "default"
        ];

        weakKeys.forEach((weakKey) => {
          const result = validateEncryptionKey(weakKey);
          expect(result.valid).toBe(false);
        });
      });

      it('should accept OpenSSL generated keys', () => {
        // Simulated output from: openssl rand -base64 32
        const opensslKey = 'L8zM3N2vB4xW5yC6dE7fG8hA9jK0lP1q';
        const result = validateEncryptionKey(opensslKey);

        expect(result.valid).toBe(true);
      });

      it('should accept UUID-based keys', () => {
        const uuidKey = '550e8400-e29b-41d4-a716-446655440000';
        const result = validateEncryptionKey(uuidKey);

        expect(result.valid).toBe(true);
      });
    });
  });

  describe('validateEncryptionKeyOrThrow', () => {
    it('should not throw for valid key', () => {
      const validKey = 'x7K9mP2vN8qR4tY6wE3sA5dF1gH0jL9z';

      expect(() => {
        validateEncryptionKeyOrThrow(validKey);
      }).not.toThrow();
    });

    it('should throw error for invalid key', () => {
      const invalidKey = 'too-short';

      expect(() => {
        validateEncryptionKeyOrThrow(invalidKey);
      }).toThrow('at least 32 characters');
    });

    it('should throw error for weak key', () => {
      const weakKey = 'a'.repeat(32);

      expect(() => {
        validateEncryptionKeyOrThrow(weakKey);
      }).toThrow('all same character');
    });

    it('should throw error for placeholder key', () => {
      const placeholderKey = 'changeme-' + 'x'.repeat(30);

      expect(() => {
        validateEncryptionKeyOrThrow(placeholderKey);
      }).toThrow('placeholder word');
    });
  });

  describe('getKeyGenerationCommand', () => {
    it('should return OpenSSL command', () => {
      const command = getKeyGenerationCommand();

      expect(command).toBe('openssl rand -base64 32');
    });
  });
});
