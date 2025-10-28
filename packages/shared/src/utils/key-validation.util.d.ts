export declare const KEY_VALIDATION_CONSTRAINTS: {
    readonly MIN_KEY_LENGTH: 32;
    readonly MIN_UNIQUE_CHARS: 10;
};
export interface KeyValidationResult {
    valid: boolean;
    error?: string;
}
export declare function validateEncryptionKey(key: string): KeyValidationResult;
export declare function getKeyGenerationCommand(): string;
export declare function validateEncryptionKeyOrThrow(key: string): void;
