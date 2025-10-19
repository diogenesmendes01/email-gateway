/**
 * @email-gateway/shared - Email Job Retry Schema Tests
 *
 * Testes para schemas de retry, backoff, DLQ e fairness
 *
 * TASK 3.2 — Retry/backoff/DLQ e fairness por tenant
 */

import { describe, it, expect } from '@jest/globals';
import {
  emailJobRetryConfigSchema,
  emailJobDLQEntrySchema,
  tenantFairnessMetricsSchema,
  jobRetryHistorySchema,
  validateDLQEntry,
} from '../email-job-retry.schema';
import {
  calculateBackoffDelay,
  calculateRoundRobinPriority,
  isRetryableError,
  EMAIL_JOB_RETRY_CONFIG,
  EMAIL_JOB_FAIRNESS_CONFIG,
} from '../email-job-retry.types';

describe('emailJobRetryConfigSchema', () => {
  it('deve validar configuração padrão de retry', () => {
    const config = emailJobRetryConfigSchema.parse({});

    expect(config.attempts).toBe(EMAIL_JOB_RETRY_CONFIG.MAX_ATTEMPTS);
    expect(config.backoff.type).toBe('exponential');
    expect(config.backoff.delay).toBe(EMAIL_JOB_RETRY_CONFIG.BASE_DELAY_MS);
    expect(config.removeOnComplete).toBe(true);
    expect(config.removeOnFail).toBe(false);
  });

  it('deve validar configuração customizada', () => {
    const config = emailJobRetryConfigSchema.parse({
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000,
      },
      removeOnComplete: 100,
      removeOnFail: 50,
    });

    expect(config.attempts).toBe(3);
    expect(config.backoff.delay).toBe(2000);
    expect(config.removeOnComplete).toBe(100);
    expect(config.removeOnFail).toBe(50);
  });

  it('deve rejeitar attempts acima do máximo', () => {
    expect(() =>
      emailJobRetryConfigSchema.parse({
        attempts: 10,
      }),
    ).toThrow('attempts não pode exceder 5');
  });

  it('deve rejeitar attempts menor que 1', () => {
    expect(() =>
      emailJobRetryConfigSchema.parse({
        attempts: 0,
      }),
    ).toThrow('attempts deve ser >= 1');
  });

  it('deve rejeitar delay menor que base delay', () => {
    expect(() =>
      emailJobRetryConfigSchema.parse({
        backoff: {
          type: 'exponential',
          delay: 500,
        },
      }),
    ).toThrow('delay mínimo é 1000ms');
  });
});

describe('emailJobDLQEntrySchema', () => {
  const validDLQEntry = {
    jobId: '123e4567-e89b-12d3-a456-426614174000',
    outboxId: '123e4567-e89b-12d3-a456-426614174000',
    companyId: '789e4567-e89b-12d3-a456-426614174999',
    originalData: {
      to: 'test@example.com',
      subject: 'Test',
    },
    failedAttempts: 5,
    lastFailureReason: 'SMTP connection timeout',
    lastFailureCode: '421',
    lastFailureTimestamp: new Date().toISOString(),
    enqueuedAt: new Date(Date.now() - 3600000).toISOString(),
    movedToDLQAt: new Date().toISOString(),
  };

  it('deve validar entrada completa na DLQ', () => {
    const entry = emailJobDLQEntrySchema.parse(validDLQEntry);

    expect(entry.jobId).toBe(validDLQEntry.jobId);
    expect(entry.failedAttempts).toBe(5);
    expect(entry.lastFailureReason).toBe('SMTP connection timeout');
    expect(entry.ttl).toBe(EMAIL_JOB_RETRY_CONFIG.DLQ_TTL_MS);
  });

  it('deve aplicar TTL padrão se não fornecido', () => {
    const entry = emailJobDLQEntrySchema.parse(validDLQEntry);

    expect(entry.ttl).toBe(EMAIL_JOB_RETRY_CONFIG.DLQ_TTL_MS);
  });

  it('deve aceitar TTL customizado', () => {
    const entry = emailJobDLQEntrySchema.parse({
      ...validDLQEntry,
      ttl: 3600000, // 1 hora
    });

    expect(entry.ttl).toBe(3600000);
  });

  it('deve rejeitar entrada sem lastFailureReason (TASK 3.2)', () => {
    const { lastFailureReason, ...entryWithoutReason } = validDLQEntry;

    expect(() => emailJobDLQEntrySchema.parse(entryWithoutReason)).toThrow();
  });

  it('deve rejeitar lastFailureReason vazio', () => {
    expect(() =>
      emailJobDLQEntrySchema.parse({
        ...validDLQEntry,
        lastFailureReason: '',
      }),
    ).toThrow('lastFailureReason é obrigatório');
  });

  it('deve rejeitar lastFailureReason muito longo', () => {
    expect(() =>
      emailJobDLQEntrySchema.parse({
        ...validDLQEntry,
        lastFailureReason: 'a'.repeat(501),
      }),
    ).toThrow('lastFailureReason deve ter no máximo 500 caracteres');
  });

  it('deve rejeitar failedAttempts menor que MAX_ATTEMPTS', () => {
    expect(() =>
      emailJobDLQEntrySchema.parse({
        ...validDLQEntry,
        failedAttempts: 3,
      }),
    ).toThrow();
  });

  it('deve rejeitar campos extras (strict mode)', () => {
    expect(() =>
      emailJobDLQEntrySchema.parse({
        ...validDLQEntry,
        extraField: 'not allowed',
      }),
    ).toThrow();
  });
});

