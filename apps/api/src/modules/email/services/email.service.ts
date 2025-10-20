/**
 * Email Service
 *
 * Business logic for email operations:
 * - List emails with filters and pagination
 * - Get email details by ID
 * - Apply CPF/CNPJ masking
 * - Build database queries with filters
 *
 * @see docs/api/04-email-get-contract.md
 */

import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { prisma } from '@email-gateway/database';
import {
  EmailListQuery,
  EmailListResponse,
  EmailDetailResponse,
  EmailListItem,
  RecipientResponse,
  EmailEventResponse,
  parseSortParam,
  encodeCursor,
  decodeCursor,
  maskCpfCnpj,
  QUERY_LIMITS,
} from '@email-gateway/shared';
import { Prisma, EmailStatus } from '@prisma/client';
import * as crypto from 'crypto';

@Injectable()
export class EmailService {
  /**
   * List emails with filters and pagination
   */
  async listEmails(
    companyId: string,
    query: EmailListQuery,
  ): Promise<EmailListResponse> {
    // Build WHERE clause with filters
    const where = this.buildWhereClause(companyId, query);

    // Parse sorting
    const sort = parseSortParam(query.sort || 'createdAt:desc');
    const orderBy: Prisma.EmailLogOrderByWithRelationInput = {
      [sort.field]: sort.direction,
    };

    // Determine pagination type
    const isPaginationByCursor = 'cursor' in query && query.cursor;

    if (isPaginationByCursor) {
      return this.listEmailsWithCursor(companyId, where, orderBy, query);
    } else {
      return this.listEmailsWithOffset(companyId, where, orderBy, query);
    }
  }

