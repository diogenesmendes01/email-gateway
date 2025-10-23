/**
 * Recipient Service Unit Tests
 *
 * Tests all CRUD operations for RecipientService
 */

import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { RecipientService } from '../recipient.service';
import * as encryptionUtil from '@email-gateway/shared';

// Mock prisma
jest.mock('@email-gateway/database', () => ({
  prisma: {
    recipient: {
      create: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      count: jest.fn(),
      update: jest.fn(),
    },
  },
}));

// Import mocked prisma
import { prisma } from '@email-gateway/database';

describe('RecipientService', () => {
  let service: RecipientService;

  const mockCompanyId = 'company-123';
  const mockRecipient: any = {
    id: 'recipient-123',
    companyId: mockCompanyId,
    email: 'test@example.com',
    externalId: 'ext-123',
    cpfCnpjHash: 'hash-123',
    cpfCnpjEnc: 'encrypted-123',
    cpfCnpjSalt: 'salt-123',
    razaoSocial: null,
    nome: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [RecipientService],
    }).compile();

    service = module.get<RecipientService>(RecipientService);

    // Set environment variable
    process.env.ENCRYPTION_KEY = 'test-encryption-key-32-characters';

    // Clear all mocks
    jest.clearAllMocks();
  });

  afterEach(() => {
    delete process.env.ENCRYPTION_KEY;
  });

  describe('create', () => {
    it('should create recipient without CPF/CNPJ', async () => {
      const dto = {
        email: 'test@example.com',
        externalId: 'ext-123',
      };

      const expectedRecipient = {
        ...mockRecipient,
        cpfCnpjHash: null,
        cpfCnpjEnc: null,
        cpfCnpjSalt: null,
      };

      (prisma.recipient.create as jest.Mock).mockResolvedValue(expectedRecipient);

      const result = await service.create(mockCompanyId, dto);

      expect(prisma.recipient.create).toHaveBeenCalledWith({
        data: {
          email: dto.email,
          externalId: dto.externalId,
          companyId: mockCompanyId,
        },
      });
      expect(result).toEqual(expectedRecipient);
    });

    it('should create recipient with CPF/CNPJ and encrypt it', async () => {
      const dto = {
        email: 'test@example.com',
        externalId: 'ext-123',
        cpfCnpj: '12345678901',
      };

      (prisma.recipient.create as jest.Mock).mockResolvedValue(mockRecipient);

      const result = await service.create(mockCompanyId, dto);

      expect(prisma.recipient.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          email: dto.email,
          externalId: dto.externalId,
          companyId: mockCompanyId,
          cpfCnpjHash: expect.any(String),
          cpfCnpjEnc: expect.any(String),
          cpfCnpjSalt: expect.any(String),
        }),
      });
      expect(result).toEqual(mockRecipient);
    });

    it('should throw error if ENCRYPTION_KEY is not set', async () => {
      delete process.env.ENCRYPTION_KEY;

      const dto = {
        email: 'test@example.com',
        cpfCnpj: '12345678901',
      };

      await expect(service.create(mockCompanyId, dto)).rejects.toThrow(
        'ENCRYPTION_KEY environment variable is not set',
      );
    });
  });

  describe('findAll', () => {
    it('should return paginated recipients', async () => {
      const query = { skip: 0, limit: 20 };
      const mockRecipients = [mockRecipient];

      (prisma.recipient.findMany as jest.Mock).mockResolvedValue(mockRecipients);
      (prisma.recipient.count as jest.Mock).mockResolvedValue(1);

      const result = await service.findAll(mockCompanyId, query);

      expect(prisma.recipient.findMany).toHaveBeenCalledWith({
        where: { companyId: mockCompanyId, deletedAt: null },
        skip: 0,
        take: 20,
        orderBy: { createdAt: 'desc' },
      });
      expect(prisma.recipient.count).toHaveBeenCalledWith({
        where: { companyId: mockCompanyId, deletedAt: null },
      });
      expect(result).toEqual({ data: mockRecipients, total: 1 });
    });

    it('should filter by email', async () => {
      const query = { email: 'test@', skip: 0, limit: 20 };
      const mockRecipients = [mockRecipient];

      (prisma.recipient.findMany as jest.Mock).mockResolvedValue(mockRecipients);
      (prisma.recipient.count as jest.Mock).mockResolvedValue(1);

      const result = await service.findAll(mockCompanyId, query);

      expect(prisma.recipient.findMany).toHaveBeenCalledWith({
        where: {
          companyId: mockCompanyId,
          deletedAt: null,
          email: { contains: 'test@', mode: 'insensitive' },
        },
        skip: 0,
        take: 20,
        orderBy: { createdAt: 'desc' },
      });
      expect(result).toEqual({ data: mockRecipients, total: 1 });
    });

    it('should use default pagination values', async () => {
      const query = { skip: 0, limit: 20 };
      const mockRecipients = [mockRecipient];

      (prisma.recipient.findMany as jest.Mock).mockResolvedValue(mockRecipients);
      (prisma.recipient.count as jest.Mock).mockResolvedValue(1);

      const result = await service.findAll(mockCompanyId, query);

      expect(prisma.recipient.findMany).toHaveBeenCalledWith({
        where: { companyId: mockCompanyId, deletedAt: null },
        skip: 0,
        take: 20,
        orderBy: { createdAt: 'desc' },
      });
      expect(result).toEqual({ data: mockRecipients, total: 1 });
    });
  });

  describe('findOne', () => {
    it('should return recipient by id', async () => {
      (prisma.recipient.findFirst as jest.Mock).mockResolvedValue(mockRecipient);

      const result = await service.findOne(mockCompanyId, 'recipient-123');

      expect(prisma.recipient.findFirst).toHaveBeenCalledWith({
        where: { id: 'recipient-123', companyId: mockCompanyId, deletedAt: null },
      });
      expect(result).toEqual(mockRecipient);
    });

    it('should return null if recipient not found', async () => {
      (prisma.recipient.findFirst as jest.Mock).mockResolvedValue(null);

      const result = await service.findOne(mockCompanyId, 'non-existent');

      expect(result).toBeNull();
    });
  });

  describe('findByHash', () => {
    it('should return recipient by CPF/CNPJ hash', async () => {
      (prisma.recipient.findFirst as jest.Mock).mockResolvedValue(mockRecipient);

      const result = await service.findByHash(mockCompanyId, 'hash-123');

      expect(prisma.recipient.findFirst).toHaveBeenCalledWith({
        where: { companyId: mockCompanyId, cpfCnpjHash: 'hash-123', deletedAt: null },
      });
      expect(result).toEqual(mockRecipient);
    });

    it('should return null if recipient not found', async () => {
      (prisma.recipient.findFirst as jest.Mock).mockResolvedValue(null);

      const result = await service.findByHash(mockCompanyId, 'non-existent');

      expect(result).toBeNull();
    });
  });

  describe('update', () => {
    it('should update recipient', async () => {
      const dto = { email: 'updated@example.com' };
      const updatedRecipient = { ...mockRecipient, email: 'updated@example.com' };

      (prisma.recipient.findFirst as jest.Mock).mockResolvedValue(mockRecipient);
      (prisma.recipient.update as jest.Mock).mockResolvedValue(updatedRecipient);

      const result = await service.update(mockCompanyId, 'recipient-123', dto);

      expect(prisma.recipient.findFirst).toHaveBeenCalledWith({
        where: { id: 'recipient-123', companyId: mockCompanyId, deletedAt: null },
      });
      expect(prisma.recipient.update).toHaveBeenCalledWith({
        where: { id: 'recipient-123' },
        data: dto,
      });
      expect(result).toEqual(updatedRecipient);
    });

    it('should throw NotFoundException if recipient not found', async () => {
      const dto = { email: 'updated@example.com' };

      (prisma.recipient.findFirst as jest.Mock).mockResolvedValue(null);

      await expect(service.update(mockCompanyId, 'non-existent', dto)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should update recipient with new CPF/CNPJ and re-encrypt', async () => {
      const dto = {
        email: 'updated@example.com',
        cpfCnpj: '98765432100',
      };

      (prisma.recipient.findFirst as jest.Mock).mockResolvedValue(mockRecipient);
      (prisma.recipient.update as jest.Mock).mockResolvedValue(mockRecipient);

      const result = await service.update(mockCompanyId, 'recipient-123', dto);

      expect(prisma.recipient.update).toHaveBeenCalledWith({
        where: { id: 'recipient-123' },
        data: expect.objectContaining({
          email: 'updated@example.com',
          cpfCnpjHash: expect.any(String),
          cpfCnpjEnc: expect.any(String),
          cpfCnpjSalt: expect.any(String),
        }),
      });
    });
  });

  describe('softDelete', () => {
    it('should soft delete recipient', async () => {
      (prisma.recipient.findFirst as jest.Mock).mockResolvedValue(mockRecipient);
      (prisma.recipient.update as jest.Mock).mockResolvedValue({
        ...mockRecipient,
        deletedAt: new Date(),
      });

      await service.softDelete(mockCompanyId, 'recipient-123');

      expect(prisma.recipient.findFirst).toHaveBeenCalledWith({
        where: { id: 'recipient-123', companyId: mockCompanyId, deletedAt: null },
      });
      expect(prisma.recipient.update).toHaveBeenCalledWith({
        where: { id: 'recipient-123' },
        data: { deletedAt: expect.any(Date) },
      });
    });

    it('should throw NotFoundException if recipient not found', async () => {
      (prisma.recipient.findFirst as jest.Mock).mockResolvedValue(null);

      await expect(
        service.softDelete(mockCompanyId, 'non-existent'),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
