/**
 * Recipient Controller Unit Tests
 *
 * Tests all HTTP endpoints for RecipientController
 */

import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { RecipientController } from '../recipient.controller';
import { RecipientService } from '../recipient.service';
import { ApiKeyGuard } from '../../auth/auth.guard';
import { AuditInterceptor } from '../../auth/audit.interceptor';

describe('RecipientController', () => {
  let controller: RecipientController;
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

  const mockRequest = {
    companyId: mockCompanyId,
  } as any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [RecipientController],
      providers: [
        {
          provide: RecipientService,
          useValue: {
            create: jest.fn(),
            findAll: jest.fn(),
            findOne: jest.fn(),
            findByHash: jest.fn(),
            update: jest.fn(),
            softDelete: jest.fn(),
          },
        },
      ],
    })
      .overrideGuard(ApiKeyGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(ThrottlerGuard)
      .useValue({ canActivate: () => true })
      .overrideInterceptor(AuditInterceptor)
      .useValue({ intercept: (context: any, next: any) => next.handle() })
      .compile();

    controller = module.get<RecipientController>(RecipientController);
    service = module.get<RecipientService>(RecipientService);
  });

  describe('findAll', () => {
    it('should return paginated recipients without sensitive fields', async () => {
      const query = { skip: 0, limit: 20 };
      const mockResult = {
        data: [mockRecipient],
        total: 1,
      };

      jest.spyOn(service, 'findAll').mockResolvedValue(mockResult);

      const result = await controller.findAll(query, mockRequest);

      expect(service.findAll).toHaveBeenCalledWith(mockCompanyId, query);
      expect(result.data[0]).not.toHaveProperty('cpfCnpjEnc');
      expect(result.data[0]).not.toHaveProperty('cpfCnpjSalt');
      expect(result.data[0]).toHaveProperty('email', 'test@example.com');
      expect(result.total).toBe(1);
    });

    it('should handle empty results', async () => {
      const query: any = { skip: 0, limit: 20 };
      const mockResult = {
        data: [],
        total: 0,
      };

      jest.spyOn(service, 'findAll').mockResolvedValue(mockResult);

      const result = await controller.findAll(query, mockRequest);

      expect(result.data).toEqual([]);
      expect(result.total).toBe(0);
    });
  });

  describe('findOne', () => {
    it('should return recipient by id without sensitive fields', async () => {
      jest.spyOn(service, 'findOne').mockResolvedValue(mockRecipient);

      const result = await controller.findOne('recipient-123', mockRequest);

      expect(service.findOne).toHaveBeenCalledWith(mockCompanyId, 'recipient-123');
      expect(result).not.toHaveProperty('cpfCnpjEnc');
      expect(result).not.toHaveProperty('cpfCnpjSalt');
      expect(result).toHaveProperty('email', 'test@example.com');
    });

    it('should throw NotFoundException if recipient not found', async () => {
      jest.spyOn(service, 'findOne').mockResolvedValue(null);

      await expect(
        controller.findOne('non-existent', mockRequest),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('search', () => {
    it('should return recipient by hash without sensitive fields', async () => {
      jest.spyOn(service, 'findByHash').mockResolvedValue(mockRecipient);

      const result = await controller.search('hash-123', mockRequest);

      expect(service.findByHash).toHaveBeenCalledWith(mockCompanyId, 'hash-123');
      expect(result).not.toHaveProperty('cpfCnpjEnc');
      expect(result).not.toHaveProperty('cpfCnpjSalt');
      expect(result).toHaveProperty('email', 'test@example.com');
    });

    it('should throw NotFoundException if recipient not found', async () => {
      jest.spyOn(service, 'findByHash').mockResolvedValue(null);

      await expect(controller.search('non-existent', mockRequest)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw BadRequestException if hash parameter is missing', async () => {
      await expect(controller.search('', mockRequest)).rejects.toThrow(
        BadRequestException,
      );
      await expect(controller.search('', mockRequest)).rejects.toThrow(
        'Hash query parameter is required',
      );
    });
  });

  describe('create', () => {
    it('should create recipient without sensitive fields in response', async () => {
      const dto = {
        email: 'test@example.com',
        externalId: 'ext-123',
      };

      jest.spyOn(service, 'create').mockResolvedValue(mockRecipient);

      const result = await controller.create(dto, mockRequest);

      expect(service.create).toHaveBeenCalledWith(mockCompanyId, dto);
      expect(result).not.toHaveProperty('cpfCnpjEnc');
      expect(result).not.toHaveProperty('cpfCnpjSalt');
      expect(result).toHaveProperty('email', 'test@example.com');
    });

    it('should create recipient with CPF/CNPJ', async () => {
      const dto = {
        email: 'test@example.com',
        cpfCnpj: '12345678901',
      };

      jest.spyOn(service, 'create').mockResolvedValue(mockRecipient);

      const result = await controller.create(dto, mockRequest);

      expect(service.create).toHaveBeenCalledWith(mockCompanyId, dto);
      expect(result).not.toHaveProperty('cpfCnpjEnc');
      expect(result).not.toHaveProperty('cpfCnpjSalt');
      expect(result).toHaveProperty('cpfCnpjHash');
    });
  });

  describe('update', () => {
    it('should update recipient without sensitive fields in response', async () => {
      const dto = {
        email: 'updated@example.com',
      };

      const updatedRecipient = { ...mockRecipient, email: 'updated@example.com' };

      jest.spyOn(service, 'update').mockResolvedValue(updatedRecipient);

      const result = await controller.update('recipient-123', dto, mockRequest);

      expect(service.update).toHaveBeenCalledWith(mockCompanyId, 'recipient-123', dto);
      expect(result).not.toHaveProperty('cpfCnpjEnc');
      expect(result).not.toHaveProperty('cpfCnpjSalt');
      expect(result).toHaveProperty('email', 'updated@example.com');
    });

    it('should throw NotFoundException if recipient not found', async () => {
      const dto = {
        email: 'updated@example.com',
      };

      jest.spyOn(service, 'update').mockRejectedValue(new NotFoundException());

      await expect(
        controller.update('non-existent', dto, mockRequest),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('delete', () => {
    it('should soft delete recipient', async () => {
      jest.spyOn(service, 'softDelete').mockResolvedValue(undefined);

      await controller.delete('recipient-123', mockRequest);

      expect(service.softDelete).toHaveBeenCalledWith(mockCompanyId, 'recipient-123');
    });

    it('should throw NotFoundException if recipient not found', async () => {
      jest.spyOn(service, 'softDelete').mockRejectedValue(new NotFoundException());

      await expect(controller.delete('non-existent', mockRequest)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('sensitive field removal', () => {
    it('should remove cpfCnpjEnc and cpfCnpjSalt from all responses', async () => {
      // Test findAll
      jest.spyOn(service, 'findAll').mockResolvedValue({
        data: [mockRecipient],
        total: 1,
      });

      const findAllResult = await controller.findAll({ skip: 0, limit: 20 } as any, mockRequest);
      expect(findAllResult.data[0]).not.toHaveProperty('cpfCnpjEnc');
      expect(findAllResult.data[0]).not.toHaveProperty('cpfCnpjSalt');

      // Test findOne
      jest.spyOn(service, 'findOne').mockResolvedValue(mockRecipient);

      const findOneResult = await controller.findOne('recipient-123', mockRequest);
      expect(findOneResult).not.toHaveProperty('cpfCnpjEnc');
      expect(findOneResult).not.toHaveProperty('cpfCnpjSalt');

      // Test search
      jest.spyOn(service, 'findByHash').mockResolvedValue(mockRecipient);

      const searchResult = await controller.search('hash-123', mockRequest);
      expect(searchResult).not.toHaveProperty('cpfCnpjEnc');
      expect(searchResult).not.toHaveProperty('cpfCnpjSalt');

      // Test create
      jest.spyOn(service, 'create').mockResolvedValue(mockRecipient);

      const createResult = await controller.create(
        { email: 'test@example.com' },
        mockRequest,
      );
      expect(createResult).not.toHaveProperty('cpfCnpjEnc');
      expect(createResult).not.toHaveProperty('cpfCnpjSalt');

      // Test update
      jest.spyOn(service, 'update').mockResolvedValue(mockRecipient);

      const updateResult = await controller.update(
        'recipient-123',
        { email: 'updated@example.com' },
        mockRequest,
      );
      expect(updateResult).not.toHaveProperty('cpfCnpjEnc');
      expect(updateResult).not.toHaveProperty('cpfCnpjSalt');
    });
  });
});
