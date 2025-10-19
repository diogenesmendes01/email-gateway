/**
 * @email-gateway/shared - Masking Utilities
 *
 * Utilit\u00e1rios para mascarar dados sens\u00edveis (PII) em logs e exibi\u00e7\u00e3o
 *
 * TASK 4.3 — Falhas espec\u00edficas e troubleshooting
 * Auditoria e masking de dados sens\u00edveis
 */

/**
 * Mascara um CPF (formato: 000.000.000-00)
 *
 * Exemplos:
 * - "12345678900" → "***.***.***-00"
 * - "123.456.789-00" → "***.***.***-00"
 *
 * @param cpf - CPF com ou sem formata\u00e7\u00e3o
 * @returns CPF mascarado
 */
export function maskCPF(cpf: string | null | undefined): string {
  if (!cpf) return '***.***.***-**';

  // Remove formata\u00e7\u00e3o
  const digits = cpf.replace(/\D/g, '');

  if (digits.length !== 11) {
    return '***.***.***-**';
  }

  // Mant\u00e9m apenas os \ultimos 2 d\u00edgitos
  return `***.***.***-${digits.slice(-2)}`;
}

/**
 * Mascara um CNPJ (formato: 00.000.000/0000-00)
 *
 * Exemplos:
 * - "12345678000195" -> "**.***.***/****-95"
 * - "12.345.678/0001-95" -> "**.***.***/****-95"
 *
 * @param cnpj - CNPJ com ou sem formatacao
 * @returns CNPJ mascarado
 */
export function maskCNPJ(cnpj: string | null | undefined): string {
  if (!cnpj) return '**.***.***/****-**';

  // Remove formata\u00e7\u00e3o
  const digits = cnpj.replace(/\D/g, '');

  if (digits.length !== 14) {
    return '**.***.***/****-**';
  }

  // Mant\u00e9m apenas os \ultimos 2 d\u00edgitos
  return `**.***.***/****-${digits.slice(-2)}`;
}

/**
 * Mascara CPF ou CNPJ automaticamente
 *
 * @param cpfCnpj - CPF ou CNPJ
 * @returns Documento mascarado
 */
export function maskCPFOrCNPJ(cpfCnpj: string | null | undefined): string {
  if (!cpfCnpj) return '***.***.***-**';

  const digits = cpfCnpj.replace(/\D/g, '');

  if (digits.length === 11) {
    return maskCPF(cpfCnpj);
  } else if (digits.length === 14) {
    return maskCNPJ(cpfCnpj);
  }

  // Inv\u00e1lido
  return '***.***.***-**';
}

/**
 * Mascara um endere\u00e7o de email
 *
 * Exemplos:
 * - "joao@example.com" → "j***@example.com"
 * - "a@b.co" → "a***@b.co"
 * - "very-long-email@domain.com" → "v***@domain.com"
 *
 * @param email - Email completo
 * @returns Email mascarado
 */
export function maskEmail(email: string | null | undefined): string {
  if (!email) return '***@***.***';

  const parts = email.split('@');

  if (parts.length !== 2) {
    return '***@***.***';
  }

  const [localPart, domain] = parts;

  if (!localPart || !domain) {
    return '***@***.***';
  }

  // Mant\u00e9m primeiro caractere + ***
  const maskedLocal = localPart.length > 0
    ? `${localPart[0]}***`
    : '***';

  return `${maskedLocal}@${domain}`;
}

/**
 * Mascara um nome completo
 *
 * Mant\u00e9m primeiro e \u00faltimo nome, oculta nomes do meio
 *
 * Exemplos:
 * - "Jo\u00e3o Silva" → "Jo\u00e3o Silva"
 * - "Jo\u00e3o da Silva Santos" → "Jo\u00e3o *** Santos"
 * - "Maria" → "Maria"
 *
 * @param name - Nome completo
 * @returns Nome mascarado
 */
export function maskName(name: string | null | undefined): string {
  if (!name) return '***';

  const parts = name.trim().split(/\s+/);

  if (parts.length === 1) {
    // Nome simples, n\u00e3o mascara
    return parts[0] || '***';
  }

  if (parts.length === 2) {
    // Primeiro e \u00faltimo nome, n\u00e3o mascara
    return name;
  }

  // Mant\u00e9m primeiro e \u00faltimo, oculta do meio
  return `${parts[0]} *** ${parts[parts.length - 1]}`;
}

/**
 * Mascara um objeto completo recursivamente
 *
 * Aplica masking em campos conhecidos:
 * - cpf, cpfCnpj, cnpj → maskCPFOrCNPJ
 * - email, to, cc, bcc → maskEmail
 * - nome, name, razaoSocial → maskName (opcional, configurável)
 *
 * @param obj - Objeto a ser mascarado
 * @param options - Op\u00e7\u00f5es de masking
 * @returns Objeto mascarado
 */
