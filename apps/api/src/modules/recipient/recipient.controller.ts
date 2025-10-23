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
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { RecipientService } from './recipient.service';
import { CreateRecipientDto } from './dto/create-recipient.dto';
import { UpdateRecipientDto } from './dto/update-recipient.dto';
import { RecipientQueryDto } from './dto/recipient-query.dto';
import { ApiKeyGuard } from '../auth/auth.guard';
import { AuditInterceptor } from '../auth/audit.interceptor';

@Controller('v1/recipients')
@UseGuards(ApiKeyGuard)
@UseInterceptors(AuditInterceptor)
export class RecipientController {
  constructor(private readonly recipientService: RecipientService) {}

  /**
   * GET /v1/recipients
   *
   * List recipients with pagination and filters
   */
  @Get()
  @HttpCode(HttpStatus.OK)
  async findAll(@Query() query: RecipientQueryDto, @Req() req: any) {
    const companyId = req.companyId;
    const result = await this.recipientService.findAll(companyId, query);

    // Remove sensitive fields from all recipients
    result.data = result.data.map((recipient) => {
      const { cpfCnpjEnc, cpfCnpjSalt, ...rest } = recipient;
      return rest;
    });

    return result;
  }

  /**
   * GET /v1/recipients/search
   *
   * Search recipient by CPF/CNPJ hash
   * Must be placed BEFORE /:id route to avoid conflict
   */
  @Get('search')
  @HttpCode(HttpStatus.OK)
  async search(@Query('hash') hash: string, @Req() req: any) {
    if (!hash) {
      throw new NotFoundException('Hash query parameter is required');
    }

    const companyId = req.companyId;
    const recipient = await this.recipientService.findByHash(companyId, hash);

    if (!recipient) {
      throw new NotFoundException('Recipient not found');
    }

    // Remove sensitive fields
    const { cpfCnpjEnc, cpfCnpjSalt, ...rest } = recipient;
    return rest;
  }

  /**
   * GET /v1/recipients/:id
   *
   * Get recipient by ID
   */
  @Get(':id')
  @HttpCode(HttpStatus.OK)
  async findOne(@Param('id') id: string, @Req() req: any) {
    const companyId = req.companyId;
    const recipient = await this.recipientService.findOne(companyId, id);

    if (!recipient) {
      throw new NotFoundException('Recipient not found');
    }

    // Remove sensitive fields
    const { cpfCnpjEnc, cpfCnpjSalt, ...rest } = recipient;
    return rest;
  }

  /**
   * POST /v1/recipients
   *
   * Create a new recipient
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateRecipientDto, @Req() req: any) {
    const companyId = req.companyId;
    const recipient = await this.recipientService.create(companyId, dto);

    // Remove sensitive fields
    const { cpfCnpjEnc, cpfCnpjSalt, ...rest } = recipient;
    return rest;
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
    @Req() req: any,
  ) {
    const companyId = req.companyId;
    const recipient = await this.recipientService.update(companyId, id, dto);

    // Remove sensitive fields
    const { cpfCnpjEnc, cpfCnpjSalt, ...rest } = recipient;
    return rest;
  }

  /**
   * DELETE /v1/recipients/:id
   *
   * Soft delete recipient
   */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@Param('id') id: string, @Req() req: any) {
    const companyId = req.companyId;
    await this.recipientService.softDelete(companyId, id);
  }
}
