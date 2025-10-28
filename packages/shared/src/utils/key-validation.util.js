"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.KEY_VALIDATION_CONSTRAINTS = void 0;
exports.validateEncryptionKey = validateEncryptionKey;
exports.getKeyGenerationCommand = getKeyGenerationCommand;
exports.validateEncryptionKeyOrThrow = validateEncryptionKeyOrThrow;
exports.KEY_VALIDATION_CONSTRAINTS = {
    MIN_KEY_LENGTH: 32,
    MIN_UNIQUE_CHARS: 10,
};
function validateEncryptionKey(key) {
    if (!key || typeof key !== 'string') {
        return {
            valid: false,
            error: 'ENCRYPTION_KEY must be a non-empty string',
        };
    }
    if (key.length < exports.KEY_VALIDATION_CONSTRAINTS.MIN_KEY_LENGTH) {
        return {
            valid: false,
            error: `ENCRYPTION_KEY must be at least ${exports.KEY_VALIDATION_CONSTRAINTS.MIN_KEY_LENGTH} characters (256 bits). Generate with: openssl rand -base64 32`,
        };
    }
    const weakPatterns = [
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
    const uniqueChars = new Set(key).size;
    if (uniqueChars < exports.KEY_VALIDATION_CONSTRAINTS.MIN_UNIQUE_CHARS) {
        return {
            valid: false,
            error: `ENCRYPTION_KEY has insufficient entropy (only ${uniqueChars} unique characters, minimum ${exports.KEY_VALIDATION_CONSTRAINTS.MIN_UNIQUE_CHARS}). Generate a strong key with: openssl rand -base64 32`,
        };
    }
    return { valid: true };
}
function getKeyGenerationCommand() {
    return 'openssl rand -base64 32';
}
function validateEncryptionKeyOrThrow(key) {
    const result = validateEncryptionKey(key);
    if (!result.valid) {
        throw new Error(result.error);
    }
}
//# sourceMappingURL=key-validation.util.js.map