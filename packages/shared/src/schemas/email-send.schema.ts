/**
 * Schemas de Validação - POST /v1/email/send
 *
 * Este arquivo contém os schemas Zod para validação do endpoint de envio de e-mails.
 * Os schemas garantem que todos os dados recebidos atendem aos requisitos definidos
 * no contrato da API.
 *
 * @see docs/api/03-email-send-contract.md
 */

import { z } from 'zod';

// ============================================================================
// CONSTANTES E LIMITES
// ============================================================================

export const LIMITS = {
  // Tamanhos máximos
  MAX_PAYLOAD_SIZE: 1_048_576, // 1MB em bytes
  MAX_HTML_SIZE: 1_048_576,    // 1MB

  // Strings
  MAX_EMAIL_LENGTH: 254,
  MAX_SUBJECT_LENGTH: 150,
  MIN_SUBJECT_LENGTH: 1,
  MAX_HEADER_KEY_LENGTH: 64,
  MAX_HEADER_VALUE_LENGTH: 256,
  MAX_TAG_LENGTH: 32,
  MAX_EXTERNAL_ID_LENGTH: 64,
  MIN_EXTERNAL_ID_LENGTH: 1,
  MAX_IDEMPOTENCY_KEY_LENGTH: 128,

  // Recipient
  MAX_NOME_LENGTH: 120,
  MIN_NOME_LENGTH: 1,
  MAX_RAZAO_SOCIAL_LENGTH: 150,
  MIN_RAZAO_SOCIAL_LENGTH: 1,
  CPF_LENGTH: 11,
  CNPJ_LENGTH: 14,

  // Listas
  MAX_CC_COUNT: 5,
  MAX_BCC_COUNT: 5,
  MAX_TAGS_COUNT: 5,
  MAX_HEADERS_COUNT: 10,
} as const;

// ============================================================================
// REGEX PATTERNS
// ============================================================================

const PATTERNS = {
  // Email: validação básica RFC 5322
  email: /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/,

  // External ID: alfanumérico + hífen + underscore
  externalId: /^[a-zA-Z0-9_-]+$/,

  // Tag: alfanumérico + hífen + underscore
  tag: /^[a-zA-Z0-9_-]+$/,

  // CPF/CNPJ: apenas dígitos
  cpfCnpj: /^\d+$/,

  // Idempotency Key: alfanumérico + hífen + underscore
  idempotencyKey: /^[a-zA-Z0-9_-]+$/,

  // Custom Header: deve começar com X-Custom- ou ser X-Priority
  customHeader: /^(X-Custom-[a-zA-Z0-9_-]+|X-Priority)$/,
} as const;

// ============================================================================
// VALIDADORES CUSTOMIZADOS
// ============================================================================

/**
 * Valida dígitos verificadores de CPF
 */
function validateCPF(cpf: string): boolean {
  if (cpf.length !== LIMITS.CPF_LENGTH) return false;
  if (/^(\d)\1+$/.test(cpf)) return false; // Todos dígitos iguais

  // Validação do primeiro dígito verificador
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += parseInt(cpf.charAt(i)) * (10 - i);
  }
  let digit = 11 - (sum % 11);
  if (digit >= 10) digit = 0;
  if (digit !== parseInt(cpf.charAt(9))) return false;

  // Validação do segundo dígito verificador
  sum = 0;
  for (let i = 0; i < 10; i++) {
    sum += parseInt(cpf.charAt(i)) * (11 - i);
  }
  digit = 11 - (sum % 11);
  if (digit >= 10) digit = 0;
  if (digit !== parseInt(cpf.charAt(10))) return false;

  return true;
}

/**
 * Valida dígitos verificadores de CNPJ
 */
function validateCNPJ(cnpj: string): boolean {
  if (cnpj.length !== LIMITS.CNPJ_LENGTH) return false;
  if (/^(\d)\1+$/.test(cnpj)) return false; // Todos dígitos iguais

  // Validação do primeiro dígito verificador
  let sum = 0;
  let weight = 5;
  for (let i = 0; i < 12; i++) {
    sum += parseInt(cnpj.charAt(i)) * weight;
    weight = weight === 2 ? 9 : weight - 1;
  }
  let digit = sum % 11 < 2 ? 0 : 11 - (sum % 11);
  if (digit !== parseInt(cnpj.charAt(12))) return false;

  // Validação do segundo dígito verificador
  sum = 0;
  weight = 6;
  for (let i = 0; i < 13; i++) {
    sum += parseInt(cnpj.charAt(i)) * weight;
    weight = weight === 2 ? 9 : weight - 1;
  }
  digit = sum % 11 < 2 ? 0 : 11 - (sum % 11);
  if (digit !== parseInt(cnpj.charAt(13))) return false;

  return true;
}

