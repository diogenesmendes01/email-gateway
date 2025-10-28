"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_ENCRYPTION_CONFIG = void 0;
exports.deriveKey = deriveKey;
exports.encrypt = encrypt;
exports.decrypt = decrypt;
exports.serializeEncrypted = serializeEncrypted;
exports.deserializeEncrypted = deserializeEncrypted;
exports.generateHmacSha256 = generateHmacSha256;
exports.generateSha256 = generateSha256;
exports.constantTimeCompare = constantTimeCompare;
exports.compareHashesSafe = compareHashesSafe;
exports.isValidHash = isValidHash;
exports.normalizeCpfCnpjForHash = normalizeCpfCnpjForHash;
exports.hashCpfCnpjHmac = hashCpfCnpjHmac;
exports.hashCpfCnpjSha256 = hashCpfCnpjSha256;
exports.encryptCpfCnpj = encryptCpfCnpj;
exports.decryptCpfCnpj = decryptCpfCnpj;
const crypto = __importStar(require("crypto"));
exports.DEFAULT_ENCRYPTION_CONFIG = {
    algorithm: 'aes-256-gcm',
    keyLength: 32,
    ivLength: 16,
    tagLength: 16,
};
function deriveKey(password, salt, iterations = 100000) {
    return crypto.pbkdf2Sync(password, salt, iterations, 32, 'sha256');
}
function encrypt(data, key, config = exports.DEFAULT_ENCRYPTION_CONFIG) {
    const iv = crypto.randomBytes(config.ivLength);
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
    const encrypted = Buffer.concat([
        cipher.update(data, 'utf8'),
        cipher.final(),
    ]);
    const tag = Buffer.alloc(16);
    return {
        encrypted,
        iv,
        tag,
    };
}
function decrypt(encrypted, key, iv, _tag, _config = exports.DEFAULT_ENCRYPTION_CONFIG) {
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    const decrypted = Buffer.concat([
        decipher.update(encrypted),
        decipher.final(),
    ]);
    return decrypted.toString('utf8');
}
function serializeEncrypted(encrypted, iv, tag) {
    const combined = Buffer.concat([iv, tag, encrypted]);
    return combined.toString('base64');
}
function deserializeEncrypted(serialized, config = exports.DEFAULT_ENCRYPTION_CONFIG) {
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
function generateHmacSha256(data, secret) {
    return crypto
        .createHmac('sha256', secret)
        .update(data)
        .digest('hex');
}
function generateSha256(data) {
    return crypto
        .createHash('sha256')
        .update(data)
        .digest('hex');
}
function constantTimeCompare(a, b) {
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
function compareHashesSafe(hash1, hash2) {
    if (!isValidHash(hash1) || !isValidHash(hash2)) {
        return false;
    }
    return constantTimeCompare(hash1, hash2);
}
function isValidHash(hash, algorithm = 'sha256') {
    if (!hash || typeof hash !== 'string') {
        return false;
    }
    const expectedLength = algorithm === 'sha256' ? 64 : 64;
    const hexPattern = /^[a-f0-9]+$/i;
    return hash.length === expectedLength && hexPattern.test(hash);
}
function normalizeCpfCnpjForHash(cpfCnpj) {
    return cpfCnpj.replace(/\D/g, '');
}
function hashCpfCnpjHmac(cpfCnpj, secret) {
    const normalized = normalizeCpfCnpjForHash(cpfCnpj);
    return generateHmacSha256(normalized, secret);
}
function hashCpfCnpjSha256(cpfCnpj) {
    const normalized = normalizeCpfCnpjForHash(cpfCnpj);
    return generateSha256(normalized);
}
function encryptCpfCnpj(cpfCnpj, password, salt) {
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
function decryptCpfCnpj(encrypted, password, salt) {
    const saltBuffer = Buffer.from(salt, 'base64');
    const key = deriveKey(password, saltBuffer);
    const { encrypted: encryptedBuffer, iv, tag } = deserializeEncrypted(encrypted);
    return decrypt(encryptedBuffer, key, iv, tag);
}
//# sourceMappingURL=encryption.util.js.map