  /**
   * Get email details by ID
   */
  async getEmailById(
    companyId: string,
    emailId: string,
  ): Promise<EmailDetailResponse> {
    // Fetch email log with relations
    const emailLog = await prisma.emailLog.findUnique({
      where: { id: emailId },
      include: {
        recipient: true,
        outbox: true,
        events: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    // Check if email exists
    if (!emailLog) {
      throw new NotFoundException('Email not found');
    }

    // Check if email belongs to company (security)
    if (emailLog.companyId !== companyId) {
      throw new ForbiddenException('You do not have permission to access this resource');
    }

    // Map to response format
    return this.mapEmailLogToDetailResponse(emailLog);
  }

  // ============================================
  // PRIVATE HELPER METHODS
  // ============================================

  /**
   * Build WHERE clause with all filters
   */
  private buildWhereClause(
    companyId: string,
    query: EmailListQuery,
  ): Prisma.EmailLogWhereInput {
    const where: Prisma.EmailLogWhereInput = {
      companyId,
    };

    // Status filter
    if (query.status) {
      const statuses = Array.isArray(query.status) ? query.status : [query.status];
      where.status = { in: statuses as EmailStatus[] };
    }

    // Date range filters
    if (query.dateFrom || query.dateTo) {
      where.createdAt = {};
      if (query.dateFrom) {
        where.createdAt.gte = new Date(query.dateFrom);
      }
      if (query.dateTo) {
        where.createdAt.lte = new Date(query.dateTo);
      }
    }

    // Recipient email filter
    if (query.to) {
      where.to = { equals: query.to, mode: 'insensitive' };
    }

    // External ID filter (send)
    if (query.externalId) {
      where.outbox = {
        externalId: query.externalId,
      };
    }

    // Recipient-specific filters
    if (
      query.recipientExternalId ||
      query.cpfCnpj ||
      query.razaoSocial ||
      query.nome
    ) {
      where.recipient = {};

      if (query.recipientExternalId) {
        where.recipient.externalId = query.recipientExternalId;
      }

      if (query.cpfCnpj) {
        // Hash CPF/CNPJ before querying
        const hash = this.hashCpfCnpj(query.cpfCnpj);
        where.recipient.cpfCnpjHash = hash;
      }

      if (query.razaoSocial) {
        where.recipient.razaoSocial = {
          contains: query.razaoSocial,
          mode: 'insensitive',
        };
      }

      if (query.nome) {
        where.recipient.nome = {
          contains: query.nome,
          mode: 'insensitive',
        };
      }
    }

    // Tags filter
    if (query.tags) {
      const tags = Array.isArray(query.tags) ? query.tags : [query.tags];
      where.outbox = {
        ...where.outbox,
        tags: { hasEvery: tags } as any,
      };
    }

    return where;
  }

  /**
   * List emails with offset pagination
   */
  private async listEmailsWithOffset(
    companyId: string,
    where: Prisma.EmailLogWhereInput,
    orderBy: Prisma.EmailLogOrderByWithRelationInput,
    query: EmailListQuery,
  ): Promise<EmailListResponse> {
    const page = query.page || 1;
    const pageSize = query.pageSize || QUERY_LIMITS.DEFAULT_PAGE_SIZE;
    const skip = (page - 1) * pageSize;

    // Fetch data and total count in parallel
    const [emailLogs, totalItems] = await Promise.all([
      prisma.emailLog.findMany({
        where,
        orderBy,
        skip,
        take: pageSize,
        include: {
          recipient: true,
          outbox: {
            select: {
              tags: true,
              externalId: true,
            },
          },
        },
      }),
      prisma.emailLog.count({ where }),
    ]);

    // Map to list items
    const data = emailLogs.map((log) => this.mapEmailLogToListItem(log));

    // Calculate pagination metadata
    const totalPages = Math.ceil(totalItems / pageSize);

    return {
      data,
      pagination: {
        page,
        pageSize,
        totalItems,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
    };
  }

  /**
   * List emails with cursor pagination
   */
  private async listEmailsWithCursor(
    companyId: string,
    where: Prisma.EmailLogWhereInput,
    orderBy: Prisma.EmailLogOrderByWithRelationInput,
    query: EmailListQuery,
  ): Promise<EmailListResponse> {
    const pageSize = query.pageSize || QUERY_LIMITS.DEFAULT_PAGE_SIZE;

    // Decode cursor if provided
    let cursorData: { id: string; createdAt: string } | null = null;
    if (query.cursor) {
      try {
        cursorData = decodeCursor(query.cursor) as { id: string; createdAt: string };
      } catch {
        throw new BadRequestException('Invalid cursor format');
      }
    }

    // Build cursor-based query
    const emailLogs = await prisma.emailLog.findMany({
      where,
      orderBy,
      take: pageSize + 1, // Fetch one extra to check if there's a next page
      ...(cursorData && {
        cursor: { id: cursorData.id },
        skip: 1, // Skip the cursor item itself
      }),
      include: {
        recipient: true,
        outbox: {
          select: {
            tags: true,
            externalId: true,
          },
        },
      },
    });

    // Check if there are more items
    const hasNext = emailLogs.length > pageSize;
    if (hasNext) {
      emailLogs.pop(); // Remove the extra item
    }

    // Map to list items
    const data = emailLogs.map((log) => this.mapEmailLogToListItem(log));

    // Generate next cursor
    const nextCursor = hasNext && emailLogs.length > 0
      ? encodeCursor({
          id: emailLogs[emailLogs.length - 1].id,
          createdAt: emailLogs[emailLogs.length - 1].createdAt.toISOString(),
        })
      : null;

    // Generate prev cursor (first item)
    const prevCursor = emailLogs.length > 0 && cursorData
      ? encodeCursor({
          id: emailLogs[0].id,
          createdAt: emailLogs[0].createdAt.toISOString(),
        })
      : null;

    return {
      data,
      pagination: {
        cursor: {
          next: nextCursor,
          prev: prevCursor,
        },
        page: 1,
        pageSize: 50,
        totalItems: 0,
        totalPages: 0,
        hasNext: !!nextCursor,
        hasPrev: !!prevCursor,
      },
    };
  }

  /**
   * Map EmailLog to EmailListItem (summary for list view)
   */
  private mapEmailLogToListItem(log: any): EmailListItem {
    return {
      id: log.id,
      status: log.status,
      to: log.to,
      subject: log.subject,
      recipientName: log.recipient?.nome || log.recipient?.razaoSocial || null,
      recipientExternalId: log.recipient?.externalId || null,
      externalId: log.outbox?.externalId || null,
      attempts: log.attempts,
      tags: log.outbox?.tags || [],
      createdAt: log.createdAt.toISOString(),
      sentAt: log.sentAt ? log.sentAt.toISOString() : null,
    };
  }

  /**
   * Map EmailLog to EmailDetailResponse (full view with events)
   */
  private mapEmailLogToDetailResponse(log: any): EmailDetailResponse {
    return {
      id: log.id,
      companyId: log.companyId,
      status: log.status,
      to: log.to,
      cc: log.outbox?.cc || [],
      bcc: log.outbox?.bcc || [],
      subject: log.subject,
      recipient: log.recipient ? this.mapRecipientToResponse(log.recipient) : null,
      externalId: log.outbox?.externalId || null,
      sesMessageId: log.sesMessageId,
      attempts: log.attempts,
      requestId: log.requestId,
      tags: log.outbox?.tags || [],
      errorCode: log.errorCode,
      errorReason: log.errorReason,
      durationMs: log.durationMs,
      createdAt: log.createdAt.toISOString(),
      enqueuedAt: log.outbox?.enqueuedAt ? log.outbox.enqueuedAt.toISOString() : null,
      sentAt: log.sentAt ? log.sentAt.toISOString() : null,
      failedAt: log.failedAt ? log.failedAt.toISOString() : null,
      events: log.events.map((event: any) => this.mapEventToResponse(event)),
    };
  }

  /**
   * Map Recipient to RecipientResponse (with masked CPF/CNPJ)
   */
  private mapRecipientToResponse(recipient: any): RecipientResponse {
    return {
      id: recipient.id,
      externalId: recipient.externalId,
      nome: recipient.nome,
      razaoSocial: recipient.razaoSocial,
      email: recipient.email,
      cpfCnpj: maskCpfCnpj(recipient.cpfCnpjEnc), // Apply masking
    };
  }

  /**
   * Map EmailEvent to EmailEventResponse
   */
  private mapEventToResponse(event: any): EmailEventResponse {
    return {
      id: event.id,
      type: event.type,
      timestamp: event.createdAt.toISOString(),
      metadata: event.metadata || null,
    };
  }

  /**
   * Hash CPF/CNPJ for database query
   * Uses SHA-256 for consistent hashing
   */
  private hashCpfCnpj(cpfCnpj: string): string {
    const normalized = cpfCnpj.replace(/\D/g, '');
    return crypto.createHash('sha256').update(normalized).digest('hex');
  }
}