/**
 * Valida CPF ou CNPJ
 */
function validateCpfCnpj(value: string): boolean {
  if (!PATTERNS.cpfCnpj.test(value)) return false;

  if (value.length === LIMITS.CPF_LENGTH) {
    return validateCPF(value);
  } else if (value.length === LIMITS.CNPJ_LENGTH) {
    return validateCNPJ(value);
  }

  return false;
}

// ============================================================================
// SCHEMAS BÁSICOS
// ============================================================================

/**
 * Schema para validação de e-mail
 */
export const emailSchema = z
  .string()
  .max(LIMITS.MAX_EMAIL_LENGTH, 'Email must not exceed 254 characters')
  .regex(PATTERNS.email, 'Invalid email format')
  .transform((val) => val.toLowerCase().trim());

/**
 * Schema para External ID (genérico)
 */
export const externalIdSchema = z
  .string()
  .min(LIMITS.MIN_EXTERNAL_ID_LENGTH, 'External ID must have at least 1 character')
  .max(LIMITS.MAX_EXTERNAL_ID_LENGTH, 'External ID must not exceed 64 characters')
  .regex(PATTERNS.externalId, 'External ID must contain only alphanumeric, hyphens, and underscores')
  .trim();

/**
 * Schema para tag
 */
export const tagSchema = z
  .string()
  .min(1, 'Tag must have at least 1 character')
  .max(LIMITS.MAX_TAG_LENGTH, 'Tag must not exceed 32 characters')
  .regex(PATTERNS.tag, 'Tag must contain only alphanumeric, hyphens, and underscores')
  .trim();

/**
 * Schema para CPF/CNPJ
 */
export const cpfCnpjSchema = z
  .string()
  .regex(PATTERNS.cpfCnpj, 'CPF/CNPJ must contain only digits')
  .refine(
    (val) => val.length === LIMITS.CPF_LENGTH || val.length === LIMITS.CNPJ_LENGTH,
    'CPF must have 11 digits or CNPJ must have 14 digits'
  )
  .refine(
    (val) => validateCpfCnpj(val),
    'Invalid CPF or CNPJ: check digits do not match'
  );

// ============================================================================
// SCHEMA: RECIPIENT
// ============================================================================

/**
 * Schema para o bloco recipient
 *
 * Campos opcionais, mas recomendados para rastreabilidade.
 */
export const recipientSchema = z.object({
  /**
   * Identificador do destinatário no sistema do parceiro
   * Único por company_id
   */
  externalId: externalIdSchema.optional(),

  /**
   * CPF (11 dígitos) ou CNPJ (14 dígitos) do destinatário
   * Apenas dígitos, sem pontuação
   */
  cpfCnpj: cpfCnpjSchema.optional(),

  /**
   * Razão social da pessoa jurídica
   */
  razaoSocial: z
    .string()
    .min(LIMITS.MIN_RAZAO_SOCIAL_LENGTH, 'Razão social must have at least 1 character')
    .max(LIMITS.MAX_RAZAO_SOCIAL_LENGTH, 'Razão social must not exceed 150 characters')
    .trim()
    .optional(),

  /**
   * Nome da pessoa física
   */
  nome: z
    .string()
    .min(LIMITS.MIN_NOME_LENGTH, 'Nome must have at least 1 character')
    .max(LIMITS.MAX_NOME_LENGTH, 'Nome must not exceed 120 characters')
    .trim()
    .optional(),

  /**
   * E-mail do destinatário
   * Se fornecido, DEVE coincidir com o campo 'to'
   */
  email: emailSchema.optional(),
}).strict();

// ============================================================================
// SCHEMA: HEADERS CUSTOMIZADOS
// ============================================================================

/**
 * Schema para headers customizados do e-mail
 *
 * Apenas headers na safe-list são permitidos:
 * - X-Custom-*
 * - X-Priority
 */
export const customHeadersSchema = z
  .record(
    z
      .string()
      .max(LIMITS.MAX_HEADER_KEY_LENGTH, 'Header key must not exceed 64 characters')
      .regex(PATTERNS.customHeader, 'Header must be X-Custom-* or X-Priority'),
    z
      .string()
      .max(LIMITS.MAX_HEADER_VALUE_LENGTH, 'Header value must not exceed 256 characters')
  )
  .refine(
    (headers) => Object.keys(headers).length <= LIMITS.MAX_HEADERS_COUNT,
    `Maximum of ${LIMITS.MAX_HEADERS_COUNT} custom headers allowed`
  )
  .optional();

// ============================================================================
// SCHEMA: REQUEST BODY
// ============================================================================

