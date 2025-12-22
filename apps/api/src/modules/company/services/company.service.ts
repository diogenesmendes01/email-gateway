/**
 * @email-gateway/api - Company Service
 *
 * TASK-036: Service para gerenciamento de empresas
 */

import { Injectable, ConflictException, Logger, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { prisma } from '@email-gateway/database';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { RegisterCompanyDto } from '../dto/register-company.dto';
import { UpdateProfileDto } from '../dto/update-profile.dto';
import { RegenerateApiKeyDto } from '../dto/regenerate-api-key.dto';

export interface CompanyRegistrationResponse {
  id: string;
  name: string;
  email: string;
  apiKey: string;
  apiKeyPrefix: string;
  status: 'pending_approval';
  dailyEmailLimit: number;
  message: string;
}

export interface CompanyProfile {
  id: string;
  name: string;
  email: string;
  status: {
    isApproved: boolean;
    isActive: boolean;
    isSuspended: boolean;
    approvedAt: Date | null;
    suspensionReason: string | null;
  };
  limits: {
    dailyEmailLimit: number;
    monthlyEmailLimit: number | null;
    emailsSentToday: number;
    emailsSentThisMonth: number;
  };
  metrics: {
    bounceRate: number;
    complaintRate: number;
    totalEmailsSent: number;
    lastMetricsUpdate: Date | null;
  };
  config: {
    defaultFromAddress: string | null;
    defaultFromName: string | null;
    domainId: string | null;
  };
  apiKey: {
    prefix: string;
    createdAt: Date;
    expiresAt: Date;
    lastUsedAt: Date | null;
  };
  createdAt: Date;
  updatedAt: Date;
}

export interface RegenerateApiKeyResponse {
  apiKey: string;
  apiKeyPrefix: string;
  expiresAt: Date;
  message: string;
}

@Injectable()
export class CompanyService {
  private readonly logger = new Logger(CompanyService.name);
  private readonly BCRYPT_ROUNDS = 10;
  private readonly API_KEY_BYTES = 32;

  /**
   * Registra uma nova empresa
   * TASK-036: Company registration
   */
  async register(dto: RegisterCompanyDto): Promise<CompanyRegistrationResponse> {
    // 1. Verificar se email já existe
    const emailExists = await this.checkEmailExists(dto.email);
    if (emailExists) {
      throw new ConflictException('Email já cadastrado no sistema');
    }

    // 2. Hash da senha
    const passwordHash = await bcrypt.hash(dto.password, this.BCRYPT_ROUNDS);

    // 3. Gerar API Key
    const { apiKey, apiKeyHash, apiKeyPrefix } = await this.generateSecureApiKey();

    // 4. Criar empresa
    const company = await prisma.company.create({
      data: {
        name: dto.name,
        email: dto.email,
        passwordHash,
        apiKey: apiKeyHash, // Armazena hash, não a key em plain text
        apiKeyHash,
        apiKeyPrefix,
        apiKeyCreatedAt: new Date(),
        apiKeyExpiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 ano
        defaultFromAddress: dto.fromAddress || dto.email,
        defaultFromName: dto.fromName || dto.name,
        isActive: true,
        isApproved: false, // Sandbox mode
        isSuspended: false,
        dailyEmailLimit: 100, // Limite inicial baixo
        monthlyEmailLimit: 3000,
        bounceRate: 0,
        complaintRate: 0,
      },
    });

    this.logger.log({
      message: 'Company registered successfully',
      companyId: company.id,
      companyName: company.name,
      email: dto.email,
      status: 'pending_approval',
    });

    return {
      id: company.id,
      name: company.name,
      email: dto.email,
      apiKey, // Retorna a API Key em plain text (ÚNICA VEZ!)
      apiKeyPrefix,
      status: 'pending_approval',
      dailyEmailLimit: company.dailyEmailLimit,
      message:
        'Registro realizado com sucesso! Sua conta está em análise e será aprovada em até 7 dias. Guarde sua API Key em local seguro - ela não será mostrada novamente!',
    };
  }

  /**
   * Gera API Key segura
   * Formato: sk_live_[32 bytes hex]
   * Usa bcrypt para hash (consistente com AuthService.validateApiKey)
   */
  async generateSecureApiKey(): Promise<{ apiKey: string; apiKeyHash: string; apiKeyPrefix: string }> {
    const randomBytes = crypto.randomBytes(this.API_KEY_BYTES);
    const apiKey = `sk_live_${randomBytes.toString('hex')}`;
    // Usa bcrypt para hash (consistente com validateApiKey do AuthService)
    const apiKeyHash = await bcrypt.hash(apiKey, this.BCRYPT_ROUNDS);
    const apiKeyPrefix = `${apiKey.substring(0, 12)}...`; // Para exibição

    return { apiKey, apiKeyHash, apiKeyPrefix };
  }

  /**
   * Verifica se email já existe
   */
  async checkEmailExists(email: string): Promise<boolean> {
    const company = await prisma.company.findUnique({
      where: { email },
      select: { id: true },
    });

    return !!company;
  }

  /**
   * Valida força da senha
   * Mínimo: 8 caracteres, 1 maiúscula, 1 número
   */
  validatePassword(password: string): boolean {
    if (password.length < 8) return false;
    if (!/[A-Z]/.test(password)) return false;
    if (!/\d/.test(password)) return false;
    return true;
  }

  /**
   * Obtém perfil completo da empresa
   * TASK-037: Get company profile
   */
  async getProfile(companyId: string): Promise<CompanyProfile> {
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      include: {
        _count: {
          select: {
            emailLogs: {
              where: { status: 'SENT' },
            },
          },
        },
      },
    });

    if (!company) {
      throw new NotFoundException('Empresa não encontrada');
    }

    // Calcular uso hoje
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const emailsSentToday = await prisma.emailLog.count({
      where: {
        companyId,
        status: 'SENT',
        createdAt: { gte: today },
      },
    });

    // Calcular uso este mês
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const emailsSentThisMonth = await prisma.emailLog.count({
      where: {
        companyId,
        status: 'SENT',
        createdAt: { gte: startOfMonth },
      },
    });

    return {
      id: company.id,
      name: company.name,
      email: company.email,
      status: {
        isApproved: company.isApproved,
        isActive: company.isActive,
        isSuspended: company.isSuspended,
        approvedAt: company.approvedAt,
        suspensionReason: company.suspensionReason,
      },
      limits: {
        dailyEmailLimit: company.dailyEmailLimit,
        monthlyEmailLimit: company.monthlyEmailLimit,
        emailsSentToday,
        emailsSentThisMonth,
      },
      metrics: {
        bounceRate: company.bounceRate,
        complaintRate: company.complaintRate,
        totalEmailsSent: company._count.emailLogs,
        lastMetricsUpdate: company.lastMetricsUpdate,
      },
      config: {
        defaultFromAddress: company.defaultFromAddress,
        defaultFromName: company.defaultFromName,
        domainId: company.domainId,
      },
      apiKey: {
        prefix: company.apiKeyPrefix,
        createdAt: company.apiKeyCreatedAt,
        expiresAt: company.apiKeyExpiresAt,
        lastUsedAt: company.lastUsedAt,
      },
      createdAt: company.createdAt,
      updatedAt: company.updatedAt,
    };
  }

  /**
   * Atualiza perfil da empresa
   * TASK-037: Update company profile
   */
  async updateProfile(
    companyId: string,
    dto: UpdateProfileDto
  ): Promise<CompanyProfile> {
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { id: true },
    });

    if (!company) {
      throw new NotFoundException('Empresa não encontrada');
    }

    // TASK-038: Bloquear atualização direta de remetente padrão
    // Remetente padrão deve ser definido apenas via setDefaultDomain
    await prisma.company.update({
      where: { id: companyId },
      data: {
        name: dto.name,
        // defaultFromAddress e defaultFromName são gerenciados apenas pelo setDefaultDomain
      },
    });

    this.logger.log({
      message: 'Company profile updated',
      companyId,
      updates: dto,
    });

    return this.getProfile(companyId);
  }

  /**
   * Regenera API Key
   * TASK-037: Regenerate API Key
   */
  async regenerateApiKey(
    companyId: string,
    dto: RegenerateApiKeyDto
  ): Promise<RegenerateApiKeyResponse> {
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { id: true, passwordHash: true, name: true },
    });

    if (!company) {
      throw new NotFoundException('Empresa não encontrada');
    }

    // Validar senha atual
    const passwordValid = await bcrypt.compare(
      dto.currentPassword,
      company.passwordHash
    );

    if (!passwordValid) {
      throw new UnauthorizedException('Senha incorreta');
    }

    // Gerar nova API Key
    const { apiKey, apiKeyHash, apiKeyPrefix } = await this.generateSecureApiKey();
    const expiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000); // 1 ano

    // Atualizar no banco
    await prisma.company.update({
      where: { id: companyId },
      data: {
        apiKey: apiKeyHash,
        apiKeyHash,
        apiKeyPrefix,
        apiKeyCreatedAt: new Date(),
        apiKeyExpiresAt: expiresAt,
      },
    });

    this.logger.warn({
      message: 'API Key regenerated',
      companyId,
      companyName: company.name,
      oldKeyInvalidated: true,
    });

    return {
      apiKey, // Retorna em plain text (ÚNICA VEZ!)
      apiKeyPrefix,
      expiresAt,
      message:
        'API Key regenerada com sucesso! Guarde em local seguro - não será mostrada novamente. A API Key anterior foi invalidada.',
    };
  }
}
