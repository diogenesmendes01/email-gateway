export interface EncryptionConfig {
    algorithm: string;
    keyLength: number;
    ivLength: number;
    tagLength: number;
}
export declare const DEFAULT_ENCRYPTION_CONFIG: EncryptionConfig;
export declare function deriveKey(password: string, salt: Buffer, iterations?: number): Buffer;
export declare function encrypt(data: string, key: Buffer, config?: EncryptionConfig): {
    encrypted: Buffer;
    iv: Buffer;
    tag: Buffer;
};
export declare function decrypt(encrypted: Buffer, key: Buffer, iv: Buffer, _tag: Buffer, _config?: EncryptionConfig): string;
export declare function serializeEncrypted(encrypted: Buffer, iv: Buffer, tag: Buffer): string;
export declare function deserializeEncrypted(serialized: string, config?: EncryptionConfig): {
    encrypted: Buffer;
    iv: Buffer;
    tag: Buffer;
};
export declare function generateHmacSha256(data: string, secret: string): string;
export declare function generateSha256(data: string): string;
export declare function constantTimeCompare(a: string, b: string): boolean;
export declare function compareHashesSafe(hash1: string, hash2: string): boolean;
export declare function isValidHash(hash: string, algorithm?: 'sha256' | 'hmac-sha256'): boolean;
export declare function normalizeCpfCnpjForHash(cpfCnpj: string): string;
export declare function hashCpfCnpjHmac(cpfCnpj: string, secret: string): string;
export declare function hashCpfCnpjSha256(cpfCnpj: string): string;
export declare function encryptCpfCnpj(cpfCnpj: string, password: string, salt?: Buffer): {
    encrypted: string;
    salt: string;
};
export declare function decryptCpfCnpj(encrypted: string, password: string, salt: string): string;
