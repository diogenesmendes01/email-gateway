/**
 * Recipient Service
 *
 * Business logic for recipient operations:
 * - Create recipients with encrypted CPF/CNPJ
 * - List recipients with pagination
 * - Update recipient information
 * - Soft delete recipients
 * - Search by CPF/CNPJ hash
 *
 * @see task/TASK-004-RECIPIENT-API.md
 */

import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { prisma } from '@email-gateway/database';
import {
  hashCpfCnpjHmac,
  encryptCpfCnpj,
  decryptCpfCnpj,
} from '@email-gateway/shared';
import { CreateRecipientDto } from './dto/create-recipient.dto';
import { UpdateRecipientDto } from './dto/update-recipient.dto';
import { RecipientQueryDto } from './dto/recipient-query.dto';

@Injectable()
export class RecipientService {
  /**
   * Create a new recipient
   */
  async create(
    companyId: string,
    dto: CreateRecipientDto,
  ): Promise<any> {
    const data: any = {
      email: dto.email,
      externalId: dto.externalId,
      companyId,
    };

    // Encrypt CPF/CNPJ if provided
    if (dto.cpfCnpj) {
      const encryptionKey = process.env.ENCRYPTION_KEY;
      if (!encryptionKey) {
        throw new Error('ENCRYPTION_KEY environment variable is not set');
      }
      if (Buffer.from(encryptionKey).length !== 32) {
        throw new Error('ENCRYPTION_KEY must be exactly 32 bytes for AES-256');
      }

      const hashSecret = process.env.HASH_SECRET || encryptionKey;
      const hash = hashCpfCnpjHmac(dto.cpfCnpj, hashSecret);
      const { encrypted, salt } = encryptCpfCnpj(dto.cpfCnpj, encryptionKey);

      data.cpfCnpjHash = hash;
      data.cpfCnpjEnc = encrypted;
      data.cpfCnpjSalt = salt;
    }

    try {
      return await prisma.recipient.create({ data });
    } catch (error: any) {
      if (error.code === 'P2002') {
        const field = error.meta?.target?.[0] || 'field';
        throw new ConflictException(
          `Recipient with this ${field} already exists for this company`,
        );
      }
      throw error;
    }
  }

  /**
   * Find all recipients with pagination and filters
   */
  async findAll(
    companyId: string,
    query: RecipientQueryDto,
  ): Promise<{ data: any[]; total: number }> {
    const where: any = {
      companyId,
      deletedAt: null,
    };

    // Email filter (contains search)
    if (query.email) {
      where.email = { contains: query.email, mode: 'insensitive' };
    }

    const skip = query.skip || 0;
    const limit = query.limit || 20;

    // Fetch data and total count in parallel
    const [data, total] = await Promise.all([
      prisma.recipient.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.recipient.count({ where }),
    ]);

    return { data, total };
  }

  /**
   * Find one recipient by ID
   */
  async findOne(companyId: string, id: string): Promise<any | null> {
    return prisma.recipient.findFirst({
      where: { id, companyId, deletedAt: null },
    });
  }

  /**
   * Find recipient by CPF/CNPJ hash
   */
  async findByHash(
    companyId: string,
    cpfCnpjHash: string,
  ): Promise<any | null> {
    return prisma.recipient.findFirst({
      where: { companyId, cpfCnpjHash, deletedAt: null },
    });
  }

  /**
   * Update recipient
   */
  async update(
    companyId: string,
    id: string,
    dto: UpdateRecipientDto,
  ): Promise<any> {
    // Check if recipient exists and belongs to company
    const recipient = await this.findOne(companyId, id);
    if (!recipient) {
      throw new NotFoundException('Recipient not found');
    }

    const data: any = { ...dto };

    // If updating CPF/CNPJ, re-encrypt
    if (dto.cpfCnpj) {
      const encryptionKey = process.env.ENCRYPTION_KEY;
      if (!encryptionKey) {
        throw new Error('ENCRYPTION_KEY environment variable is not set');
      }
      if (Buffer.from(encryptionKey).length !== 32) {
        throw new Error('ENCRYPTION_KEY must be exactly 32 bytes for AES-256');
      }

      const hashSecret = process.env.HASH_SECRET || encryptionKey;
      const hash = hashCpfCnpjHmac(dto.cpfCnpj, hashSecret);
      const { encrypted, salt } = encryptCpfCnpj(dto.cpfCnpj, encryptionKey);

      data.cpfCnpjHash = hash;
      data.cpfCnpjEnc = encrypted;
      data.cpfCnpjSalt = salt;
      delete data.cpfCnpj; // Remove plain text from update
    }

    return prisma.recipient.update({
      where: { id },
      data,
    });
  }

  /**
   * Soft delete recipient
   */
  async softDelete(companyId: string, id: string): Promise<void> {
    // Check if recipient exists and belongs to company
    const recipient = await this.findOne(companyId, id);
    if (!recipient) {
      throw new NotFoundException('Recipient not found');
    }

    await prisma.recipient.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }
}
