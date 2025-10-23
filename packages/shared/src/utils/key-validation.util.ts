/**
 * @email-gateway/shared - Encryption Key Validation
 *
 * Utilities for validating encryption keys to prevent weak or placeholder values
 *
 * PR-BACKLOG: [PR18-TASK-8.1-03] Melhorar validação de ENCRYPTION_KEY
 */

export interface KeyValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Validates encryption key strength to prevent weak or placeholder keys
 *
 * Checks:
 * - Minimum length (32 characters / 256 bits)
 * - No weak patterns (repeated characters, sequential patterns)
 * - No common placeholder words
 * - Sufficient entropy (unique characters)
 *
 * @param key - Encryption key to validate
 * @returns Validation result with error message if invalid
 *
 * @example
 * ```typescript
 * // ❌ Weak key - all same character
 * validateEncryptionKey('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')
 * // => { valid: false, error: 'ENCRYPTION_KEY appears to be weak (all same character)' }
 *
 * // ❌ Placeholder key
 * validateEncryptionKey('changeme-please-changeme-please')
 * // => { valid: false, error: 'ENCRYPTION_KEY contains placeholder words' }
 *
 * // ✅ Strong key
 * validateEncryptionKey('x7K9mP2vN8qR4tY6wE3sA5dF1gH0jL9z')
 * // => { valid: true }
 * ```
 */
export function validateEncryptionKey(key: string): KeyValidationResult {
  // 1. Basic validation
  if (!key || typeof key !== 'string') {
    return {
      valid: false,
      error: 'ENCRYPTION_KEY must be a non-empty string',
    };
  }

  // 2. Length check (minimum 32 characters / 256 bits)
  if (key.length < 32) {
    return {
      valid: false,
      error: 'ENCRYPTION_KEY must be at least 32 characters (256 bits). Generate with: openssl rand -base64 32',
    };
  }

  // 3. Blacklist weak patterns
  const weakPatterns: Array<{ pattern: RegExp; message: string }> = [
    {
      pattern: /^0+$/,
      message: 'ENCRYPTION_KEY appears to be weak (all zeros)',
    },
    {
      pattern: /^(.)\1+$/,
      message: 'ENCRYPTION_KEY appears to be weak (all same character)',
    },
    {
      pattern: /^(0123456789abcdef)+$/i,
      message: 'ENCRYPTION_KEY appears to be weak (sequential hex pattern)',
    },
  ];

  for (const { pattern, message } of weakPatterns) {
    if (pattern.test(key)) {
      return {
        valid: false,
        error: message,
      };
    }
  }

  // 4. Check for placeholder words (order matters - check longer words first)
  const placeholderWords = [
    'temporary',
    'placeholder',
    'changeme',
    'password',
    'example',
    'default',
    'secret',
    'demo',
    'temp',
    'test',
  ];

  const keyLower = key.toLowerCase();
  for (const word of placeholderWords) {
    if (keyLower.includes(word)) {
      return {
        valid: false,
        error: `ENCRYPTION_KEY contains placeholder word "${word}". Generate a strong key with: openssl rand -base64 32`,
      };
    }
  }

  // 5. Entropy check (simplified - unique characters)
  const uniqueChars = new Set(key).size;
  const minUniqueChars = 10; // At least 10 different characters

  if (uniqueChars < minUniqueChars) {
    return {
      valid: false,
      error: `ENCRYPTION_KEY has insufficient entropy (only ${uniqueChars} unique characters, minimum ${minUniqueChars}). Generate a strong key with: openssl rand -base64 32`,
    };
  }

  // 6. All checks passed
  return { valid: true };
}

/**
 * Generates a strong encryption key suggestion command
 *
 * @returns Command to generate a strong key
 */
export function getKeyGenerationCommand(): string {
  return 'openssl rand -base64 32';
}

/**
 * Validates encryption key and throws error if invalid
 *
 * @param key - Encryption key to validate
 * @throws Error if key is invalid
 *
 * @example
 * ```typescript
 * try {
 *   validateEncryptionKeyOrThrow(process.env.ENCRYPTION_KEY);
 *   console.log('✅ ENCRYPTION_KEY is valid');
 * } catch (error) {
 *   console.error('❌ Invalid ENCRYPTION_KEY:', error.message);
 *   process.exit(1);
 * }
 * ```
 */
export function validateEncryptionKeyOrThrow(key: string): void {
  const result = validateEncryptionKey(key);

  if (!result.valid) {
    throw new Error(result.error);
  }
}
