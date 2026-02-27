/**
 * @email-gateway/api - Domain Management Controller
 *
 * Controller para gerenciamento de domínios e DNS (SPF/DKIM)
 * Verificação de domínio via registros DNS, sem dependência de AWS SES.
 */

import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  HttpStatus,
  HttpCode,
  Request,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';

// Guards
import { Company, SandboxAllowed } from '../auth/decorators';

// Services
import { DomainService } from './domain.service';

// DTOs
import {
  DomainVerificationRequest,
  DomainVerificationResponse,
  DNSRecordsResponse,
  WarmupConfigRequest,
} from './dto/domain.dto';

@ApiTags('Domain Management')
@Controller('v1/domains')
export class DomainController {
  constructor(private readonly domainService: DomainService) {}

  /**
   * GET /v1/domains
   * Lista domínios configurados
   */
  @Get()
  @SandboxAllowed()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Lista domínios configurados' })
  @ApiResponse({ status: 200, description: 'Lista de domínios retornada com sucesso' })
  async listDomains(@Company() companyId: string) {
    return this.domainService.listDomains(companyId);
  }

  /**
   * POST /v1/domains
   * Adiciona novo domínio para verificação
   */
  @Post()
  @SandboxAllowed()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Adiciona novo domínio para verificação' })
  @ApiResponse({ status: 201, description: 'Domínio adicionado com sucesso' })
  async addDomain(
    @Body() body: DomainVerificationRequest,
    @Company() companyId: string,
  ): Promise<DomainVerificationResponse> {
    return this.domainService.addDomain(companyId, body);
  }

  /**
   * GET /v1/domains/:domain/status
   * Verifica status de verificação de um domínio
   */
  @Get(':domain/status')
  @SandboxAllowed()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verifica status de verificação de um domínio' })
  @ApiParam({ name: 'domain', description: 'Nome do domínio' })
  @ApiResponse({ status: 200, description: 'Status de verificação retornado com sucesso' })
  async getDomainStatus(
    @Param('domain') domain: string,
    @Company() companyId: string,
  ): Promise<DomainVerificationResponse> {
    return this.domainService.getDomainStatus(companyId, domain);
  }

  /**
   * POST /v1/domains/:domain/verify
   * Inicia verificação DNS de um domínio
   */
  @Post(':domain/verify')
  @SandboxAllowed()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Inicia verificação DNS de um domínio' })
  @ApiParam({ name: 'domain', description: 'Nome do domínio' })
  @ApiResponse({ status: 200, description: 'Verificação iniciada com sucesso' })
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
  @SandboxAllowed()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Obtém registros DNS necessários para um domínio' })
  @ApiParam({ name: 'domain', description: 'Nome do domínio' })
  @ApiResponse({ status: 200, description: 'Registros DNS retornados com sucesso' })
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
  @SandboxAllowed()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Habilita DKIM para um domínio' })
  @ApiParam({ name: 'domain', description: 'Nome do domínio' })
  @ApiResponse({ status: 200, description: 'DKIM habilitado com sucesso' })
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
  @SandboxAllowed()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Valida registros DNS de um domínio' })
  @ApiParam({ name: 'domain', description: 'Nome do domínio' })
  @ApiResponse({ status: 200, description: 'Validação DNS retornada com sucesso' })
  async validateDNS(
    @Param('domain') domain: string,
    @Request() req: any,
  ): Promise<DNSRecordsResponse> {
    const companyId = req.companyId;
    return this.domainService.validateDNS(companyId, domain);
  }

  /**
   * POST /v1/domains/:domain/warmup
   * Configura warm-up para um domínio
   */
  @Post(':domain/warmup')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Configura warm-up para um domínio' })
  @ApiParam({ name: 'domain', description: 'Nome do domínio' })
  @ApiResponse({ status: 200, description: 'Warm-up configurado com sucesso' })
  async configureWarmup(
    @Param('domain') domain: string,
    @Body() body: WarmupConfigRequest,
    @Request() req: any,
  ) {
    const companyId = req.companyId;
    return this.domainService.configureWarmup(companyId, domain, body);
  }

  /**
   * GET /v1/domains/:id
   * Obtém detalhes de um domínio específico por ID
   */
  @Get(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Obtém detalhes de um domínio específico' })
  @ApiParam({ name: 'id', description: 'ID do domínio' })
  @ApiResponse({ status: 200, description: 'Detalhes do domínio retornados com sucesso' })
  async getDomainById(
    @Param('id') id: string,
    @Request() req: any,
  ): Promise<DomainVerificationResponse> {
    const companyId = req.companyId;
    return this.domainService.getDomainById(companyId, id);
  }

  /**
   * PUT /v1/domains/:id/default
   * Define um domínio como padrão para a empresa
   */
  @Put(':id/default')
  @SandboxAllowed()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Define um domínio como padrão para a empresa' })
  @ApiParam({ name: 'id', description: 'ID do domínio' })
  @ApiResponse({ status: 200, description: 'Domínio definido como padrão com sucesso' })
  async setDefaultDomain(
    @Param('id') id: string,
    @Company() companyId: string,
  ) {
    return this.domainService.setDefaultDomain(companyId, id);
  }

  /**
   * DELETE /v1/domains/:domain
   * Remove um domínio
   */
  @Delete(':domain')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove um domínio' })
  @ApiParam({ name: 'domain', description: 'Nome do domínio' })
  @ApiResponse({ status: 204, description: 'Domínio removido com sucesso' })
  async removeDomain(
    @Param('domain') domain: string,
    @Request() req: any,
  ) {
    const companyId = req.companyId;
    return this.domainService.removeDomain(companyId, domain);
  }
}
