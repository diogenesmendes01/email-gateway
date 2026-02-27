/**
 * Tests for Encryption Key Validation
 * TASK-007: Ensure weak keys are rejected
 */

import { validateEncryptionKey, getKeyGenerationHelp } from './key-validation';

describe('validateEncryptionKey', () => {
  describe('Length validation', () => {
    it('should reject keys shorter than 32 characters', () => {
      const result = validateEncryptionKey('short');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('at least 32 characters');
    });

    it('should accept keys exactly 32 characters', () => {
      const result = validateEncryptionKey('x7K9mP2vN8qR4tY6wE3sA5dF1gH0jL9z');
      expect(result.valid).toBe(true);
    });

    it('should accept keys longer than 32 characters', () => {
      const result = validateEncryptionKey('x7K9mP2vN8qR4tY6wE3sA5dF1gH0jL9zU4vB7nM3kP8w');
      expect(result.valid).toBe(true);
    });
  });

  describe('Weak pattern detection', () => {
    it('should reject all-same-character keys', () => {
      const result = validateEncryptionKey('a'.repeat(32));
      expect(result.valid).toBe(false);
      expect(result.error).toContain('All characters are the same');
    });

    it('should reject all-zeros keys', () => {
      const result = validateEncryptionKey('0'.repeat(32));
      expect(result.valid).toBe(false);
      // All-zeros also matches the all-same-character pattern (checked first)
      expect(result.error).toContain('All characters are the same');
    });

    it('should reject sequential hex pattern', () => {
      const result = validateEncryptionKey('0123456789abcdef0123456789abcdef');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Sequential hex pattern');
    });

    it('should reject keys with placeholder words - changeme', () => {
      const result = validateEncryptionKey('changeme123456789012345678901234');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Contains placeholder word');
    });

    it('should reject keys with placeholder words - test', () => {
      const result = validateEncryptionKey('test1234567890123456789012345678');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Contains placeholder word');
    });

    it('should reject keys with placeholder words - example (case insensitive)', () => {
      const result = validateEncryptionKey('EXAMPLE1234567890123456789012345');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Contains placeholder word');
    });

    it('should reject keys with placeholder words - password', () => {
      const result = validateEncryptionKey('password123456789012345678901234');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Contains placeholder word');
    });

    it('should reject keys with placeholder words - secret', () => {
      const result = validateEncryptionKey('secret12345678901234567890123456');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Contains placeholder word');
    });

    it('should reject keys with placeholder words - demo', () => {
      const result = validateEncryptionKey('demo1234567890123456789012345678');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Contains placeholder word');
    });
  });

  describe('Entropy validation', () => {
    it('should reject keys with insufficient unique characters', () => {
      // Only 10 unique chars: a, A, b, B, c, C, d, D, e, E
      const result = validateEncryptionKey('aAbBcCdDeEaAbBcCdDeEaAbBcCdDeEaa');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('insufficient entropy');
      expect(result.error).toContain('10/16');
    });

    it('should accept keys with exactly 16 unique characters', () => {
      // Exactly 16 unique chars without sequential patterns (abc/123/xyz/789/012)
      const result = validateEncryptionKey('gHjKmNpRtVwZaDeFgHjKmNpRtVwZaDeF');
      expect(result.valid).toBe(true);
    });

    it('should accept keys with more than 16 unique characters', () => {
      // More than 16 unique chars without sequential patterns
      const result = validateEncryptionKey('gHjKmNpRtVwZaDeFqSuBhJkLnPrTvWxY');
      expect(result.valid).toBe(true);
    });
  });

  describe('Sequential pattern detection', () => {
    it('should reject short keys with abc pattern', () => {
      // 17 unique chars so entropy passes, but contains 'abc' and length < 48
      const result = validateEncryptionKey('abcGHJKMNPQRSTUVWabcGHJKMNPQRSTU');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('sequential patterns');
    });

    it('should reject short keys with 123 pattern', () => {
      // 17 unique chars so entropy passes, but contains '123' and length < 48
      const result = validateEncryptionKey('123GHJKMNPQRSTUVW123GHJKMNPQRSTU');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('sequential patterns');
    });

    it('should accept longer keys with sequential patterns (48+ chars)', () => {
      // Contains '123' but key is >= 48 chars so sequential check is skipped
      const result = validateEncryptionKey('123gHjKmNpRtVwZaDeFgHjKmNpRtVwZaDeFgHjKmNpRtVwZaDeF');
      expect(result.valid).toBe(true);
    });
  });

  describe('Strong keys from real key generators', () => {
    it('should accept strong random key from openssl', () => {
      // Example from: openssl rand -base64 32
      const strongKey = 'x7K9mP2vN8qR4tY6wE3sA5dF1gH0jL9zU4vB7nM3kP8w';
      const result = validateEncryptionKey(strongKey);
      expect(result.valid).toBe(true);
    });

    it('should accept key with high entropy and special characters', () => {
      const strongKey = 'Kj8#mNq2$pLs9*xRt4&vWz7!bFy3@gHc5';
      const result = validateEncryptionKey(strongKey);
      expect(result.valid).toBe(true);
    });

    it('should accept real base64 key', () => {
      const strongKey = 'Q2xhdWRlIENvZGUgR2F0ZXdheSBTZWN1cmUgS2V5IDIwMjU=';
      const result = validateEncryptionKey(strongKey);
      expect(result.valid).toBe(true);
    });
  });

  describe('Edge cases', () => {
    it('should handle exactly 16 unique chars with repetition', () => {
      // 16 unique chars (g,H,j,K,m,N,p,R,t,V,w,Z,a,D,e,F) without sequential patterns
      const result = validateEncryptionKey('gHjKmNpRtVwZaDeFgHjKmNpRtVwZaDeF');
      expect(result.valid).toBe(true);
    });

    it('should handle 15 unique chars (should fail)', () => {
      // 15 unique chars (g,H,j,K,m,N,p,R,t,V,w,Z,a,D,e) without sequential patterns
      const result = validateEncryptionKey('gHjKmNpRtVwZaDeHjKmNpRtVwZaDeggg');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('15/16');
    });
  });
});

describe('getKeyGenerationHelp', () => {
  it('should return help message with openssl command', () => {
    const help = getKeyGenerationHelp();
    expect(help).toContain('openssl rand -base64 32');
  });

  it('should return help message with Node.js command', () => {
    const help = getKeyGenerationHelp();
    expect(help).toContain('node -e');
    expect(help).toContain('crypto');
    expect(help).toContain('randomBytes');
  });

  it('should return help message with PowerShell command', () => {
    const help = getKeyGenerationHelp();
    expect(help).toContain('PowerShell');
  });

  it('should return multi-line formatted message', () => {
    const help = getKeyGenerationHelp();
    const lines = help.split('\n');
    expect(lines.length).toBeGreaterThan(5);
  });
});