/**
 * Schema principal para o body de POST /v1/email/send
 */
export const emailSendBodySchema = z.object({
  // ========================================
  // ENVELOPE
  // ========================================

  /**
   * Endereço do destinatário principal (obrigatório)
   */
  to: emailSchema,

  /**
   * Lista de destinatários em cópia (opcional, max 5)
   */
  cc: z
    .array(emailSchema)
    .max(LIMITS.MAX_CC_COUNT, `Maximum of ${LIMITS.MAX_CC_COUNT} CC addresses allowed`)
    .optional(),

  /**
   * Lista de destinatários em cópia oculta (opcional, max 5)
   */
  bcc: z
    .array(emailSchema)
    .max(LIMITS.MAX_BCC_COUNT, `Maximum of ${LIMITS.MAX_BCC_COUNT} BCC addresses allowed`)
    .optional(),

  /**
   * Assunto do e-mail (obrigatório)
   */
  subject: z
    .string()
    .min(LIMITS.MIN_SUBJECT_LENGTH, 'Subject must have at least 1 character')
    .max(LIMITS.MAX_SUBJECT_LENGTH, 'Subject must not exceed 150 characters')
    .refine(
      (val) => !/[\n\r]/.test(val),
      'Subject must not contain line breaks'
    )
    .transform((val) => val.trim()),

  /**
   * Conteúdo HTML do e-mail (obrigatório, max 1MB)
   */
  html: z
    .string()
    .min(1, 'HTML content is required')
    .max(LIMITS.MAX_HTML_SIZE, `HTML content must not exceed ${LIMITS.MAX_HTML_SIZE} bytes`)
    // TODO: [TASK 3.4] Adicionar sanitização de HTML (remover scripts, etc.)
    // Considerar usar biblioteca como DOMPurify ou isomorphic-dompurify
    .refine(
      (val) => Buffer.byteLength(val, 'utf8') <= LIMITS.MAX_HTML_SIZE,
      `HTML content size must not exceed ${LIMITS.MAX_HTML_SIZE} bytes`
    ),

  /**
   * Endereço para respostas (opcional)
   */
  replyTo: emailSchema.optional(),

  /**
   * Headers customizados (opcional)
   */
  headers: customHeadersSchema,

  /**
   * Tags para categorização (opcional, max 5)
   */
  tags: z
    .array(tagSchema)
    .max(LIMITS.MAX_TAGS_COUNT, `Maximum of ${LIMITS.MAX_TAGS_COUNT} tags allowed`)
    .optional(),

  // ========================================
  // IDENTIFICAÇÃO DO DESTINATÁRIO
  // ========================================

  /**
   * Dados do destinatário (opcional, mas recomendado)
   */
  recipient: recipientSchema.optional(),

  // ========================================
  // CORRELAÇÃO DO PEDIDO
  // ========================================

  /**
   * Identificador do envio no sistema do parceiro (opcional)
   * Diferente de recipient.externalId
   */
  externalId: externalIdSchema.optional(),
}).strict()
  // Validação customizada: recipient.email deve coincidir com 'to'
  .refine(
    (data) => {
      if (data.recipient?.email && data.recipient.email !== data.to) {
        return false;
      }
      return true;
    },
    {
      message: "recipient.email must match 'to' field",
      path: ['recipient', 'email'],
    }
  );

// ============================================================================
// SCHEMA: HEADERS DA REQUISIÇÃO
// ============================================================================

/**
 * Schema para headers obrigatórios da requisição
 */
export const emailSendHeadersSchema = z.object({
  /**
   * API Key da empresa (obrigatório)
   */
  'x-api-key': z
    .string()
    .min(1, 'X-API-Key is required'),

  /**
   * Content-Type (obrigatório)
   */
  'content-type': z
    .string()
    .refine(
      (val) => val.toLowerCase().includes('application/json'),
      'Content-Type must be application/json'
    ),

  /**
   * Chave de idempotência (recomendado, opcional)
   */
  'idempotency-key': z
    .string()
    .max(LIMITS.MAX_IDEMPOTENCY_KEY_LENGTH, 'Idempotency-Key must not exceed 128 characters')
    .regex(PATTERNS.idempotencyKey, 'Idempotency-Key must contain only alphanumeric, hyphens, and underscores')
    .optional(),

  /**
   * Request ID para correlação (opcional)
   */
  'x-request-id': z
    .string()
    .max(128, 'X-Request-Id must not exceed 128 characters')
    .optional(),
}).passthrough(); // Permite outros headers

// ============================================================================
// SCHEMA: RESPOSTA 202 ACCEPTED
// ============================================================================

/**
 * Schema para a resposta de sucesso (202 Accepted)
 */
