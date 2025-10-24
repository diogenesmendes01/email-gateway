/**
 * Recipient Controller
 *
 * Handles HTTP endpoints for recipient operations:
 * - GET /v1/recipients - List recipients with pagination
 * - GET /v1/recipients/:id - Get recipient by ID
 * - POST /v1/recipients - Create recipient
 * - PUT /v1/recipients/:id - Update recipient
 * - DELETE /v1/recipients/:id - Soft delete recipient
 * - GET /v1/recipients/search - Search by CPF/CNPJ hash
 *
 * Rate limits: 100 requests per minute per API key
 *
 * @see task/TASK-004-RECIPIENT-API.md
 */

import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  Req,
  HttpCode,
  HttpStatus,
  NotFoundException,
  BadRequestException,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { Recipient } from '@prisma/client';
import { RecipientService } from './recipient.service';
import { CreateRecipientDto } from './dto/create-recipient.dto';
import { UpdateRecipientDto } from './dto/update-recipient.dto';
import { RecipientQueryDto } from './dto/recipient-query.dto';
import { ApiKeyGuard } from '../auth/auth.guard';
import { AuditInterceptor } from '../auth/audit.interceptor';

/**
 * Type for sanitized recipient (without sensitive fields)
 */
type SanitizedRecipient = Omit<Recipient, 'cpfCnpjEnc' | 'cpfCnpjSalt'>;

/**
 * Interface for request with authenticated company
 */
interface AuthenticatedRequest extends Request {
  companyId: string;
  user?: any;
}

@Controller('v1/recipients')
@UseGuards(ApiKeyGuard, ThrottlerGuard)
@UseInterceptors(AuditInterceptor)
@Throttle({ default: { limit: 100, ttl: 60000 } }) // 100 requests per minute
export class RecipientController {
  constructor(private readonly recipientService: RecipientService) {}

  /**
   * Remove sensitive fields from recipient object
   * Prevents exposure of encrypted CPF/CNPJ data
   */
  private sanitizeRecipient(recipient: Recipient): SanitizedRecipient {
    const { cpfCnpjEnc, cpfCnpjSalt, ...rest } = recipient;
    return rest;
  }

  /**
   * GET /v1/recipients
   *
   * List recipients with pagination and filters
   */
  @Get()
  @HttpCode(HttpStatus.OK)
  async findAll(
    @Query() query: RecipientQueryDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<{ data: SanitizedRecipient[]; total: number }> {
    const companyId = req.companyId;
    const result = await this.recipientService.findAll(companyId, query);

    // Remove sensitive fields from all recipients
    const sanitizedData = result.data.map((recipient) =>
      this.sanitizeRecipient(recipient),
    );

    return { data: sanitizedData, total: result.total };
  }

  /**
   * GET /v1/recipients/search
   *
   * Search recipient by CPF/CNPJ hash
   * Must be placed BEFORE /:id route to avoid conflict
   */
  @Get('search')
  @HttpCode(HttpStatus.OK)
  async search(
    @Query('hash') hash: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<SanitizedRecipient> {
    if (!hash) {
      throw new BadRequestException('Hash query parameter is required');
    }

    const companyId = req.companyId;
    const recipient = await this.recipientService.findByHash(companyId, hash);

    if (!recipient) {
      throw new NotFoundException('Recipient not found');
    }

    return this.sanitizeRecipient(recipient);
  }

  /**
   * GET /v1/recipients/:id
   *
   * Get recipient by ID
   */
  @Get(':id')
  @HttpCode(HttpStatus.OK)
  async findOne(
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<SanitizedRecipient> {
    const companyId = req.companyId;
    const recipient = await this.recipientService.findOne(companyId, id);

    if (!recipient) {
      throw new NotFoundException('Recipient not found');
    }

    return this.sanitizeRecipient(recipient);
  }

  /**
   * POST /v1/recipients
   *
   * Create a new recipient
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body() dto: CreateRecipientDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<SanitizedRecipient> {
    const companyId = req.companyId;
    const recipient = await this.recipientService.create(companyId, dto);

    return this.sanitizeRecipient(recipient);
  }

  /**
   * PUT /v1/recipients/:id
   *
   * Update recipient
   */
  @Put(':id')
  @HttpCode(HttpStatus.OK)
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateRecipientDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<SanitizedRecipient> {
    const companyId = req.companyId;
    const recipient = await this.recipientService.update(companyId, id, dto);

    return this.sanitizeRecipient(recipient);
  }

  /**
   * DELETE /v1/recipients/:id
   *
   * Soft delete recipient
   */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<void> {
    const companyId = req.companyId;
    await this.recipientService.softDelete(companyId, id);
  }
}
