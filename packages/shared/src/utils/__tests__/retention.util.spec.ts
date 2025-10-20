/**
 * @email-gateway/shared - Data Retention Utilities Tests
 *
 * Testes para utilitários de retenção de dados
 *
 * TASK 5.2 — PII, masking, criptografia, retenção e acesso
 */

import {
  calculateExpirationDate,
  shouldExpireRecord,
  generateCleanupQuery,
  generatePseudonymizationQuery,
  generateCleanupQueries,
  generateEmailSystemCleanupQueries,
  validateRetentionConfig,
  DEFAULT_RETENTION_CONFIG,
  RetentionConfig,
  TableCleanupConfig,
} from '../retention.util';

describe('Data Retention Utilities', () => {
  describe('calculateExpirationDate', () => {
    it('should calculate expiration date for 12 months', () => {
      const months = 12;
      const expirationDate = calculateExpirationDate(months);
      
      expect(expirationDate).toBeInstanceOf(Date);
      expect(expirationDate).not.toBeNull();
    });

    it('should return null for indefinite retention', () => {
      const months = -1;
      const expirationDate = calculateExpirationDate(months);
      
      expect(expirationDate).toBeNull();
    });

    it('should calculate future date', () => {
      const months = 6;
      const expirationDate = calculateExpirationDate(months);
      const now = new Date();
      
      expect(expirationDate!.getTime()).toBeGreaterThan(now.getTime());
    });
  });

  describe('shouldExpireRecord', () => {
    it('should not expire record with indefinite retention', () => {
      const createdAt = new Date('2020-01-01');
      const retentionMonths = -1;
      
      const shouldExpire = shouldExpireRecord(createdAt, retentionMonths);
      
      expect(shouldExpire).toBe(false);
    });

    it('should expire old record', () => {
      const createdAt = new Date('2020-01-01');
      const retentionMonths = 12;
      
      const shouldExpire = shouldExpireRecord(createdAt, retentionMonths);
      
      expect(shouldExpire).toBe(true);
    });

    it('should not expire recent record', () => {
      const createdAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000); // 1 year in the future
      const retentionMonths = 12;
      
      const shouldExpire = shouldExpireRecord(createdAt, retentionMonths);
      
      expect(shouldExpire).toBe(false);
    });
  });

  describe('generateCleanupQuery', () => {
    it('should generate DELETE query for expired records', () => {
      const tableName = 'test_table';
      const retentionMonths = 12;
      
      const query = generateCleanupQuery(tableName, retentionMonths);
      
      expect(query).toContain('DELETE FROM test_table');
      expect(query).toContain('WHERE created_at <');
    });

    it('should return empty string for indefinite retention', () => {
      const tableName = 'test_table';
      const retentionMonths = -1;
      
      const query = generateCleanupQuery(tableName, retentionMonths);
      
      expect(query).toBe('');
    });

    it('should use custom created_at column', () => {
      const tableName = 'test_table';
      const retentionMonths = 12;
      const createdAtColumn = 'timestamp';
      
      const query = generateCleanupQuery(tableName, retentionMonths, createdAtColumn);
      
      expect(query).toContain('WHERE timestamp <');
    });
  });

  describe('generatePseudonymizationQuery', () => {
    it('should generate UPDATE query for pseudonymization', () => {
      const tableName = 'test_table';
      const retentionMonths = 12;
      
      const query = generatePseudonymizationQuery(tableName, retentionMonths);
      
      expect(query).toContain('UPDATE test_table');
      expect(query).toContain('SET');
      expect(query).toContain('cpf_cnpj_enc = \'***PSEUDONYMIZED***\'');
      expect(query).toContain('email = \'***PSEUDONYMIZED***\'');
    });

    it('should return empty string for indefinite retention', () => {
      const tableName = 'test_table';
      const retentionMonths = -1;
      
      const query = generatePseudonymizationQuery(tableName, retentionMonths);
      
      expect(query).toBe('');
    });
  });

  describe('generateCleanupQueries', () => {
    it('should generate queries for multiple tables', () => {
      const configs: TableCleanupConfig[] = [
        {
          tableName: 'table1',
          retentionMonths: 12,
          pseudonymizeBeforeDelete: true,
        },
        {
          tableName: 'table2',
          retentionMonths: 6,
          pseudonymizeBeforeDelete: false,
        },
      ];
      
      const queries = generateCleanupQueries(configs);
      
      expect(queries.length).toBeGreaterThan(0);
      expect(queries.some(q => q.includes('UPDATE table1'))).toBe(true);
      expect(queries.some(q => q.includes('DELETE FROM table1'))).toBe(true);
      expect(queries.some(q => q.includes('DELETE FROM table2'))).toBe(true);
    });

    it('should skip indefinite retention tables', () => {
      const configs: TableCleanupConfig[] = [
        {
          tableName: 'table1',
          retentionMonths: -1,
        },
        {
          tableName: 'table2',
          retentionMonths: 12,
        },
      ];
      
      const queries = generateCleanupQueries(configs);
      
      expect(queries.some(q => q.includes('table1'))).toBe(false);
      expect(queries.some(q => q.includes('table2'))).toBe(true);
    });
  });

  describe('generateEmailSystemCleanupQueries', () => {
    it('should generate queries for email system tables', () => {
      const queries = generateEmailSystemCleanupQueries();
      
      expect(queries.length).toBeGreaterThan(0);
      expect(queries.some(q => q.includes('email_logs'))).toBe(true);
      expect(queries.some(q => q.includes('email_events'))).toBe(true);
      expect(queries.some(q => q.includes('email_outbox'))).toBe(true);
    });

    it('should use custom retention config', () => {
      const customConfig: RetentionConfig = {
        emailLogsMonths: 6,
        emailEventsMonths: 12,
        emailOutboxMonths: 6,
        recipientsMonths: -1,
      };
      
      const queries = generateEmailSystemCleanupQueries(customConfig);
      
      expect(queries.length).toBeGreaterThan(0);
    });
  });

  describe('validateRetentionConfig', () => {
    it('should validate correct retention config', () => {
      const config: RetentionConfig = {
        emailLogsMonths: 12,
        emailEventsMonths: 18,
        emailOutboxMonths: 12,
        recipientsMonths: -1,
      };
      
      const isValid = validateRetentionConfig(config);
      
      expect(isValid).toBe(true);
    });

    it('should reject invalid retention values', () => {
      const config: RetentionConfig = {
        emailLogsMonths: -2, // Invalid: less than -1
        emailEventsMonths: 18,
        emailOutboxMonths: 12,
        recipientsMonths: -1,
      };
      
      const isValid = validateRetentionConfig(config);
      
      expect(isValid).toBe(false);
    });

    it('should reject when email_events < email_logs', () => {
      const config: RetentionConfig = {
        emailLogsMonths: 18,
        emailEventsMonths: 12, // Invalid: less than email_logs
        emailOutboxMonths: 12,
        recipientsMonths: -1,
      };
      
      const isValid = validateRetentionConfig(config);
      
      expect(isValid).toBe(false);
    });

    it('should accept when email_events >= email_logs', () => {
      const config: RetentionConfig = {
        emailLogsMonths: 12,
        emailEventsMonths: 12, // Valid: equal to email_logs
        emailOutboxMonths: 12,
        recipientsMonths: -1,
      };
      
      const isValid = validateRetentionConfig(config);
      
      expect(isValid).toBe(true);
    });
  });

  describe('DEFAULT_RETENTION_CONFIG', () => {
    it('should have correct default values', () => {
      expect(DEFAULT_RETENTION_CONFIG.emailLogsMonths).toBe(12);
      expect(DEFAULT_RETENTION_CONFIG.emailEventsMonths).toBe(18);
      expect(DEFAULT_RETENTION_CONFIG.emailOutboxMonths).toBe(12);
      expect(DEFAULT_RETENTION_CONFIG.recipientsMonths).toBe(-1);
    });

    it('should be valid configuration', () => {
      const isValid = validateRetentionConfig(DEFAULT_RETENTION_CONFIG);
      
      expect(isValid).toBe(true);
    });
  });
});