export const emailSendResponseSchema = z.object({
  /**
   * ID do registro na tabela email_outbox
   */
  outboxId: z.string().uuid(),

  /**
   * ID do job na fila Redis/BullMQ (igual ao outboxId)
   */
  jobId: z.string().uuid(),

  /**
   * ID de correlação da requisição
   */
  requestId: z.string(),

  /**
   * Status do envio (sempre ENQUEUED nesta resposta)
   */
  status: z.literal('ENQUEUED'),

  /**
   * Timestamp de recebimento da requisição
   */
  receivedAt: z.string().datetime(),

  /**
   * Ecoa o recipient.externalId se fornecido
   */
  recipient: z.object({
    externalId: z.string().optional(),
  }).optional(),
}).strict();

// ============================================================================
// SCHEMA: ERRO PADRÃO
// ============================================================================

/**
 * Schema para detalhes de erro em um campo específico
 */
export const errorDetailSchema = z.object({
  /**
   * Nome do campo com erro
   */
  field: z.string(),

  /**
   * Mensagem de erro
   */
  message: z.string(),

  /**
   * Valor que causou o erro (opcional)
   */
  value: z.any().optional(),
}).strict();

/**
 * Schema para resposta de erro padrão
 */
export const errorResponseSchema = z.object({
  error: z.object({
    /**
     * Código interno do erro
     */
    code: z.string(),

    /**
     * Mensagem de erro para o usuário
     */
    message: z.string(),

    /**
     * ID de correlação da requisição
     */
    requestId: z.string(),

    /**
     * Timestamp do erro
     */
    timestamp: z.string().datetime(),

    /**
     * Detalhes adicionais do erro (opcional)
     */
    details: z.array(errorDetailSchema).optional(),
  }).strict(),
}).strict();

// ============================================================================
// TIPOS DERIVADOS
// ============================================================================

export type EmailSendBody = z.infer<typeof emailSendBodySchema>;
export type EmailSendHeaders = z.infer<typeof emailSendHeadersSchema>;
export type EmailSendResponse = z.infer<typeof emailSendResponseSchema>;
export type ErrorResponse = z.infer<typeof errorResponseSchema>;
export type ErrorDetail = z.infer<typeof errorDetailSchema>;
export type Recipient = z.infer<typeof recipientSchema>;
export type CustomHeaders = z.infer<typeof customHeadersSchema>;

// ============================================================================
// UTILITÁRIOS
// ============================================================================

/**
 * Valida o tamanho total do payload
 */
export function validatePayloadSize(payload: string): boolean {
  return Buffer.byteLength(payload, 'utf8') <= LIMITS.MAX_PAYLOAD_SIZE;
}

/**
 * Normaliza CPF/CNPJ (remove pontuação)
 */
export function normalizeCpfCnpj(cpfCnpj: string): string {
  return cpfCnpj.replace(/[^\d]/g, '');
}

/**
 * Mascara CPF (XXX.XXX.XXX-XX)
 */
export function maskCPF(cpf: string): string {
  if (cpf.length !== LIMITS.CPF_LENGTH) return cpf;
  return `***.${cpf.substring(3, 6)}.${cpf.substring(6, 9)}-**`;
}

/**
 * Mascara CNPJ (formato: XX.XXX.XXX/XXXX-XX com asteriscos)
 */
export function maskCNPJ(cnpj: string): string {
  if (cnpj.length !== LIMITS.CNPJ_LENGTH) return cnpj;
  return `**.${cnpj.substring(2, 5)}.${cnpj.substring(5, 8)}/${cnpj.substring(8, 12)}-**`;
}

/**
 * Mascara CPF ou CNPJ automaticamente
 */
export function maskCpfCnpj(cpfCnpj: string): string {
  const normalized = normalizeCpfCnpj(cpfCnpj);

  if (normalized.length === LIMITS.CPF_LENGTH) {
    return maskCPF(normalized);
  } else if (normalized.length === LIMITS.CNPJ_LENGTH) {
    return maskCNPJ(normalized);
  }

  return cpfCnpj; // Retorna original se não for CPF nem CNPJ válido
}

/**
 * Gera hash SHA-256 de CPF/CNPJ para busca
 */
export async function hashCpfCnpj(cpfCnpj: string): Promise<string> {
  const normalized = normalizeCpfCnpj(cpfCnpj);
  const encoder = new TextEncoder();
  const data = encoder.encode(normalized);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  return hashHex;
}

/**
 * Sanitiza subject (remove quebras de linha)
 */
export function sanitizeSubject(subject: string): string {
  return subject.replace(/[\n\r]/g, ' ').trim();
}

/**
 * Gera Request ID único
 */
export function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
}
