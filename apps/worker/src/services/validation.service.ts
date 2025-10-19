/**
 * @email-gateway/worker - Validation Service
 *
 * Service responsável por todas as validações do pipeline de envio
 *
 * TASK 4.1 — Pipeline de estados, validações e envio SES
 * Validações implementadas:
 * 1. INTEGRITY - Validação da integridade do payload do job
 * 2. OUTBOX - Validação da existência do registro no outbox
 * 3. RECIPIENT - Validação dos dados do destinatário
 * 4. TEMPLATE - Validação do template/HTML
 */

import { PrismaClient } from '@email-gateway/database';
import {
  ValidationType,
  ValidationResult,
  ErrorCode,
  EmailSendJobData,
  validateEmailJobData,
  PIPELINE_CONSTANTS,
} from '@email-gateway/shared';

export class ValidationService {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Executa todas as validações do pipeline
   *
   * @param jobData - Dados do job a serem validados
   * @returns Array com resultados de todas as validações
   */
  async validateAll(jobData: unknown): Promise<ValidationResult[]> {
    const results: ValidationResult[] = [];

    // 1. Validação de integridade do payload
    const integrityResult = await this.validateIntegrity(jobData);
    results.push(integrityResult);

    // Se a integridade falhou, não adianta continuar
    if (!integrityResult.success) {
      return results;
    }

    // Cast seguro após validação de integridade
    const validatedData = jobData as EmailSendJobData;

    // 2. Validação do outbox
    const outboxResult = await this.validateOutbox(validatedData);
    results.push(outboxResult);

    // 3. Validação do recipient
    const recipientResult = await this.validateRecipient(validatedData);
    results.push(recipientResult);

    // 4. Validação do template/HTML
    const templateResult = await this.validateTemplate(validatedData);
    results.push(templateResult);

    return results;
  }

  /**
   * Validação 1: INTEGRITY
   * Verifica se o payload do job está correto e completo
   */
  async validateIntegrity(jobData: unknown): Promise<ValidationResult> {
    try {
      // Usa o validador do schema Zod
      validateEmailJobData(jobData);

      return {
        type: ValidationType.INTEGRITY,
        success: true,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Payload inválido';

      return {
        type: ValidationType.INTEGRITY,
        success: false,
        error: errorMessage,
        errorCode: ErrorCode.INVALID_PAYLOAD,
        metadata: {
          originalError: error instanceof Error ? error.message : String(error),
        },
      };
    }
  }

  /**
   * Validação 2: OUTBOX
   * Verifica se o registro existe no email_outbox
   */
  async validateOutbox(jobData: EmailSendJobData): Promise<ValidationResult> {
    try {
      const outbox = await this.prisma.emailOutbox.findUnique({
        where: { id: jobData.outboxId },
        select: {
          id: true,
          companyId: true,
          status: true,
        },
      });

      if (!outbox) {
        return {
          type: ValidationType.OUTBOX,
          success: false,
          error: `Registro não encontrado no outbox: ${jobData.outboxId}`,
          errorCode: ErrorCode.OUTBOX_NOT_FOUND,
          metadata: {
            outboxId: jobData.outboxId,
          },
        };
      }

      // Verifica se o companyId coincide
      if (outbox.companyId !== jobData.companyId) {
        return {
          type: ValidationType.OUTBOX,
          success: false,
          error: 'CompanyId do job não coincide com o do outbox',
          errorCode: ErrorCode.INVALID_PAYLOAD,
          metadata: {
            jobCompanyId: jobData.companyId,
            outboxCompanyId: outbox.companyId,
          },
        };
      }

      return {
        type: ValidationType.OUTBOX,
        success: true,
        metadata: {
          outboxId: outbox.id,
          outboxStatus: outbox.status,
        },
      };
    } catch (error) {
      return {
        type: ValidationType.OUTBOX,
        success: false,
        error: 'Erro ao validar outbox no banco de dados',
        errorCode: ErrorCode.OUTBOX_NOT_FOUND,
        metadata: {
          originalError: error instanceof Error ? error.message : String(error),
        },
      };
    }
  }

  /**
   * Validação 3: RECIPIENT
   * Verifica se os dados do destinatário são válidos
   */
  async validateRecipient(
    jobData: EmailSendJobData,
  ): Promise<ValidationResult> {
    try {
      const { recipient } = jobData;

      // Se temos recipientId, verifica se existe
      if (recipient.recipientId) {
        const recipientRecord = await this.prisma.recipient.findUnique({
          where: { id: recipient.recipientId },
          select: {
            id: true,
            companyId: true,
            email: true,
            deletedAt: true,
          },
        });

        if (!recipientRecord) {
          return {
            type: ValidationType.RECIPIENT,
            success: false,
            error: `Recipient não encontrado: ${recipient.recipientId}`,
            errorCode: ErrorCode.RECIPIENT_NOT_FOUND,
            metadata: {
              recipientId: recipient.recipientId,
            },
          };
        }

        // Verifica se não foi deletado
        if (recipientRecord.deletedAt) {
          return {
            type: ValidationType.RECIPIENT,
            success: false,
            error: 'Recipient foi deletado (soft delete)',
            errorCode: ErrorCode.RECIPIENT_NOT_FOUND,
            metadata: {
              recipientId: recipient.recipientId,
              deletedAt: recipientRecord.deletedAt,
            },
          };
        }

        // Verifica se companyId coincide
        if (recipientRecord.companyId !== jobData.companyId) {
          return {
            type: ValidationType.RECIPIENT,
            success: false,
            error: 'CompanyId do recipient não coincide com o do job',
            errorCode: ErrorCode.INVALID_PAYLOAD,
            metadata: {
              jobCompanyId: jobData.companyId,
              recipientCompanyId: recipientRecord.companyId,
            },
          };
        }

        // Verifica se email coincide
        if (recipientRecord.email !== recipient.email) {
          return {
            type: ValidationType.RECIPIENT,
            success: false,
            error: 'Email do recipient no banco não coincide com o do job',
            errorCode: ErrorCode.INVALID_EMAIL,
            metadata: {
              jobEmail: recipient.email,
              dbEmail: recipientRecord.email,
            },
          };
        }
      }

      // Validação básica do formato do email
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(recipient.email)) {
        return {
          type: ValidationType.RECIPIENT,
          success: false,
          error: 'Formato de email inválido',
          errorCode: ErrorCode.INVALID_EMAIL,
          metadata: {
            email: recipient.email,
          },
        };
      }

      return {
        type: ValidationType.RECIPIENT,
        success: true,
        metadata: {
          email: recipient.email,
          hasRecipientId: !!recipient.recipientId,
          hasExternalId: !!recipient.externalId,
          hasCpfCnpjHash: !!recipient.cpfCnpjHash,
        },
      };
    } catch (error) {
      return {
        type: ValidationType.RECIPIENT,
        success: false,
        error: 'Erro ao validar recipient',
        errorCode: ErrorCode.RECIPIENT_NOT_FOUND,
        metadata: {
          originalError: error instanceof Error ? error.message : String(error),
        },
      };
    }
  }

