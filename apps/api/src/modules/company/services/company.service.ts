/**
 * @email-gateway/api - Company Service
 *
 * TASK-036: Service para gerenciamento de empresas
 */

import { Injectable, ConflictException, Logger } from '@nestjs/common';
import { prisma } from '@email-gateway/database';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { RegisterCompanyDto } from '../dto/register-company.dto';

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
    const { apiKey, apiKeyHash, apiKeyPrefix } = this.generateSecureApiKey();

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
   */
  generateSecureApiKey(): { apiKey: string; apiKeyHash: string; apiKeyPrefix: string } {
    const randomBytes = crypto.randomBytes(this.API_KEY_BYTES);
    const apiKey = `sk_live_${randomBytes.toString('hex')}`;
    const apiKeyHash = crypto.createHash('sha256').update(apiKey).digest('hex');
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
}
