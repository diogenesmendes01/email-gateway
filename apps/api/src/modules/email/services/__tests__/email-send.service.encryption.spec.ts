/**
 * Unit tests for EmailSendService encryption integration
 * 
 * Tests the integration between EmailSendService and encryption utilities
 * to ensure CPF/CNPJ encryption works correctly in the service layer.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { EmailSendService } from '../email-send.service';
import { InternalServerErrorException } from '@nestjs/common';
import * as encryptionUtils from '@email-gateway/shared';
import { QueueService } from '../../../queue/queue.service';

// Mock the shared encryption utilities
jest.mock('@email-gateway/shared', () => ({
  encryptCpfCnpj: jest.fn(),
  decryptCpfCnpj: jest.fn(),
  hashCpfCnpjSha256: jest.fn(),
}));

// Mock the database client
jest.mock('@email-gateway/database', () => ({
  prisma: {
    recipient: {
      upsert: jest.fn(),
    },
    idempotencyKey: {
      findUnique: jest.fn(),
      delete: jest.fn(),
      create: jest.fn(),
    },
    emailOutbox: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
  },
}));

describe('EmailSendService - Encryption Integration', () => {
  let service: EmailSendService;
  let mockEncryptCpfCnpj: jest.MockedFunction<typeof encryptionUtils.encryptCpfCnpj>;
  let mockDecryptCpfCnpj: jest.MockedFunction<typeof encryptionUtils.decryptCpfCnpj>;
  let mockHashCpfCnpjSha256: jest.MockedFunction<typeof encryptionUtils.hashCpfCnpjSha256>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmailSendService,
        {
          provide: QueueService,
          useValue: {
            addEmailToQueue: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<EmailSendService>(EmailSendService);
    
    // Get mocked functions
    mockEncryptCpfCnpj = encryptionUtils.encryptCpfCnpj as jest.MockedFunction<typeof encryptionUtils.encryptCpfCnpj>;
    mockDecryptCpfCnpj = encryptionUtils.decryptCpfCnpj as jest.MockedFunction<typeof encryptionUtils.decryptCpfCnpj>;
    mockHashCpfCnpjSha256 = encryptionUtils.hashCpfCnpjSha256 as jest.MockedFunction<typeof encryptionUtils.hashCpfCnpjSha256>;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getEncryptionKey', () => {
    beforeEach(() => {
      // Mock process.env
      process.env.ENCRYPTION_KEY = 'test-encryption-key-32-characters-long';
    });

    afterEach(() => {
      delete process.env.ENCRYPTION_KEY;
    });

    it('should return encryption key when valid', () => {
      // Access private method for testing
      const result = (service as any).getEncryptionKey();
      
      expect(result).toBe('test-encryption-key-32-characters-long');
    });

    it('should throw error when ENCRYPTION_KEY is not set', () => {
      delete process.env.ENCRYPTION_KEY;

      expect(() => {
        (service as any).getEncryptionKey();
      }).toThrow('ENCRYPTION_KEY must be set and at least 32 characters');
    });

    it('should throw error when ENCRYPTION_KEY is too short', () => {
      process.env.ENCRYPTION_KEY = 'short';

      expect(() => {
        (service as any).getEncryptionKey();
      }).toThrow('ENCRYPTION_KEY must be set and at least 32 characters');
    });
  });

  describe('decryptCpfCnpj', () => {
    beforeEach(() => {
      process.env.ENCRYPTION_KEY = 'test-encryption-key-32-characters-long';
    });

    afterEach(() => {
      delete process.env.ENCRYPTION_KEY;
    });

    it('should decrypt CPF/CNPJ successfully', () => {
      // Arrange
      const encryptedData = 'encrypted-data';
      const salt = 'salt-data';
      const expectedDecrypted = '12345678901';
      const requestId = 'test-request-id';

      mockDecryptCpfCnpj.mockReturnValue(expectedDecrypted);

      // Act
      const result = service.decryptCpfCnpj(encryptedData, salt, requestId);

      // Assert
      expect(result).toBe(expectedDecrypted);
      expect(mockDecryptCpfCnpj).toHaveBeenCalledWith(
        encryptedData,
        'test-encryption-key-32-characters-long',
        salt
      );
    });

    it('should throw InternalServerErrorException on decryption failure', () => {
      // Arrange
      const encryptedData = 'invalid-encrypted-data';
      const salt = 'salt-data';
      const requestId = 'test-request-id';
      const error = new Error('Decryption failed');

      mockDecryptCpfCnpj.mockImplementation(() => {
        throw error;
      });

      // Act & Assert
      expect(() => {
        service.decryptCpfCnpj(encryptedData, salt, requestId);
      }).toThrow(InternalServerErrorException);

      expect(() => {
        service.decryptCpfCnpj(encryptedData, salt, requestId);
      }).toThrow('Unable to decrypt sensitive data');
    });

    it('should handle decryption without requestId', () => {
      // Arrange
      const encryptedData = 'encrypted-data';
      const salt = 'salt-data';
      const expectedDecrypted = '12345678901';

      mockDecryptCpfCnpj.mockReturnValue(expectedDecrypted);

      // Act
      const result = service.decryptCpfCnpj(encryptedData, salt);

      // Assert
      expect(result).toBe(expectedDecrypted);
      expect(mockDecryptCpfCnpj).toHaveBeenCalledWith(
        encryptedData,
        'test-encryption-key-32-characters-long',
        salt
      );
    });
  });

  describe('processRecipient with CPF/CNPJ encryption', () => {
    beforeEach(() => {
      process.env.ENCRYPTION_KEY = 'test-encryption-key-32-characters-long';
    });

    afterEach(() => {
      delete process.env.ENCRYPTION_KEY;
    });

    it('should encrypt CPF/CNPJ when provided', async () => {
      // Arrange
      const companyId = 'test-company-id';
      const recipient = {
        externalId: 'ext-123',
        email: 'test@example.com',
        cpfCnpj: '12345678901',
        nome: 'Test User',
      };

      const expectedHash = 'hash-123';
      const expectedEncrypted = 'encrypted-data';
      const expectedSalt = 'salt-data';

      mockHashCpfCnpjSha256.mockReturnValue(expectedHash);
      mockEncryptCpfCnpj.mockReturnValue({
        encrypted: expectedEncrypted,
        salt: expectedSalt,
      });

      // Mock prisma.recipient.upsert
      const mockUpsert = require('@email-gateway/database').prisma.recipient.upsert;
      mockUpsert.mockResolvedValue({ id: 'recipient-id' });

      // Act
      const result = await (service as any).processRecipient(companyId, recipient);

      // Assert
      expect(result).toBe('recipient-id');
      expect(mockHashCpfCnpjSha256).toHaveBeenCalledWith('12345678901');
      expect(mockEncryptCpfCnpj).toHaveBeenCalledWith(
        '12345678901',
        'test-encryption-key-32-characters-long'
      );
      expect(mockUpsert).toHaveBeenCalledWith({
        where: {
          companyId_externalId: {
            companyId: 'test-company-id',
            externalId: 'ext-123',
          },
        },
        create: {
          company: { connect: { id: 'test-company-id' } },
          email: 'test@example.com',
          externalId: 'ext-123',
          cpfCnpjHash: expectedHash,
          cpfCnpjEnc: expectedEncrypted,
          cpfCnpjSalt: expectedSalt,
          nome: 'Test User',
        },
        update: {
          company: { connect: { id: 'test-company-id' } },
          email: 'test@example.com',
          externalId: 'ext-123',
          cpfCnpjHash: expectedHash,
          cpfCnpjEnc: expectedEncrypted,
          cpfCnpjSalt: expectedSalt,
          nome: 'Test User',
        },
      });
    });

    it('should handle recipient without CPF/CNPJ', async () => {
      // Arrange
      const companyId = 'test-company-id';
      const recipient = {
        externalId: 'ext-123',
        email: 'test@example.com',
        nome: 'Test User',
      };

      // Mock prisma.recipient.upsert
      const mockUpsert = require('@email-gateway/database').prisma.recipient.upsert;
      mockUpsert.mockResolvedValue({ id: 'recipient-id' });

      // Act
      const result = await (service as any).processRecipient(companyId, recipient);

      // Assert
      expect(result).toBe('recipient-id');
      expect(mockHashCpfCnpjSha256).not.toHaveBeenCalled();
      expect(mockEncryptCpfCnpj).not.toHaveBeenCalled();
    });

    it('should handle recipient with only externalId', async () => {
      // Arrange
      const companyId = 'test-company-id';
      const recipient = {
        externalId: 'ext-123',
        email: 'test@example.com',
      };

      // Mock prisma.recipient.upsert
      const mockUpsert = require('@email-gateway/database').prisma.recipient.upsert;
      mockUpsert.mockResolvedValue({ id: 'recipient-id' });

      // Act
      const result = await (service as any).processRecipient(companyId, recipient);

      // Assert
      expect(result).toBe('recipient-id');
      expect(mockUpsert).toHaveBeenCalledWith({
        where: {
          companyId_externalId: {
            companyId: 'test-company-id',
            externalId: 'ext-123',
          },
        },
        create: {
          company: { connect: { id: 'test-company-id' } },
          email: 'test@example.com',
          externalId: 'ext-123',
        },
        update: {
          company: { connect: { id: 'test-company-id' } },
          email: 'test@example.com',
          externalId: 'ext-123',
        },
      });
    });
  });
});