describe('validateDLQEntry', () => {
  const validDLQEntry = {
    jobId: '123e4567-e89b-12d3-a456-426614174000',
    outboxId: '123e4567-e89b-12d3-a456-426614174000',
    companyId: '789e4567-e89b-12d3-a456-426614174999',
    originalData: { test: 'data' },
    failedAttempts: 5,
    lastFailureReason: 'Connection timeout',
    lastFailureTimestamp: new Date().toISOString(),
    enqueuedAt: new Date().toISOString(),
    movedToDLQAt: new Date().toISOString(),
  };

  it('deve validar entrada válida', () => {
    const result = validateDLQEntry(validDLQEntry);

    expect(result).toBeDefined();
    expect(result.lastFailureReason).toBe('Connection timeout');
  });

  it('deve rejeitar entrada com lastFailureReason vazio (TASK 3.2)', () => {
    expect(() =>
      validateDLQEntry({
        ...validDLQEntry,
        lastFailureReason: '   ',
      }),
    ).toThrow('lastFailureReason é obrigatório ao mover job para DLQ');
  });

  it('deve rejeitar entrada com tentativas insuficientes', () => {
    expect(() =>
      validateDLQEntry({
        ...validDLQEntry,
        failedAttempts: 3,
      }),
    ).toThrow(); // Zod já valida que failedAttempts deve ser >= 5
  });
});

describe('tenantFairnessMetricsSchema', () => {
  it('deve validar métricas padrão', () => {
    const metrics = tenantFairnessMetricsSchema.parse({
      companyId: '123e4567-e89b-12d3-a456-426614174000',
    });

    expect(metrics.roundsWithoutProcessing).toBe(0);
    expect(metrics.currentPriority).toBe(
      EMAIL_JOB_FAIRNESS_CONFIG.ROUND_ROBIN_BASE_PRIORITY,
    );
    expect(metrics.totalProcessed).toBe(0);
    expect(metrics.consecutiveBatchCount).toBe(0);
  });

  it('deve validar métricas completas', () => {
    const now = new Date().toISOString();
    const metrics = tenantFairnessMetricsSchema.parse({
      companyId: '123e4567-e89b-12d3-a456-426614174000',
      lastProcessedAt: now,
      roundsWithoutProcessing: 3,
      currentPriority: 2,
      totalProcessed: 150,
      consecutiveBatchCount: 2,
    });

    expect(metrics.lastProcessedAt).toBe(now);
    expect(metrics.roundsWithoutProcessing).toBe(3);
    expect(metrics.currentPriority).toBe(2);
    expect(metrics.totalProcessed).toBe(150);
  });

  it('deve rejeitar prioridade abaixo do mínimo', () => {
    expect(() =>
      tenantFairnessMetricsSchema.parse({
        companyId: '123e4567-e89b-12d3-a456-426614174000',
        currentPriority: 0,
      }),
    ).toThrow('currentPriority mínima = 1');
  });

  it('deve rejeitar prioridade acima do máximo', () => {
    expect(() =>
      tenantFairnessMetricsSchema.parse({
        companyId: '123e4567-e89b-12d3-a456-426614174000',
        currentPriority: 11,
      }),
    ).toThrow('currentPriority máxima = 10');
  });
});

