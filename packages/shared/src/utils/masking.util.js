"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.maskCPF = maskCPF;
exports.maskCNPJ = maskCNPJ;
exports.maskCPFOrCNPJ = maskCPFOrCNPJ;
exports.maskEmail = maskEmail;
exports.maskName = maskName;
exports.maskObject = maskObject;
exports.normalizeCPFOrCNPJ = normalizeCPFOrCNPJ;
exports.isValidCPFFormat = isValidCPFFormat;
exports.isValidCNPJFormat = isValidCNPJFormat;
exports.hashCPFOrCNPJ = hashCPFOrCNPJ;
exports.maskLogString = maskLogString;
function maskCPF(cpf) {
    if (!cpf)
        return '***.***.***-**';
    const digits = cpf.replace(/\D/g, '');
    if (digits.length !== 11) {
        return '***.***.***-**';
    }
    return `***.***.***-${digits.slice(-2)}`;
}
function maskCNPJ(cnpj) {
    if (!cnpj)
        return '**.***.***/****-**';
    const digits = cnpj.replace(/\D/g, '');
    if (digits.length !== 14) {
        return '**.***.***/****-**';
    }
    return `**.***.***/****-${digits.slice(-2)}`;
}
function maskCPFOrCNPJ(cpfCnpj) {
    if (!cpfCnpj)
        return '***.***.***-**';
    const digits = cpfCnpj.replace(/\D/g, '');
    if (digits.length === 11) {
        return maskCPF(cpfCnpj);
    }
    else if (digits.length === 14) {
        return maskCNPJ(cpfCnpj);
    }
    return '***.***.***-**';
}
function maskEmail(email) {
    if (!email)
        return '***@***.***';
    const parts = email.split('@');
    if (parts.length !== 2) {
        return '***@***.***';
    }
    const [localPart, domain] = parts;
    if (!localPart || !domain) {
        return '***@***.***';
    }
    const maskedLocal = localPart.length > 0
        ? `${localPart[0]}***`
        : '***';
    return `${maskedLocal}@${domain}`;
}
function maskName(name) {
    if (!name)
        return '***';
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) {
        return parts[0] || '***';
    }
    if (parts.length === 2) {
        return name;
    }
    return `${parts[0]} *** ${parts[parts.length - 1]}`;
}
function maskObject(obj, options = {}) {
    const { maskNames = false, keysToMask = [] } = options;
    const masked = { ...obj };
    const documentKeys = ['cpf', 'cnpj', 'cpfCnpj', 'cpf_cnpj'];
    const emailKeys = ['email', 'to', 'cc', 'bcc'];
    const nameKeys = maskNames ? ['nome', 'name', 'razaoSocial', 'razao_social'] : [];
    const customKeys = keysToMask;
    for (const key in masked) {
        const value = masked[key];
        if (value === null || value === undefined) {
            continue;
        }
        if (documentKeys.includes(key)) {
            masked[key] = maskCPFOrCNPJ(String(value));
        }
        else if (emailKeys.includes(key)) {
            if (Array.isArray(value)) {
                masked[key] = value.map((email) => typeof email === 'string' ? maskEmail(email) : email);
            }
            else {
                masked[key] = maskEmail(String(value));
            }
        }
        else if (nameKeys.includes(key)) {
            masked[key] = maskName(String(value));
        }
        else if (customKeys.includes(key)) {
            masked[key] = '***';
        }
        else if (typeof value === 'object' && !Array.isArray(value) && value.constructor === Object) {
            masked[key] = maskObject(value, options);
        }
        else if (Array.isArray(value)) {
            masked[key] = value.map((item) => typeof item === 'object' && item !== null && item.constructor === Object
                ? maskObject(item, options)
                : item);
        }
    }
    return masked;
}
function normalizeCPFOrCNPJ(cpfCnpj) {
    if (!cpfCnpj)
        return '';
    return cpfCnpj.replace(/\D/g, '');
}
function isValidCPFFormat(cpf) {
    if (!cpf)
        return false;
    const digits = normalizeCPFOrCNPJ(cpf);
    return digits.length === 11;
}
function isValidCNPJFormat(cnpj) {
    if (!cnpj)
        return false;
    const digits = normalizeCPFOrCNPJ(cnpj);
    return digits.length === 14;
}
async function hashCPFOrCNPJ(cpfCnpj) {
    if (!cpfCnpj)
        return '';
    const normalized = normalizeCPFOrCNPJ(cpfCnpj);
    if (typeof require !== 'undefined') {
        const crypto = require('crypto');
        return crypto.createHash('sha256').update(normalized).digest('hex');
    }
    if (typeof globalThis !== 'undefined' && globalThis.crypto && globalThis.crypto.subtle) {
        const encoder = new TextEncoder();
        const data = encoder.encode(normalized);
        const hashBuffer = await globalThis.crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    }
    throw new Error('Hash not supported in this environment');
}
function maskLogString(logString) {
    let masked = logString;
    masked = masked.replace(/\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/g, '***.***.***-**');
    masked = masked.replace(/\b\d{11}\b/g, (match) => {
        if (/^(\d)\1{10}$/.test(match))
            return match;
        return '***********';
    });
    masked = masked.replace(/\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b/g, '**.***.***/****-**');
    masked = masked.replace(/\b\d{14}\b/g, '**************');
    masked = masked.replace(/\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/g, (match) => maskEmail(match));
    return masked;
}
//# sourceMappingURL=masking.util.js.map