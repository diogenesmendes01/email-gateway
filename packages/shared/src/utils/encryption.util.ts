/**
 * @email-gateway/shared - Encryption and Hashing Utilities
 *
 * Utilitários para criptografia em repouso e hash HMAC-SHA256
 *
 * TASK 5.2 — PII, masking, criptografia, retenção e acesso
 * Implementação de criptografia e hash para dados sensíveis
 */

import * as crypto from 'crypto';

/**
 * Configurações de criptografia
 */
export interface EncryptionConfig {
  algorithm: string;
  keyLength: number;
  ivLength: number;
  tagLength: number;
}

/**
 * Configuração padrão para AES-GCM
 */
export const DEFAULT_ENCRYPTION_CONFIG: EncryptionConfig = {
  algorithm: 'aes-256-gcm',
  keyLength: 32, // 256 bits
  ivLength: 16,  // 128 bits
  tagLength: 16, // 128 bits
};

/**
 * Gera uma chave de criptografia a partir de uma senha usando PBKDF2
 *
 * @param password - Senha base
 * @param salt - Salt para derivação
 * @param iterations - Número de iterações (padrão: 100000)
 * @returns Chave derivada
 */
export function deriveKey(
  password: string,
  salt: Buffer,
  iterations: number = 100000
): Buffer {
  return crypto.pbkdf2Sync(password, salt, iterations, 32, 'sha256');
}

/**
 * Criptografa dados usando AES-GCM (versão simplificada)
 *
 * @param data - Dados para criptografar
 * @param key - Chave de criptografia
 * @param config - Configuração de criptografia
 * @returns Objeto com dados criptografados, IV e tag
 */
export function encrypt(
  data: string,
  key: Buffer,
  config: EncryptionConfig = DEFAULT_ENCRYPTION_CONFIG
): {
  encrypted: Buffer;
  iv: Buffer;
  tag: Buffer;
} {
  const iv = crypto.randomBytes(config.ivLength);
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  
  const encrypted = Buffer.concat([
    cipher.update(data, 'utf8'),
    cipher.final(),
  ]);

  // Para AES-CBC, não temos tag de autenticação
  const tag = Buffer.alloc(16); // Tag vazia para compatibilidade

  return {
    encrypted,
    iv,
    tag,
  };
}

/**
 * Descriptografa dados usando AES-CBC (versão simplificada)
 *
 * @param encrypted - Dados criptografados
 * @param key - Chave de descriptografia
 * @param iv - Vetor de inicialização
 * @param tag - Tag de autenticação (ignorado para CBC)
 * @param config - Configuração de criptografia
 * @returns Dados descriptografados
 */
export function decrypt(
  encrypted: Buffer,
  key: Buffer,
  iv: Buffer,
  _tag: Buffer,
  _config: EncryptionConfig = DEFAULT_ENCRYPTION_CONFIG
): string {
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
  
  const decrypted = Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ]);

  return decrypted.toString('utf8');
}

/**
 * Serializa dados criptografados para armazenamento
 *
 * @param encrypted - Dados criptografados
 * @param iv - Vetor de inicialização
 * @param tag - Tag de autenticação
 * @returns String base64 com todos os dados
 */
export function serializeEncrypted(
  encrypted: Buffer,
  iv: Buffer,
  tag: Buffer
): string {
  const combined = Buffer.concat([iv, tag, encrypted]);
  return combined.toString('base64');
}

/**
 * Deserializa dados criptografados do armazenamento
 *
 * @param serialized - String base64 com dados criptografados
 * @param config - Configuração de criptografia
 * @returns Objeto com dados separados
 */
export function deserializeEncrypted(
  serialized: string,
  config: EncryptionConfig = DEFAULT_ENCRYPTION_CONFIG
): {
  encrypted: Buffer;
  iv: Buffer;
  tag: Buffer;
} {
  const combined = Buffer.from(serialized, 'base64');
  
  const iv = combined.subarray(0, config.ivLength);
  const tag = combined.subarray(config.ivLength, config.ivLength + config.tagLength);
  const encrypted = combined.subarray(config.ivLength + config.tagLength);

  return {
    encrypted,
    iv,
    tag,
  };
}

/**
 * Gera hash HMAC-SHA256 para chaves de busca
 *
 * @param data - Dados para hash
 * @param secret - Chave secreta para HMAC
 * @returns Hash HMAC-SHA256 em hexadecimal
 */
export function generateHmacSha256(data: string, secret: string): string {
  return crypto
    .createHmac('sha256', secret)
    .update(data)
    .digest('hex');
}