export function maskObject<T extends Record<string, any>>(
  obj: T,
  options: {
    maskNames?: boolean; // Se true, mascara nomes/raz\u00e3o social
    keysToMask?: string[]; // Chaves adicionais para mascarar
  } = {},
): T {
  const { maskNames = false, keysToMask = [] } = options;

  const masked = { ...obj };

  // Lista de chaves que devem ser mascaradas
  const documentKeys = ['cpf', 'cnpj', 'cpfCnpj', 'cpf_cnpj'];
  const emailKeys = ['email', 'to'];
  const nameKeys = maskNames ? ['nome', 'name', 'razaoSocial', 'razao_social'] : [];
  const customKeys = keysToMask;

  for (const key in masked) {
    const value = masked[key];

    if (value === null || value === undefined) {
      continue;
    }

    // Mascara documentos (CPF/CNPJ)
    if (documentKeys.includes(key)) {
      masked[key] = maskCPFOrCNPJ(String(value)) as any;
    }
    // Mascara emails
    else if (emailKeys.includes(key)) {
      masked[key] = maskEmail(String(value)) as any;
    }
    // Mascara nomes (se habilitado)
    else if (nameKeys.includes(key)) {
      masked[key] = maskName(String(value)) as any;
    }
    // Mascara chaves customizadas
    else if (customKeys.includes(key)) {
      masked[key] = '***' as any;
    }
    // Processa objetos aninhados recursivamente
    else if (typeof value === 'object' && !Array.isArray(value)) {
      masked[key] = maskObject(value, options);
    }
    // Processa arrays recursivamente
    else if (Array.isArray(value)) {
      masked[key] = value.map((item: any) =>
        typeof item === 'object' ? maskObject(item, options) : item,
      ) as any;
    }
  }

  return masked;
}

/**
 * Normaliza CPF/CNPJ (remove formata\u00e7\u00e3o)
 *
 * @param cpfCnpj - Documento com ou sem formata\u00e7\u00e3o
 * @returns Apenas d\u00edgitos
 */
export function normalizeCPFOrCNPJ(cpfCnpj: string | null | undefined): string {
  if (!cpfCnpj) return '';

  return cpfCnpj.replace(/\D/g, '');
}

/**
 * Valida formato de CPF (b\u00e1sico, apenas d\u00edgitos)
 *
 * @param cpf - CPF a validar
 * @returns true se formato v\u00e1lido
 */
export function isValidCPFFormat(cpf: string | null | undefined): boolean {
  if (!cpf) return false;

  const digits = normalizeCPFOrCNPJ(cpf);

  return digits.length === 11;
}

/**
 * Valida formato de CNPJ (b\u00e1sico, apenas d\u00edgitos)
 *
 * @param cnpj - CNPJ a validar
 * @returns true se formato v\u00e1lido
 */
export function isValidCNPJFormat(cnpj: string | null | undefined): boolean {
  if (!cnpj) return false;

  const digits = normalizeCPFOrCNPJ(cnpj);

  return digits.length === 14;
}

/**
 * Cria hash de CPF/CNPJ para busca (SHA-256)
 *
 * Usado para buscar destinat\u00e1rios sem expor documento em claro
 *
 * @param cpfCnpj - Documento
 * @returns Hash SHA-256 (hex)
 */
export async function hashCPFOrCNPJ(
  cpfCnpj: string | null | undefined,
): Promise<string> {
  if (!cpfCnpj) return '';

  const normalized = normalizeCPFOrCNPJ(cpfCnpj);

  // Node.js crypto
  if (typeof require !== 'undefined') {
    const crypto = require('crypto');
    return crypto.createHash('sha256').update(normalized).digest('hex');
  }

  // Browser Web Crypto API
  if (typeof globalThis !== 'undefined' && (globalThis as any).crypto && (globalThis as any).crypto.subtle) {
    const encoder = new TextEncoder();
    const data = encoder.encode(normalized);
    const hashBuffer = await (globalThis as any).crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  throw new Error('Hash not supported in this environment');
}

/**
 * Mascara dados sens\u00edveis em string de log
 *
 * Busca padr\u00f5es comuns e mascara automaticamente
 *
 * @param logString - String de log
 * @returns Log mascarado
 */
export function maskLogString(logString: string): string {
  let masked = logString;

  // Mascara CPF (formato: 000.000.000-00)
  masked = masked.replace(
    /\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/g,
    '***.***.***-**',
  );

  // Mascara CPF sem formata\u00e7\u00e3o (11 d\u00edgitos)
  masked = masked.replace(
    /\b\d{11}\b/g,
    (match) => {
      // Verifica se parece com CPF (n\u00e3o todos iguais)
      if (/^(\d)\1{10}$/.test(match)) return match; // 11111111111 (inv\u00e1lido)
      return '***********';
    },
  );

  // Mascara CNPJ (formato: 00.000.000/0000-00)
  masked = masked.replace(
    /\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b/g,
    '**.***.***/****-**',
  );

  // Mascara CNPJ sem formata\u00e7\u00e3o (14 d\u00edgitos)
  masked = masked.replace(
    /\b\d{14}\b/g,
    '**************',
  );

  // Mascara emails
  masked = masked.replace(
    /\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/g,
    (match) => maskEmail(match),
  );

  return masked;
}