describe('jobRetryHistorySchema', () => {
  it('deve validar histórico de retry completo', () => {
    const history = jobRetryHistorySchema.parse({
      attempt: 3,
      failedAt: new Date().toISOString(),
      errorCode: '421',
      errorReason: 'Service temporarily unavailable',
      delayUntilNextAttempt: 4000,
      isRetryable: true,
    });

    expect(history.attempt).toBe(3);
    expect(history.errorCode).toBe('421');
    expect(history.isRetryable).toBe(true);
  });

  it('deve validar histórico mínimo', () => {
    const history = jobRetryHistorySchema.parse({
      attempt: 1,
      failedAt: new Date().toISOString(),
      errorReason: 'Unknown error',
      isRetryable: false,
    });

    expect(history.attempt).toBe(1);
    expect(history.errorCode).toBeUndefined();
    expect(history.delayUntilNextAttempt).toBeUndefined();
  });
});

describe('calculateBackoffDelay', () => {
  it('deve calcular delay para primeira tentativa (~1s)', () => {
    const delay = calculateBackoffDelay(1);

    // Com jitter de ±25%, esperamos entre 750ms e 1250ms
    expect(delay).toBeGreaterThanOrEqual(750);
    expect(delay).toBeLessThanOrEqual(1250);
  });

  it('deve calcular delay para segunda tentativa (~2s)', () => {
    const delay = calculateBackoffDelay(2);

    // 2000ms ± 25% = [1500, 2500]
    expect(delay).toBeGreaterThanOrEqual(1500);
    expect(delay).toBeLessThanOrEqual(2500);
  });

  it('deve calcular delay para terceira tentativa (~4s)', () => {
    const delay = calculateBackoffDelay(3);

    // 4000ms ± 25% = [3000, 5000]
    expect(delay).toBeGreaterThanOrEqual(3000);
    expect(delay).toBeLessThanOrEqual(5000);
  });

  it('deve respeitar limite máximo de 60s', () => {
    const delay = calculateBackoffDelay(10);

    // Mesmo com jitter, não deve exceder 60s + 25% = 75s
    expect(delay).toBeLessThanOrEqual(75000);
  });

  it('deve aplicar jitter diferente em chamadas consecutivas', () => {
    const delay1 = calculateBackoffDelay(3);
    const delay2 = calculateBackoffDelay(3);

    // Delays devem ser diferentes devido ao jitter aleatório
    // (com probabilidade muito alta)
    // Nota: teste pode falhar ocasionalmente por coincidência
    expect(delay1).not.toBe(delay2);
  });

  it('deve sempre retornar valor não-negativo', () => {
    for (let attempt = 1; attempt <= 10; attempt++) {
      const delay = calculateBackoffDelay(attempt);
      expect(delay).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('calculateRoundRobinPriority', () => {
  it('deve retornar prioridade base para 0 rodadas', () => {
    const priority = calculateRoundRobinPriority(0);

    expect(priority).toBe(EMAIL_JOB_FAIRNESS_CONFIG.ROUND_ROBIN_BASE_PRIORITY);
  });

  it('deve aumentar urgência (reduzir prioridade) com mais rodadas', () => {
    const priority0 = calculateRoundRobinPriority(0);
    const priority1 = calculateRoundRobinPriority(1);
    const priority2 = calculateRoundRobinPriority(2);

    expect(priority1).toBeLessThan(priority0);
    expect(priority2).toBeLessThan(priority1);
  });

  it('deve respeitar prioridade máxima (1 = mais urgente)', () => {
    const priority = calculateRoundRobinPriority(100);

    expect(priority).toBe(EMAIL_JOB_FAIRNESS_CONFIG.MAX_ROUND_ROBIN_PRIORITY);
  });

  it('deve calcular corretamente para sequência de rodadas', () => {
    expect(calculateRoundRobinPriority(0)).toBe(5); // base
    expect(calculateRoundRobinPriority(1)).toBe(4); // -1
    expect(calculateRoundRobinPriority(2)).toBe(3); // -2
    expect(calculateRoundRobinPriority(3)).toBe(2); // -3
    expect(calculateRoundRobinPriority(4)).toBe(1); // -4, capped
    expect(calculateRoundRobinPriority(5)).toBe(1); // capped
  });
});

describe('isRetryableError', () => {
  it('deve identificar erros SMTP temporários como retryable', () => {
    expect(isRetryableError('421')).toBe(true);
    expect(isRetryableError('450')).toBe(true);
    expect(isRetryableError('451')).toBe(true);
    expect(isRetryableError('452')).toBe(true);
  });

  it('deve identificar erros AWS SES temporários como retryable', () => {
    expect(isRetryableError('Throttling')).toBe(true);
    expect(isRetryableError('ServiceUnavailable')).toBe(true);
  });

  it('deve identificar erros permanentes como não-retryable', () => {
    expect(isRetryableError('500')).toBe(false);
    expect(isRetryableError('550')).toBe(false);
    expect(isRetryableError('554')).toBe(false);
    expect(isRetryableError('MessageRejected')).toBe(false);
  });

  it('deve retornar false para erro undefined', () => {
    expect(isRetryableError(undefined)).toBe(false);
  });

  it('deve retornar false para erro vazio', () => {
    expect(isRetryableError('')).toBe(false);
  });

  it('deve identificar erro com código parcial', () => {
    expect(isRetryableError('SMTP Error 421: Connection timeout')).toBe(true);
    expect(isRetryableError('AWS.SimpleEmailService.Throttling')).toBe(true);
  });
});

describe('Integração: retry flow completo', () => {
  it('deve simular fluxo de retry até DLQ', () => {
    const attempts = [];

    // Simula 5 tentativas falhadas
    for (let attempt = 1; attempt <= 5; attempt++) {
      const delay = calculateBackoffDelay(attempt);

      attempts.push({
        attempt,
        failedAt: new Date().toISOString(),
        errorCode: '421',
        errorReason: 'Service temporarily unavailable',
        delayUntilNextAttempt: delay,
        isRetryable: isRetryableError('421'),
      });
    }

    // Valida todos os attempts
    attempts.forEach((attemptData) => {
      const validated = jobRetryHistorySchema.parse(attemptData);
      expect(validated.isRetryable).toBe(true);
    });

    // Após 5 falhas, move para DLQ
    const dlqEntry = validateDLQEntry({
      jobId: '123e4567-e89b-12d3-a456-426614174000',
      outboxId: '123e4567-e89b-12d3-a456-426614174000',
      companyId: '789e4567-e89b-12d3-a456-426614174999',
      originalData: { test: 'data' },
      failedAttempts: 5,
      lastFailureReason: 'Service temporarily unavailable after 5 attempts',
      lastFailureCode: '421',
      lastFailureTimestamp: new Date().toISOString(),
      enqueuedAt: new Date(Date.now() - 3600000).toISOString(),
      movedToDLQAt: new Date().toISOString(),
    });

    expect(dlqEntry.failedAttempts).toBe(5);
    expect(dlqEntry.ttl).toBe(EMAIL_JOB_RETRY_CONFIG.DLQ_TTL_MS);
  });

  it('deve simular fairness round-robin entre tenants', () => {
    const tenantA = tenantFairnessMetricsSchema.parse({
      companyId: '123e4567-e89b-12d3-a456-426614174000',
      roundsWithoutProcessing: 3,
    });

    const tenantB = tenantFairnessMetricsSchema.parse({
      companyId: '789e4567-e89b-12d3-a456-426614174999',
      roundsWithoutProcessing: 0,
    });

    const priorityA = calculateRoundRobinPriority(
      tenantA.roundsWithoutProcessing,
    );
    const priorityB = calculateRoundRobinPriority(
      tenantB.roundsWithoutProcessing,
    );

    // Tenant A deve ter maior urgência (prioridade menor)
    expect(priorityA).toBeLessThan(priorityB);
  });
});
