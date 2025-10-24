/**
 * Encryption Key Validation Utility
 *
 * Validates encryption keys to ensure they meet security requirements:
 * - Minimum length (32 characters / 256 bits)
 * - Sufficient entropy (unique characters)
 * - No weak patterns (all same char, sequential, etc.)
 * - No common placeholders (changeme, test, etc.)
 *
 * TASK-007: Prevent weak encryption keys from being used
 */

export interface KeyValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Validates an encryption key for security requirements
 *
 * @param key - The encryption key to validate
 * @returns Validation result with error message if invalid
 *
 * @example
 * ```typescript
 * const result = validateEncryptionKey(process.env.ENCRYPTION_KEY);
 * if (!result.valid) {
 *   console.error(result.error);
 *   process.exit(1);
 * }
 * ```
 */
export function validateEncryptionKey(key: string): KeyValidationResult {
  // 1. Length check (minimum 32 characters for AES-256)
  if (key.length < 32) {
    return {
      valid: false,
      error: 'ENCRYPTION_KEY must be at least 32 characters (256 bits)',
    };
  }

  // 2. Blacklist weak patterns
  const weakPatterns = [
    { pattern: /^(.)\1+$/, message: 'All characters are the same' }, // All same character (e.g., "aaaa...")
    { pattern: /^0+$/, message: 'All zeros' }, // All zeros
    { pattern: /^(0123456789abcdef)+$/, message: 'Sequential hex pattern' }, // Sequential hex
    { pattern: /changeme|example|test|demo|password|secret/i, message: 'Contains placeholder word' }, // Common placeholders
  ];

  for (const { pattern, message } of weakPatterns) {
    if (pattern.test(key)) {
      return {
        valid: false,
        error: `ENCRYPTION_KEY is weak: ${message}. Use a cryptographically random key.`,
      };
    }
  }

  // 3. Entropy check - require at least 16 unique characters
  const uniqueChars = new Set(key).size;
  if (uniqueChars < 16) {
    return {
      valid: false,
      error: `ENCRYPTION_KEY has insufficient entropy (${uniqueChars}/16 unique characters required).`,
    };
  }

  // 4. Check for sequential patterns (only if key is short)
  const hasSequential = /(?:abc|123|xyz|789|012)/i.test(key);
  if (hasSequential && key.length < 48) {
    return {
      valid: false,
      error: 'ENCRYPTION_KEY contains sequential patterns. Use a truly random key.',
    };
  }

  // All checks passed
  return { valid: true };
}

/**
 * Generates help message for creating a strong encryption key
 *
 * @returns Multi-line help message with commands
 */
export function getKeyGenerationHelp(): string {
  return `
Generate a strong encryption key with one of these commands:

  Option 1 (OpenSSL):
    openssl rand -base64 32

  Option 2 (Node.js):
    node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"

  Option 3 (PowerShell):
    -join ((65..90) + (97..122) + (48..57) | Get-Random -Count 32 | % {[char]$_})
`.trim();
}
