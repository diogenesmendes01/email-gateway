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

import { Injectable, NotFoundException, ConflictException, OnModuleInit, Logger } from '@nestjs/common';
import { Recipient } from '@prisma/client';
import { prisma } from '@email-gateway/database';
import {
  hashCpfCnpjHmac,
  encryptCpfCnpj,
  decryptCpfCnpj,
} from '@email-gateway/shared';
import { CreateRecipientDto } from './dto/create-recipient.dto';
import { UpdateRecipientDto } from './dto/update-recipient.dto';
import { RecipientQueryDto } from './dto/recipient-query.dto';

// Constants for pagination
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

/**
 * Interface for paginated recipient list response
 */
interface PaginatedRecipients {
  data: Recipient[];
  total: number;
}

/**
 * Interface for encrypted CPF/CNPJ data
 */
interface EncryptedCpfCnpj {
  hash: string;
  encrypted: string;
  salt: string;
}

@Injectable()
export class RecipientService implements OnModuleInit {
  private readonly logger = new Logger(RecipientService.name);
  private encryptionKey!: string;
  private hashSecret!: string;
  private readonly ENCRYPTION_SLOW_THRESHOLD_MS = parseInt(
    process.env.ENCRYPTION_SLOW_THRESHOLD_MS || '200',
    10
  );

  /**
   * Initialize and validate encryption keys on module startup
   * This ensures early failure if configuration is invalid
   */
  async onModuleInit() {
    const encKey = process.env.ENCRYPTION_KEY;
    if (!encKey) {
      throw new Error('ENCRYPTION_KEY environment variable is not set');
    }
    if (Buffer.from(encKey).length !== 32) {
      throw new Error('ENCRYPTION_KEY must be exactly 32 bytes for AES-256');
    }
    this.encryptionKey = encKey;

    const hashSec = process.env.HASH_SECRET;
    if (!hashSec) {
      throw new Error('HASH_SECRET environment variable is required for security');
    }
    this.hashSecret = hashSec;
  }

  /**
   * Encrypt CPF/CNPJ and generate hash for searching
   * Extracted to avoid code duplication
   * TASK-012: Includes performance monitoring
   */
  private encryptCpfCnpjData(cpfCnpj: string, requestContext?: { companyId: string; requestId?: string }): EncryptedCpfCnpj {
    const startTime = performance.now();

    try {
      const hash = hashCpfCnpjHmac(cpfCnpj, this.hashSecret);
      const { encrypted, salt } = encryptCpfCnpj(cpfCnpj, this.encryptionKey);

      const durationMs = performance.now() - startTime;

      // Log slow encryption
      if (durationMs > this.ENCRYPTION_SLOW_THRESHOLD_MS) {
        this.logger.warn({
          message: 'Slow CPF/CNPJ encryption detected',
          durationMs: Math.round(durationMs),
          threshold: this.ENCRYPTION_SLOW_THRESHOLD_MS,
          companyId: requestContext?.companyId,
          requestId: requestContext?.requestId,
        });
      }

      // Log metrics (debug level)
      this.logger.debug({
        message: 'CPF/CNPJ encrypted',
        durationMs: Math.round(durationMs),
        companyId: requestContext?.companyId,
      });

      return { hash, encrypted, salt };
    } catch (error) {
      const durationMs = performance.now() - startTime;

      this.logger.error({
        message: 'CPF/CNPJ encryption failed',
        error: error instanceof Error ? error.message : 'Unknown error',
        durationMs: Math.round(durationMs),
        companyId: requestContext?.companyId,
        requestId: requestContext?.requestId,
      });

      throw error;
    }
  }
  /**
   * Create a new recipient
   */
  async create(
    companyId: string,
    dto: CreateRecipientDto,
  ): Promise<Recipient> {
    const data: any = {
      email: dto.email,
      externalId: dto.externalId,
      companyId,
    };

    // Encrypt CPF/CNPJ if provided
    if (dto.cpfCnpj) {
      const { hash, encrypted, salt } = this.encryptCpfCnpjData(dto.cpfCnpj, { companyId });
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
  ): Promise<PaginatedRecipients> {
    const where: any = {
      companyId,
      deletedAt: null,
    };

    // Email filter (contains search)
    if (query.email) {
      // Sanitize email input to prevent injection
      const sanitizedEmail = query.email.replace(/[<>]/g, '');
      where.email = { contains: sanitizedEmail, mode: 'insensitive' };
    }

    const skip = query.skip || 0;
    const limit = Math.min(query.limit || DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);

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
  async findOne(companyId: string, id: string): Promise<Recipient | null> {
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
  ): Promise<Recipient | null> {
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
  ): Promise<Recipient> {
    // Check if recipient exists and belongs to company
    const recipient = await this.findOne(companyId, id);
    if (!recipient) {
      throw new NotFoundException('Recipient not found');
    }

    const data: Partial<Recipient> = { ...dto };

    // If updating CPF/CNPJ, re-encrypt
    if (dto.cpfCnpj) {
      const { hash, encrypted, salt } = this.encryptCpfCnpjData(dto.cpfCnpj, { companyId });
      data.cpfCnpjHash = hash;
      data.cpfCnpjEnc = encrypted;
      data.cpfCnpjSalt = salt;
      delete (data as any).cpfCnpj; // Remove plain text from update
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
