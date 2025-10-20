import { Injectable, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';

export interface ApiKeyPayload {
  companyId: string;
  prefix: string;
  expiresAt: Date;
  lastUsedAt?: Date;
  allowedIps?: string[];
  rateLimitConfig?: RateLimitConfig;
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
      // Extrai prefixo da API Key
      const prefix = apiKey.split('_')[0] + '_' + apiKey.split('_')[1];
      
      // Aqui seria feita a consulta ao banco de dados
      // Por enquanto, retorna null para indicar que precisa ser implementado
      // TODO: Implementar consulta ao banco de dados
      return null;
    } catch (error) {
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
    // TODO: Implementar verificação de IP allowlist
    // Por enquanto, retorna true para permitir todos os IPs
    return true;
  }

  /**
   * Atualiza lastUsedAt da API Key
   */
  async updateLastUsedAt(companyId: string): Promise<void> {
    // TODO: Implementar atualização do lastUsedAt no banco
    console.log(`Updating lastUsedAt for company: ${companyId}`);
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
    // TODO: Implementar logging de auditoria no banco
    console.log('Audit Event:', data);
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
