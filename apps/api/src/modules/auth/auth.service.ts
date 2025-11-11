import { Injectable, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { prisma } from '@email-gateway/database';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';

export interface ApiKeyPayload {
  companyId: string;
  prefix: string;
  expiresAt: Date;
  lastUsedAt?: Date;
  allowedIps?: string[];
  rateLimitConfig?: RateLimitConfig;
  isActive: boolean;
}

export interface RateLimitConfig {
  rps: number;
  burst: number;
  windowMs: number;
}

@Injectable()
export class AuthService {
  constructor(private configService: ConfigService) {}

  /**
   * Gera uma nova API Key com prefixo e hash
   */
  async generateApiKey(companyId: string, prefix: string = 'sk_live'): Promise<{
    apiKey: string;
    hash: string;
    expiresAt: Date;
  }> {
    // Gera token seguro de 32 bytes
    const token = crypto.randomBytes(32).toString('hex');
    const apiKey = `${prefix}_${token}`;
    
    // Hash da API Key para armazenamento seguro
    const hash = await bcrypt.hash(apiKey, 12);
    
    // Data de expiração: 90 dias a partir de agora
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 90);
    
    return {
      apiKey,
      hash,
      expiresAt,
    };
  }

  /**
   * Valida API Key e retorna informações da empresa
   */
  async validateApiKey(apiKey: string): Promise<ApiKeyPayload | null> {
    try {
      // Extrai prefixo da API Key (primeiros 12 caracteres)
      const prefix = apiKey.substring(0, 12);
      
      // Busca todas as empresas para verificar o hash da API Key
      const companies = await prisma.company.findMany({
        where: {
          apiKeyPrefix: prefix,
          isActive: true,
        },
      });

      // Verifica se alguma empresa tem a API Key válida
      for (const company of companies) {
        const isValid = await bcrypt.compare(apiKey, company.apiKeyHash);
        if (isValid) {
          // Verifica se a API Key não expirou
          if (this.isApiKeyExpired(company.apiKeyExpiresAt)) {
            throw new UnauthorizedException('API Key has expired');
          }

          // Atualiza lastUsedAt
          await this.updateLastUsedAt(company.id);

          return {
            companyId: company.id,
            prefix: company.apiKeyPrefix,
            expiresAt: company.apiKeyExpiresAt,
            lastUsedAt: company.lastUsedAt || undefined,
            allowedIps: company.allowedIps,
            rateLimitConfig: company.rateLimitConfig as any as RateLimitConfig,
            isActive: company.isActive,
          };
        }
      }

      return null;
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new UnauthorizedException('Invalid API Key format');
    }
  }

  /**
   * Verifica se o IP está na allowlist da empresa
   */
  async validateIpAllowlist(
    companyId: string,
    clientIp: string,
  ): Promise<boolean> {
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { allowedIps: true },
    });

    if (!company) {
      return false;
    }

    // Se não há IPs na allowlist, permite todos
    if (!company.allowedIps || company.allowedIps.length === 0) {
      return true;
    }

    // Verifica se o IP está na allowlist
    return company.allowedIps.includes(clientIp);
  }

  /**
   * Atualiza lastUsedAt da API Key
   */
  async updateLastUsedAt(companyId: string): Promise<void> {
    await prisma.company.update({
      where: { id: companyId },
      data: { lastUsedAt: new Date() },
    });
  }

  /**
   * Verifica se a API Key expirou
   */
  isApiKeyExpired(expiresAt: Date): boolean {
    return new Date() > expiresAt;
  }

  /**
   * Verifica se a API Key está próxima do vencimento (7 dias)
   */
  isApiKeyNearExpiration(expiresAt: Date): boolean {
    const sevenDaysFromNow = new Date();
    sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);
    return expiresAt <= sevenDaysFromNow;
  }

  /**
   * Gera hash para Basic Auth
   */
  async generateBasicAuthHash(password: string): Promise<string> {
    return bcrypt.hash(password, 12);
  }

  /**
   * Valida Basic Auth
   */
  async validateBasicAuth(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }

  /**
   * Registra evento de auditoria
   */
  async logAuditEvent(data: {
    companyId: string;
    userId?: string;
    action: string;
    resource: string;
    resourceId?: string;
    ipAddress?: string;
    userAgent?: string;
    metadata?: any;
  }): Promise<void> {
    await prisma.auditLog.create({
      data: {
        companyId: data.companyId,
        userId: data.userId,
        action: data.action,
        resource: data.resource,
        resourceId: data.resourceId,
        ipAddress: data.ipAddress,
        userAgent: data.userAgent,
        metadata: data.metadata,
      },
    });
  }

  /**
   * Obtém configuração de rate limit por empresa
   */
  getRateLimitConfig(companyId: string): RateLimitConfig {
    // Configuração padrão: 60 RPS com burst de 120
    return {
      rps: 60,
      burst: 120,
      windowMs: 1000, // 1 segundo
    };
  }
}
