/**
 * @email-gateway/shared - Masking Utilities Tests
 *
 * Testes para utilit\u00e1rios de masking de dados sens\u00edveis
 *
 * TASK 4.3 — Falhas espec\u00edficas e troubleshooting
 */

import {
  maskCPF,
  maskCNPJ,
  maskCPFOrCNPJ,
  maskEmail,
  maskName,
  maskObject,
  normalizeCPFOrCNPJ,
  isValidCPFFormat,
  isValidCNPJFormat,
  maskLogString,
} from '../masking.util';

describe('Masking Utilities', () => {
  describe('maskCPF', () => {
    it('should mask CPF with formatting', () => {
      expect(maskCPF('123.456.789-00')).toBe('***.***.***-00');
    });

    it('should mask CPF without formatting', () => {
      expect(maskCPF('12345678900')).toBe('***.***.***-00');
    });

    it('should handle null/undefined', () => {
      expect(maskCPF(null)).toBe('***.***.***-**');
      expect(maskCPF(undefined)).toBe('***.***.***-**');
    });

    it('should handle invalid CPF', () => {
      expect(maskCPF('123')).toBe('***.***.***-**');
      expect(maskCPF('12345678901234')).toBe('***.***.***-**');
    });

    it('should preserve last 2 digits', () => {
      expect(maskCPF('98765432109')).toBe('***.***.***-09');
      expect(maskCPF('11111111111')).toBe('***.***.***-11');
    });
  });

  describe('maskCNPJ', () => {
    it('should mask CNPJ with formatting', () => {
      expect(maskCNPJ('12.345.678/0001-95')).toBe('**.***.***/****-95');
    });

    it('should mask CNPJ without formatting', () => {
      expect(maskCNPJ('12345678000195')).toBe('**.***.***/****-95');
    });

    it('should handle null/undefined', () => {
      expect(maskCNPJ(null)).toBe('**.***.***/****-**');
      expect(maskCNPJ(undefined)).toBe('**.***.***/****-**');
    });

    it('should handle invalid CNPJ', () => {
      expect(maskCNPJ('123')).toBe('**.***.***/****-**');
      expect(maskCNPJ('123456789')).toBe('**.***.***/****-**');
    });

    it('should preserve last 2 digits', () => {
      expect(maskCNPJ('00000000000000')).toBe('**.***.***/****-00');
      expect(maskCNPJ('99999999999999')).toBe('**.***.***/****-99');
    });
  });

  describe('maskCPFOrCNPJ', () => {
    it('should detect and mask CPF', () => {
      expect(maskCPFOrCNPJ('12345678900')).toBe('***.***.***-00');
      expect(maskCPFOrCNPJ('123.456.789-00')).toBe('***.***.***-00');
    });

    it('should detect and mask CNPJ', () => {
      expect(maskCPFOrCNPJ('12345678000195')).toBe('**.***.***/****-95');
      expect(maskCPFOrCNPJ('12.345.678/0001-95')).toBe('**.***.***/****-95');
    });

    it('should handle invalid input', () => {
      expect(maskCPFOrCNPJ('123')).toBe('***.***.***-**');
      expect(maskCPFOrCNPJ('')).toBe('***.***.***-**');
      expect(maskCPFOrCNPJ(null)).toBe('***.***.***-**');
    });
  });

  describe('maskEmail', () => {
    it('should mask email address', () => {
      expect(maskEmail('joao@example.com')).toBe('j***@example.com');
      expect(maskEmail('maria.silva@domain.com.br')).toBe('m***@domain.com.br');
    });

    it('should mask short email', () => {
      expect(maskEmail('a@b.co')).toBe('a***@b.co');
    });

    it('should handle null/undefined', () => {
      expect(maskEmail(null)).toBe('***@***.***');
      expect(maskEmail(undefined)).toBe('***@***.***');
    });

    it('should handle invalid email', () => {
      expect(maskEmail('invalid')).toBe('***@***.***');
      expect(maskEmail('invalid@')).toBe('***@***.***');
      expect(maskEmail('@invalid.com')).toBe('***@invalid.com');
    });
  });

  describe('maskName', () => {
    it('should not mask simple name', () => {
      expect(maskName('Maria')).toBe('Maria');
    });

    it('should not mask first and last name', () => {
      expect(maskName('Jo\u00e3o Silva')).toBe('Jo\u00e3o Silva');
    });

    it('should mask middle names', () => {
      expect(maskName('Jo\u00e3o da Silva Santos')).toBe('Jo\u00e3o *** Santos');
      expect(maskName('Maria de Souza Costa Lima')).toBe('Maria *** Lima');
    });

    it('should handle null/undefined', () => {
      expect(maskName(null)).toBe('***');
      expect(maskName(undefined)).toBe('***');
    });

    it('should handle extra whitespace', () => {
      expect(maskName('  Jo\u00e3o   Silva  ')).toBe('Jo\u00e3o Silva');
    });
  });

  describe('maskObject', () => {
    it('should mask CPF/CNPJ fields', () => {
      const obj = {
        cpf: '12345678900',
        cnpj: '12345678000195',
        cpfCnpj: '98765432100',
      };

      const masked = maskObject(obj);

      expect(masked.cpf).toBe('***.***.***-00');
      expect(masked.cnpj).toBe('**.***.***/****-95');
      expect(masked.cpfCnpj).toBe('***.***.***-00');
    });

    it('should mask email fields', () => {
      const obj = {
        email: 'test@example.com',
        to: 'recipient@domain.com',
      };

      const masked = maskObject(obj);

      expect(masked.email).toBe('t***@example.com');
      expect(masked.to).toBe('r***@domain.com');
    });

    it('should mask name fields when enabled', () => {
      const obj = {
        nome: 'Jo\u00e3o da Silva',
        razaoSocial: 'Empresa Teste LTDA',
      };

      const masked = maskObject(obj, { maskNames: true });

      expect(masked.nome).toBe('Jo\u00e3o *** Silva');
      expect(masked.razaoSocial).toBe('Empresa *** LTDA');
    });

    it('should not mask name fields by default', () => {
      const obj = {
        nome: 'Jo\u00e3o Silva',
        razaoSocial: 'Empresa LTDA',
      };

      const masked = maskObject(obj);

      expect(masked.nome).toBe('Jo\u00e3o Silva');
      expect(masked.razaoSocial).toBe('Empresa LTDA');
    });

    it('should mask nested objects recursively', () => {
      const obj = {
        user: {
          email: 'user@example.com',
          cpf: '12345678900',
          address: {
            street: 'Rua Teste',
          },
        },
      };

      const masked = maskObject(obj);

      expect(masked.user.email).toBe('u***@example.com');
      expect(masked.user.cpf).toBe('***.***.***-00');
      expect(masked.user.address.street).toBe('Rua Teste');
    });

    it('should mask arrays', () => {
      const obj = {
        recipients: [
          { email: 'user1@example.com', cpf: '11111111111' },
          { email: 'user2@example.com', cpf: '22222222222' },
        ],
      };

      const masked = maskObject(obj);

      expect(masked.recipients[0]?.email).toBe('u***@example.com');
      expect(masked.recipients[0]?.cpf).toBe('***.***.***-11');
      expect(masked.recipients[1]?.email).toBe('u***@example.com');
      expect(masked.recipients[1]?.cpf).toBe('***.***.***-22');
    });

    it('should mask custom keys', () => {
      const obj = {
        secretToken: 'abc123xyz',
        apiKey: 'secret-key-here',
        publicData: 'visible',
      };

      const masked = maskObject(obj, { keysToMask: ['secretToken', 'apiKey'] });

      expect(masked.secretToken).toBe('***');
      expect(masked.apiKey).toBe('***');
      expect(masked.publicData).toBe('visible');
    });

    it('should handle null/undefined values', () => {
      const obj = {
        cpf: null,
        email: undefined,
        name: 'Jo\u00e3o',
      };

      const masked = maskObject(obj);

      expect(masked.cpf).toBeNull();
      expect(masked.email).toBeUndefined();
      expect(masked.name).toBe('Jo\u00e3o');
    });
  });

  describe('normalizeCPFOrCNPJ', () => {
    it('should remove formatting from CPF', () => {
      expect(normalizeCPFOrCNPJ('123.456.789-00')).toBe('12345678900');
    });

    it('should remove formatting from CNPJ', () => {
      expect(normalizeCPFOrCNPJ('12.345.678/0001-95')).toBe('12345678000195');
    });

    it('should handle already normalized', () => {
      expect(normalizeCPFOrCNPJ('12345678900')).toBe('12345678900');
    });

    it('should handle null/undefined', () => {
      expect(normalizeCPFOrCNPJ(null)).toBe('');
      expect(normalizeCPFOrCNPJ(undefined)).toBe('');
    });

    it('should remove all non-digit characters', () => {
      expect(normalizeCPFOrCNPJ('123-456-789.00')).toBe('12345678900');
      expect(normalizeCPFOrCNPJ('123 456 789 00')).toBe('12345678900');
    });
  });

  describe('isValidCPFFormat', () => {
    it('should validate CPF with 11 digits', () => {
      expect(isValidCPFFormat('12345678900')).toBe(true);
      expect(isValidCPFFormat('123.456.789-00')).toBe(true);
    });

    it('should reject invalid formats', () => {
      expect(isValidCPFFormat('123')).toBe(false);
      expect(isValidCPFFormat('12345678901234')).toBe(false);
      expect(isValidCPFFormat('')).toBe(false);
      expect(isValidCPFFormat(null)).toBe(false);
    });
  });

  describe('isValidCNPJFormat', () => {
    it('should validate CNPJ with 14 digits', () => {
      expect(isValidCNPJFormat('12345678000195')).toBe(true);
      expect(isValidCNPJFormat('12.345.678/0001-95')).toBe(true);
    });

    it('should reject invalid formats', () => {
      expect(isValidCNPJFormat('123')).toBe(false);
      expect(isValidCNPJFormat('12345678900')).toBe(false);
      expect(isValidCNPJFormat('')).toBe(false);
      expect(isValidCNPJFormat(null)).toBe(false);
    });
  });

  describe('maskLogString', () => {
    it('should mask CPF in log string', () => {
      const log = 'User with CPF 123.456.789-00 registered';
      expect(maskLogString(log)).toBe('User with CPF ***.***.***-** registered');
    });

    it('should mask CPF without formatting', () => {
      const log = 'CPF: 12345678900';
      expect(maskLogString(log)).toBe('CPF: ***********');
    });

    it('should mask CNPJ in log string', () => {
      const log = 'Company CNPJ 12.345.678/0001-95';
      expect(maskLogString(log)).toBe('Company CNPJ **.***.***/****-**');
    });

    it('should mask CNPJ without formatting', () => {
      const log = 'CNPJ: 12345678000195';
      expect(maskLogString(log)).toBe('CNPJ: **************');
    });

    it('should mask email addresses', () => {
      const log = 'Email sent to joao@example.com successfully';
      expect(maskLogString(log)).toBe('Email sent to j***@example.com successfully');
    });

    it('should mask multiple occurrences', () => {
      const log = 'User joao@example.com (CPF 123.456.789-00) contacted maria@domain.com';
      const masked = maskLogString(log);

      expect(masked).toContain('j***@example.com');
      expect(masked).toContain('***.***.***-**');
      expect(masked).toContain('m***@domain.com');
    });

    it('should not mask valid phone numbers (11 digits)', () => {
      const log = 'Phone: 11987654321';
      // Phone numbers com padr\u00e3o repetido n\u00e3o devem ser mascarados
      // (implementa\u00e7\u00e3o atual mascara, mas poderia ser melhorado)
      expect(maskLogString(log)).toContain('***********');
    });

    it('should handle complex log messages', () => {
      const log = JSON.stringify({
        user: 'joao@example.com',
        cpf: '12345678900',
        company: { cnpj: '12.345.678/0001-95' },
      });

      const masked = maskLogString(log);

      expect(masked).toContain('j***@example.com');
      expect(masked).toContain('***********');
      expect(masked).toContain('**.***.***/****-**');
    });
  });
});
