/**
 * @email-gateway/api - Domain Management Controller
 *
 * Controller para gerenciamento de domínios, DNS e configurações SES
 *
 * TASK 6.2 — SES, domínio e DNS (SPF/DKIM)
 * Endpoints para verificação de domínio, criação de registros DNS,
 * validação de região/quota e warm-up de volumetria
 */

import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  Query,
  HttpStatus,
  HttpCode,
  UseGuards,
  Request,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiQuery } from '@nestjs/swagger';

// Guards
import { ApiKeyGuard } from '../auth/auth.guard';
import { BasicAuthGuard } from '../auth/basic-auth.guard';
import { RateLimitGuard } from '../auth/rate-limit.guard';

// Services
import { DomainService } from './domain.service';

// DTOs
import {
  DomainVerificationRequest,
  DomainVerificationResponse,
  DNSRecordsResponse,
  SESQuotaStatusResponse,
  WarmupConfigRequest,
  SandboxChecklistResponse,
  RegionValidationResponse,
} from './dto/domain.dto';

@ApiTags('Domain Management')
@Controller('v1/domains')
@UseGuards(ApiKeyGuard, RateLimitGuard)
export class DomainController {
  constructor(private readonly domainService: DomainService) {}

  /**
   * GET /v1/domains
   * Lista domínios configurados
   */
  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Lista domínios configurados' })
  @ApiResponse({
    status: 200,
    description: 'Lista de domínios retornada com sucesso',
  })
  async listDomains(@Request() req: any) {
    const companyId = req.companyId;
    return this.domainService.listDomains(companyId);
  }

  /**
   * POST /v1/domains
   * Adiciona novo domínio para verificação
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Adiciona novo domínio para verificação' })
  @ApiResponse({
    status: 201,
    description: 'Domínio adicionado com sucesso',
  })
  async addDomain(
    @Body() body: DomainVerificationRequest,
    @Request() req: any,
  ): Promise<DomainVerificationResponse> {
    const companyId = req.companyId;
    return this.domainService.addDomain(companyId, body);
  }

  /**
   * GET /v1/domains/:domain/status
   * Verifica status de verificação de um domínio
   */
  @Get(':domain/status')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verifica status de verificação de um domínio' })
  @ApiParam({ name: 'domain', description: 'Nome do domínio' })
  @ApiResponse({
    status: 200,
    description: 'Status de verificação retornado com sucesso',
  })
  async getDomainStatus(
    @Param('domain') domain: string,
    @Request() req: any,
  ): Promise<DomainVerificationResponse> {
    const companyId = req.companyId;
    return this.domainService.getDomainStatus(companyId, domain);
  }

  /**
   * POST /v1/domains/:domain/verify
   * Inicia verificação de um domínio
   */
  @Post(':domain/verify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Inicia verificação de um domínio' })
  @ApiParam({ name: 'domain', description: 'Nome do domínio' })
  @ApiResponse({
    status: 200,
    description: 'Verificação iniciada com sucesso',
  })
  async verifyDomain(
    @Param('domain') domain: string,
    @Request() req: any,
  ): Promise<DomainVerificationResponse> {
    const companyId = req.companyId;
    return this.domainService.verifyDomain(companyId, domain);
  }

  /**
   * GET /v1/domains/:domain/dns-records
   * Obtém registros DNS necessários para um domínio
   */
  @Get(':domain/dns-records')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Obtém registros DNS necessários para um domínio' })
  @ApiParam({ name: 'domain', description: 'Nome do domínio' })
  @ApiResponse({
    status: 200,
    description: 'Registros DNS retornados com sucesso',
  })
  async getDNSRecords(
    @Param('domain') domain: string,
    @Request() req: any,
  ): Promise<DNSRecordsResponse> {
    const companyId = req.companyId;
    return this.domainService.getDNSRecords(companyId, domain);
  }

  /**
   * POST /v1/domains/:domain/dkim
   * Habilita DKIM para um domínio
   */
  @Post(':domain/dkim')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Habilita DKIM para um domínio' })
  @ApiParam({ name: 'domain', description: 'Nome do domínio' })
  @ApiResponse({
    status: 200,
    description: 'DKIM habilitado com sucesso',
  })
  async enableDKIM(
    @Param('domain') domain: string,
    @Request() req: any,
  ): Promise<DNSRecordsResponse> {
    const companyId = req.companyId;
    return this.domainService.enableDKIM(companyId, domain);
  }

  /**
   * POST /v1/domains/:domain/validate-dns
   * Valida registros DNS de um domínio
   */
  @Post(':domain/validate-dns')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Valida registros DNS de um domínio' })
  @ApiParam({ name: 'domain', description: 'Nome do domínio' })
  @ApiResponse({
    status: 200,
    description: 'Validação DNS retornada com sucesso',
  })
  async validateDNS(
    @Param('domain') domain: string,
    @Request() req: any,
  ): Promise<DNSRecordsResponse> {
    const companyId = req.companyId;
    return this.domainService.validateDNS(companyId, domain);
  }

  /**
   * GET /v1/domains/ses-quota
   * Obtém status da quota SES
   */
  @Get('ses-quota')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Obtém status da quota SES' })
  @ApiResponse({
    status: 200,
    description: 'Status da quota SES retornado com sucesso',
  })
  async getSESQuotaStatus(@Request() req: any): Promise<SESQuotaStatusResponse> {
    const companyId = req.companyId;
    return this.domainService.getSESQuotaStatus(companyId);
  }

  /**
   * POST /v1/domains/:domain/warmup
   * Configura warm-up para um domínio
   */
  @Post(':domain/warmup')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Configura warm-up para um domínio' })
  @ApiParam({ name: 'domain', description: 'Nome do domínio' })
  @ApiResponse({
    status: 200,
    description: 'Warm-up configurado com sucesso',
  })
  async configureWarmup(
    @Param('domain') domain: string,
    @Body() body: WarmupConfigRequest,
    @Request() req: any,
  ) {
    const companyId = req.companyId;
    return this.domainService.configureWarmup(companyId, domain, body);
  }

  /**
   * GET /v1/domains/sandbox-checklist
   * Obtém checklist de sandbox para produção
   */
  @Get('sandbox-checklist')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Obtém checklist de sandbox para produção' })
  @ApiResponse({
    status: 200,
    description: 'Checklist retornado com sucesso',
  })
  async getSandboxChecklist(@Request() req: any): Promise<SandboxChecklistResponse> {
    const companyId = req.companyId;
    return this.domainService.getSandboxChecklist(companyId);
  }

  /**
   * GET /v1/domains/validate-region
   * Valida região SES
   */
  @Get('validate-region')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Valida região SES' })
  @ApiQuery({ name: 'region', description: 'Região AWS', required: false })
  @ApiResponse({
    status: 200,
    description: 'Validação de região retornada com sucesso',
  })
  async validateRegion(
    @Query('region') region?: string,
    @Request() req?: any,
  ): Promise<RegionValidationResponse> {
    const companyId = req?.companyId;
    return this.domainService.validateRegion(companyId, region);
  }

  /**
   * DELETE /v1/domains/:domain
   * Remove um domínio
   */
  @Delete(':domain')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove um domínio' })
  @ApiParam({ name: 'domain', description: 'Nome do domínio' })
  @ApiResponse({
    status: 204,
    description: 'Domínio removido com sucesso',
  })
  async removeDomain(
    @Param('domain') domain: string,
    @Request() req: any,
  ) {
    const companyId = req.companyId;
    return this.domainService.removeDomain(companyId, domain);
  }
}
