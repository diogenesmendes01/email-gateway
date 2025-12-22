/**
 * @email-gateway/api - Profile Controller
 *
 * TASK-037: Company profile management endpoints
 */

import {
  Controller,
  Get,
  Put,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  UsePipes,
  ValidationPipe,
  Logger,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { CompanyService, CompanyProfile, RegenerateApiKeyResponse } from '../services/company.service';
import { UpdateProfileDto } from '../dto/update-profile.dto';
import { RegenerateApiKeyDto } from '../dto/regenerate-api-key.dto';
import { ApiKeyOnly, Company } from '../../auth/decorators';
import { DomainService } from '../../domain/domain.service';
import { prisma } from '@email-gateway/database';

@ApiTags('Company Profile')
@Controller('company')
@ApiKeyOnly() // Protege todas as rotas deste controller com API Key
@ApiBearerAuth('ApiKey')
export class ProfileController {
  private readonly logger = new Logger(ProfileController.name);

  constructor(
    private readonly companyService: CompanyService,
    private readonly domainService: DomainService,
  ) {}

  /**
   * GET /v1/company/profile
   * Retorna perfil completo da empresa com métricas e limites
   */
  @Get('profile')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Obter perfil da empresa',
    description: 'Retorna informações completas da empresa incluindo status, limites, métricas e configurações',
  })
  @ApiResponse({
    status: 200,
    description: 'Perfil retornado com sucesso',
  })
  @ApiResponse({
    status: 401,
    description: 'API Key inválida ou expirada',
  })
  @ApiResponse({
    status: 404,
    description: 'Empresa não encontrada',
  })
  async getProfile(@Company() companyId: string): Promise<CompanyProfile> {
    this.logger.log({
      message: 'Get profile request',
      companyId,
    });

    const profile = await this.companyService.getProfile(companyId);

    this.logger.log({
      message: 'Profile retrieved successfully',
      companyId,
      status: profile.status,
    });

    return profile;
  }

  /**
   * PUT /v1/company/profile
   * Atualiza informações do perfil da empresa
   */
  @Put('profile')
  @HttpCode(HttpStatus.OK)
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
  @ApiOperation({
    summary: 'Atualizar perfil da empresa',
    description: 'Atualiza nome e configurações padrão de envio (from address/name)',
  })
  @ApiResponse({
    status: 200,
    description: 'Perfil atualizado com sucesso',
  })
  @ApiResponse({
    status: 400,
    description: 'Dados inválidos',
  })
  @ApiResponse({
    status: 401,
    description: 'API Key inválida ou expirada',
  })
  @ApiResponse({
    status: 404,
    description: 'Empresa não encontrada',
  })
  async updateProfile(
    @Company() companyId: string,
    @Body() dto: UpdateProfileDto,
  ): Promise<CompanyProfile> {
    this.logger.log({
      message: 'Update profile request',
      companyId,
      updates: dto,
    });

    const profile = await this.companyService.updateProfile(companyId, dto);

    this.logger.log({
      message: 'Profile updated successfully',
      companyId,
    });

    return profile;
  }

  /**
   * POST /v1/company/profile/regenerate-api-key
   * Regenera a API Key da empresa (requer senha atual)
   */
  @Post('profile/regenerate-api-key')
  @HttpCode(HttpStatus.OK)
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
  @ApiOperation({
    summary: 'Regenerar API Key',
    description:
      'Gera uma nova API Key para a empresa. Requer senha atual para confirmação. A API Key anterior será invalidada imediatamente.',
  })
  @ApiResponse({
    status: 200,
    description: 'API Key regenerada com sucesso',
  })
  @ApiResponse({
    status: 400,
    description: 'Dados inválidos',
  })
  @ApiResponse({
    status: 401,
    description: 'Senha incorreta ou API Key inválida',
  })
  @ApiResponse({
    status: 404,
    description: 'Empresa não encontrada',
  })
  async regenerateApiKey(
    @Company() companyId: string,
    @Body() dto: RegenerateApiKeyDto,
  ): Promise<RegenerateApiKeyResponse> {
    this.logger.warn({
      message: 'API Key regeneration request',
      companyId,
      timestamp: new Date().toISOString(),
    });

    const result = await this.companyService.regenerateApiKey(companyId, dto);

    this.logger.warn({
      message: 'API Key regenerated successfully',
      companyId,
      newKeyPrefix: result.apiKeyPrefix,
      expiresAt: result.expiresAt,
    });

    return result;
  }

  /**
   * GET /v1/company/profile/default-sender
   * Retorna informações sobre o remetente padrão atual e opções disponíveis
   */
  @Get('profile/default-sender')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Obter informações do remetente padrão',
    description: 'Retorna o remetente padrão atual e lista domínios verificados disponíveis para configuração',
  })
  @ApiResponse({
    status: 200,
    description: 'Informações do remetente padrão retornadas',
  })
  async getDefaultSenderInfo(@Company() companyId: string) {
    const profile = await this.companyService.getProfile(companyId);

    // Buscar domínios verificados diretamente do banco
    const verifiedDomains = await prisma.domain.findMany({
      where: {
        companyId,
        status: 'VERIFIED',
      },
      select: {
        id: true,
        domain: true,
        status: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return {
      current: {
        fromAddress: profile.config.defaultFromAddress,
        fromName: profile.config.defaultFromName,
        domainId: profile.config.domainId,
      },
      availableDomains: verifiedDomains.map(d => ({
        id: d.id,
        domain: d.domain,
        status: d.status,
        createdAt: d.createdAt,
      })),
      message: verifiedDomains.length === 0
        ? 'Nenhum domínio verificado disponível. Configure e verifique um domínio primeiro.'
        : 'Use PUT /v1/company/profile/default-sender para alterar o remetente padrão.',
    };
  }

  /**
   * PUT /v1/company/profile/default-sender
   * Define um novo domínio como remetente padrão
   */
  @Put('profile/default-sender')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Definir remetente padrão',
    description: 'Define um domínio verificado como remetente padrão da empresa',
  })
  @ApiResponse({
    status: 200,
    description: 'Remetente padrão atualizado com sucesso',
  })
  @ApiResponse({
    status: 400,
    description: 'Domínio não encontrado ou não verificado',
  })
  async setDefaultSender(
    @Company() companyId: string,
    @Body() body: { domainId: string },
  ) {
    this.logger.log({
      message: 'Set default sender request',
      companyId,
      domainId: body.domainId,
    });

    const result = await this.domainService.setDefaultDomain(companyId, body.domainId);

    this.logger.log({
      message: 'Default sender updated successfully',
      companyId,
      domain: result.domain,
      fromAddress: result.defaultFromAddress,
    });

    return {
      success: true,
      message: 'Remetente padrão atualizado com sucesso',
      domain: result.domain,
      fromAddress: result.defaultFromAddress,
    };
  }
}