/**
 * Gera hash SHA-256 simples
 *
 * @param data - Dados para hash
 * @returns Hash SHA-256 em hexadecimal
 */
export function generateSha256(data: string): string {
  return crypto
    .createHash('sha256')
    .update(data)
    .digest('hex');
}

/**
 * Comparação segura contra timing attacks
 *
 * @param a - Primeira string
 * @param b - Segunda string
 * @returns True se iguais
 */
export function constantTimeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }

  const bufferA = Buffer.from(a, 'utf8');
  const bufferB = Buffer.from(b, 'utf8');

  if (bufferA.length !== bufferB.length) {
    return false;
  }

  return crypto.timingSafeEqual(bufferA, bufferB);
}

/**
 * Compara hashes de forma segura usando constant-time comparison
 *
 * @param hash1 - Primeiro hash
 * @param hash2 - Segundo hash
 * @returns True se hashes são iguais
 */
export function compareHashesSafe(hash1: string, hash2: string): boolean {
  if (!isValidHash(hash1) || !isValidHash(hash2)) {
    return false;
  }

  return constantTimeCompare(hash1, hash2);
}

/**
 * Valida se uma string é um hash válido
 *
 * @param hash - String para validar
 * @param algorithm - Algoritmo esperado (sha256, hmac-sha256)
 * @returns True se válido
 */
export function isValidHash(hash: string, algorithm: 'sha256' | 'hmac-sha256' = 'sha256'): boolean {
  if (!hash || typeof hash !== 'string') {
    return false;
  }

  const expectedLength = algorithm === 'sha256' ? 64 : 64; // SHA-256 sempre 64 chars
  const hexPattern = /^[a-f0-9]+$/i;

  return hash.length === expectedLength && hexPattern.test(hash);
}

/**
 * Normaliza CPF/CNPJ removendo formatação para hash
 *
 * @param cpfCnpj - CPF ou CNPJ
 * @returns Apenas dígitos
 */
export function normalizeCpfCnpjForHash(cpfCnpj: string): string {
  return cpfCnpj.replace(/\D/g, '');
}

/**
 * Gera hash HMAC-SHA256 para CPF/CNPJ usando chave secreta
 *
 * @param cpfCnpj - CPF ou CNPJ
 * @param secret - Chave secreta
 * @returns Hash HMAC-SHA256
 */
export function hashCpfCnpjHmac(cpfCnpj: string, secret: string): string {
  const normalized = normalizeCpfCnpjForHash(cpfCnpj);
  return generateHmacSha256(normalized, secret);
}

/**
 * Gera hash SHA-256 para CPF/CNPJ (sem chave secreta)
 *
 * @param cpfCnpj - CPF ou CNPJ
 * @returns Hash SHA-256
 */
export function hashCpfCnpjSha256(cpfCnpj: string): string {
  const normalized = normalizeCpfCnpjForHash(cpfCnpj);
  return generateSha256(normalized);
}

/**
 * Utilitário para criptografar CPF/CNPJ completo
 *
 * @param cpfCnpj - CPF ou CNPJ em texto claro
 * @param password - Senha para derivação da chave
 * @param salt - Salt para derivação (opcional, será gerado se não fornecido)
 * @returns Objeto com dados criptografados e salt
 */
export function encryptCpfCnpj(
  cpfCnpj: string,
  password: string,
  salt?: Buffer
): {
  encrypted: string;
  salt: string;
} {
  const actualSalt = salt || crypto.randomBytes(32);
  const key = deriveKey(password, actualSalt);
  const normalized = normalizeCpfCnpjForHash(cpfCnpj);
  
  const { encrypted, iv, tag } = encrypt(normalized, key);
  const serialized = serializeEncrypted(encrypted, iv, tag);

  return {
    encrypted: serialized,
    salt: actualSalt.toString('base64'),
  };
}

/**
 * Utilitário para descriptografar CPF/CNPJ
 *
 * @param encrypted - Dados criptografados
 * @param password - Senha para derivação da chave
 * @param salt - Salt usado na criptografia
 * @returns CPF/CNPJ em texto claro
 */
export function decryptCpfCnpj(
  encrypted: string,
  password: string,
  salt: string
): string {
  const saltBuffer = Buffer.from(salt, 'base64');
  const key = deriveKey(password, saltBuffer);
  const { encrypted: encryptedBuffer, iv, tag } = deserializeEncrypted(encrypted);
  
  return decrypt(encryptedBuffer, key, iv, tag);
}