  /**
   * Validação 4: TEMPLATE
   * Verifica se o HTML/template é válido
   */
  async validateTemplate(
    jobData: EmailSendJobData,
  ): Promise<ValidationResult> {
    try {
      const { htmlRef, subject } = jobData;

      // Busca o HTML do outbox
      const outbox = await this.prisma.emailOutbox.findUnique({
        where: { id: jobData.outboxId },
        select: { html: true },
      });

      if (!outbox || !outbox.html) {
        return {
          type: ValidationType.TEMPLATE,
          success: false,
          error: 'HTML não encontrado no outbox',
          errorCode: ErrorCode.INVALID_TEMPLATE,
          metadata: {
            htmlRef,
            outboxId: jobData.outboxId,
          },
        };
      }

      const html = outbox.html;

      // Valida tamanho do HTML
      const htmlSizeBytes = Buffer.byteLength(html, 'utf8');
      if (htmlSizeBytes > PIPELINE_CONSTANTS.MAX_HTML_SIZE_BYTES) {
        return {
          type: ValidationType.TEMPLATE,
          success: false,
          error: `HTML excede tamanho máximo permitido (${PIPELINE_CONSTANTS.MAX_HTML_SIZE_BYTES} bytes)`,
          errorCode: ErrorCode.INVALID_TEMPLATE,
          metadata: {
            htmlSizeBytes,
            maxSizeBytes: PIPELINE_CONSTANTS.MAX_HTML_SIZE_BYTES,
          },
        };
      }

      // Valida que o HTML não está vazio
      if (html.trim().length === 0) {
        return {
          type: ValidationType.TEMPLATE,
          success: false,
          error: 'HTML está vazio',
          errorCode: ErrorCode.INVALID_TEMPLATE,
          metadata: { htmlRef },
        };
      }

      // Valida subject
      if (subject.length > PIPELINE_CONSTANTS.MAX_SUBJECT_LENGTH) {
        return {
          type: ValidationType.TEMPLATE,
          success: false,
          error: `Subject excede tamanho máximo (${PIPELINE_CONSTANTS.MAX_SUBJECT_LENGTH} chars)`,
          errorCode: ErrorCode.INVALID_TEMPLATE,
          metadata: {
            subjectLength: subject.length,
            maxLength: PIPELINE_CONSTANTS.MAX_SUBJECT_LENGTH,
          },
        };
      }

      // Validações básicas de segurança do HTML
      const suspiciousPatterns = [
        /<script[^>]*>/i, // Scripts
        /javascript:/i, // JavaScript URLs
        /on\w+\s*=/i, // Event handlers (onclick, onload, etc)
      ];

      for (const pattern of suspiciousPatterns) {
        if (pattern.test(html)) {
          return {
            type: ValidationType.TEMPLATE,
            success: false,
            error: 'HTML contém conteúdo potencialmente inseguro',
            errorCode: ErrorCode.INVALID_TEMPLATE,
            metadata: {
              pattern: pattern.toString(),
              htmlRef,
            },
          };
        }
      }

      return {
        type: ValidationType.TEMPLATE,
        success: true,
        metadata: {
          htmlSizeBytes,
          subjectLength: subject.length,
        },
      };
    } catch (error) {
      return {
        type: ValidationType.TEMPLATE,
        success: false,
        error: 'Erro ao validar template',
        errorCode: ErrorCode.INVALID_TEMPLATE,
        metadata: {
          originalError: error instanceof Error ? error.message : String(error),
        },
      };
    }
  }

  /**
   * Helper: Verifica se todas as validações passaram
   */
  static allValidationsPassed(results: ValidationResult[]): boolean {
    return results.every((r) => r.success);
  }

  /**
   * Helper: Retorna a primeira validação que falhou
   */
  static getFirstFailure(
    results: ValidationResult[],
  ): ValidationResult | undefined {
    return results.find((r) => !r.success);
  }
}
