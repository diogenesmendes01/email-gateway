/**
 * @email-gateway/shared - Email Job Schema Tests
 *
 * Testes para validação do contrato do Job `email:send`
 *
 * TASK 3.1 — Contrato do Job `email:send`
 */

import {
  emailJobRecipientSchema,
  emailSendJobDataSchema,
  emailSendJobOptionsSchema,
  emailSendJobResultSchema,
  validateEmailJobData,
} from '../email-job.schema';
import { EMAIL_JOB_CONFIG } from '../email-job.types';

describe('Email Job Schemas', () => {
  describe('emailJobRecipientSchema', () => {
    it('deve validar recipient válido com recipientId', () => {
      const valid = {
        recipientId: '123e4567-e89b-12d3-a456-426614174000',
        email: 'test@example.com',
      };

      const result = emailJobRecipientSchema.parse(valid);
      expect(result).toEqual(valid);
    });

    it('deve validar recipient válido com externalId', () => {
      const valid = {
        externalId: 'CUST-12345',
        nome: 'João da Silva',
        email: 'test@example.com',
      };

      const result = emailJobRecipientSchema.parse(valid);
      expect(result).toEqual(valid);
    });

    it('deve validar recipient válido com cpfCnpjHash', () => {
      const valid = {
        cpfCnpjHash:
          'a'.repeat(64), // SHA-256 hex hash
        razaoSocial: 'Empresa XYZ Ltda',
        email: 'empresa@example.com',
      };

      const result = emailJobRecipientSchema.parse(valid);
      expect(result).toEqual(valid);
    });

    it('deve rejeitar email inválido', () => {
      const invalid = {
        email: 'not-an-email',
      };

      expect(() => emailJobRecipientSchema.parse(invalid)).toThrow();
    });

    it('deve rejeitar cpfCnpjHash com tamanho incorreto', () => {
      const invalid = {
        cpfCnpjHash: 'abc123', // < 64 chars
        email: 'test@example.com',
      };

      expect(() => emailJobRecipientSchema.parse(invalid)).toThrow(
        'cpfCnpjHash deve ser SHA-256',
      );
    });

    it('deve rejeitar cpfCnpjHash não-hexadecimal', () => {
      const invalid = {
        cpfCnpjHash: 'Z'.repeat(64), // Não é hex
        email: 'test@example.com',
      };

      expect(() => emailJobRecipientSchema.parse(invalid)).toThrow(
        'hash SHA-256 válido',
      );
    });

    it('deve rejeitar externalId muito longo', () => {
      const invalid = {
        externalId: 'A'.repeat(65), // > 64 chars
        email: 'test@example.com',
      };

      expect(() => emailJobRecipientSchema.parse(invalid)).toThrow(
        'no máximo 64',
      );
    });
  });

  describe('emailSendJobDataSchema', () => {
    const validJobData = {
      outboxId: '123e4567-e89b-12d3-a456-426614174000',
      companyId: '789e4567-e89b-12d3-a456-426614174999',
      requestId: 'req-abc123',
      to: 'cliente@example.com',
      subject: 'Seu boleto está disponível',
      htmlRef: '123e4567-e89b-12d3-a456-426614174000',
      recipient: {
        externalId: 'CUST-12345',
        cpfCnpjHash: 'a'.repeat(64),
        nome: 'João da Silva',
        email: 'cliente@example.com',
      },
      attempt: 1,
      enqueuedAt: new Date().toISOString(),
    };

    it('deve validar job data completo', () => {
      const result = emailSendJobDataSchema.parse(validJobData);
      expect(result).toEqual(validJobData);
    });

    it('deve validar job data com campos opcionais', () => {
      const withOptional = {
        ...validJobData,
        cc: ['cc1@example.com', 'cc2@example.com'],
        bcc: ['bcc1@example.com'],
        replyTo: 'reply@example.com',
        headers: { 'X-Custom-Header': 'value' },
        tags: ['boleto', 'urgent'],
      };

      const result = emailSendJobDataSchema.parse(withOptional);
      expect(result).toEqual(withOptional);
    });

    it('deve rejeitar outboxId inválido (não UUID)', () => {
      const invalid = {
        ...validJobData,
        outboxId: 'not-a-uuid',
      };

      expect(() => emailSendJobDataSchema.parse(invalid)).toThrow(
        'UUID válido',
      );
    });

    it('deve rejeitar subject vazio', () => {
      const invalid = {
        ...validJobData,
        subject: '',
      };

      expect(() => emailSendJobDataSchema.parse(invalid)).toThrow(
        'não pode ser vazio',
      );
    });

    it('deve rejeitar subject muito longo', () => {
      const invalid = {
        ...validJobData,
        subject: 'A'.repeat(151),
      };

      expect(() => emailSendJobDataSchema.parse(invalid)).toThrow(
        'no máximo 150',
      );
    });

    it('deve rejeitar subject com quebra de linha', () => {
      const invalid = {
        ...validJobData,
        subject: 'Line 1\nLine 2',
      };

      expect(() => emailSendJobDataSchema.parse(invalid)).toThrow(
        'quebras de linha',
      );
    });

    it('deve rejeitar CC com mais de 5 emails', () => {
      const invalid = {
        ...validJobData,
        cc: [
          'cc1@example.com',
          'cc2@example.com',
          'cc3@example.com',
          'cc4@example.com',
          'cc5@example.com',
          'cc6@example.com',
        ],
      };

      expect(() => emailSendJobDataSchema.parse(invalid)).toThrow('Máximo 5');
    });

    it('deve rejeitar attempt fora do range', () => {
      const invalid = {
        ...validJobData,
        attempt: 0,
      };

      expect(() => emailSendJobDataSchema.parse(invalid)).toThrow('>=');
    });

    it('deve rejeitar attempt acima do máximo', () => {
      const invalid = {
        ...validJobData,
        attempt: 6,
      };

      expect(() => emailSendJobDataSchema.parse(invalid)).toThrow('<=');
    });

    it('deve rejeitar enqueuedAt não ISO 8601', () => {
      const invalid = {
        ...validJobData,
        enqueuedAt: 'not-a-date',
      };

      expect(() => emailSendJobDataSchema.parse(invalid)).toThrow('ISO 8601');
    });

    it('deve rejeitar campos extras não permitidos (strict mode)', () => {
      const invalid = {
        ...validJobData,
        extraField: 'should not be here',
      };

      expect(() => emailSendJobDataSchema.parse(invalid)).toThrow();
    });
  });

  describe('validateEmailJobData', () => {
    const validJobData = {
      outboxId: '123e4567-e89b-12d3-a456-426614174000',
      companyId: '789e4567-e89b-12d3-a456-426614174999',
      requestId: 'req-abc123',
      to: 'cliente@example.com',
      subject: 'Teste',
      htmlRef: '123e4567-e89b-12d3-a456-426614174000',
      recipient: {
        externalId: 'CUST-12345',
        nome: 'João',
        email: 'cliente@example.com', // Igual ao "to"
      },
      attempt: 1,
      enqueuedAt: new Date().toISOString(),
    };

    it('deve validar quando recipient.email === to', () => {
      const result = validateEmailJobData(validJobData);
      expect(result.recipient.email).toBe(result.to);
    });

    it('deve rejeitar quando recipient.email !== to', () => {
      const invalid = {
        ...validJobData,
        to: 'different@example.com',
      };

      expect(() => validateEmailJobData(invalid)).toThrow('coincidir com to');
    });

    it('deve validar quando tem recipientId', () => {
      const withRecipientId = {
        ...validJobData,
        recipient: {
          recipientId: '123e4567-e89b-12d3-a456-426614174000',
          email: 'cliente@example.com',
        },
      };

      const result = validateEmailJobData(withRecipientId);
      expect(result.recipient.recipientId).toBeTruthy();
    });

    it('deve validar quando tem externalId', () => {
      const result = validateEmailJobData(validJobData);
      expect(result.recipient.externalId).toBeTruthy();
    });

    it('deve validar quando tem cpfCnpjHash', () => {
      const withHash = {
        ...validJobData,
        recipient: {
          cpfCnpjHash: 'a'.repeat(64),
          email: 'cliente@example.com',
        },
      };

      const result = validateEmailJobData(withHash);
      expect(result.recipient.cpfCnpjHash).toBeTruthy();
    });

    it('deve rejeitar quando não tem nenhum identificador', () => {
      const invalid = {
        ...validJobData,
        recipient: {
          nome: 'João',
          email: 'cliente@example.com',
        },
      };

      expect(() => validateEmailJobData(invalid)).toThrow(
        'ao menos um de: recipientId, externalId ou cpfCnpjHash',
      );
    });
  });

  describe('emailSendJobOptionsSchema', () => {
    it('deve validar options com valores padrão', () => {
      const valid = {
        jobId: '123e4567-e89b-12d3-a456-426614174000',
      };

      const result = emailSendJobOptionsSchema.parse(valid);

      expect(result.jobId).toBe(valid.jobId);
      expect(result.ttl).toBe(EMAIL_JOB_CONFIG.DEFAULT_TTL);
      expect(result.removeOnComplete).toBe(true);
      expect(result.removeOnFail).toBe(false);
    });

    it('deve validar options completas', () => {
      const valid = {
        jobId: '123e4567-e89b-12d3-a456-426614174000',
        ttl: 3600000, // 1 hora
        priority: 1,
        delay: 5000,
        removeOnComplete: false,
        removeOnFail: true,
      };

      const result = emailSendJobOptionsSchema.parse(valid);
      expect(result).toEqual(valid);
    });

    it('deve rejeitar TTL acima de 24h', () => {
      const invalid = {
        jobId: '123e4567-e89b-12d3-a456-426614174000',
        ttl: EMAIL_JOB_CONFIG.DEFAULT_TTL + 1,
      };

      expect(() => emailSendJobOptionsSchema.parse(invalid)).toThrow(
        'não pode exceder 24h',
      );
    });

    it('deve rejeitar priority fora do range', () => {
      const invalid = {
        jobId: '123e4567-e89b-12d3-a456-426614174000',
        priority: 11,
      };

      expect(() => emailSendJobOptionsSchema.parse(invalid)).toThrow(
        'máxima = 10',
      );
    });

    it('deve rejeitar delay negativo', () => {
      const invalid = {
        jobId: '123e4567-e89b-12d3-a456-426614174000',
        delay: -1000,
      };

      expect(() => emailSendJobOptionsSchema.parse(invalid)).toThrow(
        'não pode ser negativo',
      );
    });
  });

  describe('emailSendJobResultSchema', () => {
    it('deve validar resultado de sucesso', () => {
      const valid = {
        sesMessageId: '00000000-1111-2222-3333-444444444444',
        status: 'SENT',
        processedAt: new Date().toISOString(),
        durationMs: 1500,
        attempt: 1,
      };

      const result = emailSendJobResultSchema.parse(valid);
      expect(result.status).toBe('SENT');
      expect(result.sesMessageId).toBe(valid.sesMessageId);
    });

    it('deve validar resultado de falha', () => {
      const valid = {
        status: 'FAILED',
        processedAt: new Date().toISOString(),
        durationMs: 500,
        errorCode: 'SMTP_TIMEOUT',
        errorReason: 'Connection timeout after 30s',
        attempt: 3,
      };

      const result = emailSendJobResultSchema.parse(valid);
      expect(result.status).toBe('FAILED');
      expect(result.errorCode).toBe('SMTP_TIMEOUT');
    });

    it('deve validar resultado de retry', () => {
      const valid = {
        status: 'RETRYING',
        processedAt: new Date().toISOString(),
        durationMs: 200,
        errorCode: 'TEMPORARY_ERROR',
        errorReason: '4xx response from SES',
        attempt: 2,
      };

      const result = emailSendJobResultSchema.parse(valid);
      expect(result.status).toBe('RETRYING');
    });

    it('deve rejeitar status inválido', () => {
      const invalid = {
        status: 'UNKNOWN',
        processedAt: new Date().toISOString(),
        durationMs: 100,
        attempt: 1,
      };

      expect(() => emailSendJobResultSchema.parse(invalid)).toThrow();
    });

    it('deve rejeitar durationMs negativo', () => {
      const invalid = {
        status: 'SENT',
        processedAt: new Date().toISOString(),
        durationMs: -100,
        attempt: 1,
      };

      expect(() => emailSendJobResultSchema.parse(invalid)).toThrow(
        'não pode ser negativo',
      );
    });

    it('deve rejeitar errorReason muito longa', () => {
      const invalid = {
        status: 'FAILED',
        processedAt: new Date().toISOString(),
        durationMs: 100,
        errorReason: 'A'.repeat(501),
        attempt: 1,
      };

      expect(() => emailSendJobResultSchema.parse(invalid)).toThrow(
        'no máximo 500',
      );
    });
  });

  describe('EMAIL_JOB_CONFIG', () => {
    it('deve ter valores corretos de configuração', () => {
      expect(EMAIL_JOB_CONFIG.QUEUE_NAME).toBe('email:send');
      expect(EMAIL_JOB_CONFIG.DEFAULT_TTL).toBe(86400000); // 24h
      expect(EMAIL_JOB_CONFIG.DEFAULT_PRIORITY).toBe(5);
      expect(EMAIL_JOB_CONFIG.MAX_ATTEMPTS).toBe(5);
      expect(EMAIL_JOB_CONFIG.BACKOFF_DELAYS).toEqual([1, 5, 30, 120, 600]);
      expect(EMAIL_JOB_CONFIG.DLQ_TTL).toBe(604800000); // 7 days
    });

    it('deve ter backoff delays com tamanho igual a MAX_ATTEMPTS', () => {
      expect(EMAIL_JOB_CONFIG.BACKOFF_DELAYS.length).toBe(
        EMAIL_JOB_CONFIG.MAX_ATTEMPTS,
      );
    });
  });
});
