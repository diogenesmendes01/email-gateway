import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { AuthService } from './auth.service';

interface BasicAuthCredentials {
  username: string;
  password: string;
}

@Injectable()
export class BasicAuthGuard implements CanActivate {
  constructor(
    private authService: AuthService,
    private configService: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const authHeader = request.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Basic ')) {
      throw new UnauthorizedException('Basic authentication required');
    }

    try {
      const credentials = this.parseBasicAuth(authHeader);
      const isValid = await this.validateCredentials(credentials);

      if (!isValid) {
        throw new UnauthorizedException('Invalid credentials');
      }

      // Adiciona informações do usuário ao request
      (request as any)['user'] = {
        username: credentials.username,
        type: 'basic_auth',
      };
      (request as any)['userId'] = credentials.username;

      return true;
    } catch (error) {
      throw new UnauthorizedException('Invalid basic authentication');
    }
  }

  private parseBasicAuth(authHeader: string): BasicAuthCredentials {
    const base64Credentials = authHeader.slice(6); // Remove 'Basic '
    const credentials = Buffer.from(base64Credentials, 'base64').toString('utf-8');
    const [username, password] = credentials.split(':');

    if (!username || !password) {
      throw new Error('Invalid basic auth format');
    }

    return { username, password };
  }

  private async validateCredentials(credentials: BasicAuthCredentials): Promise<boolean> {
    // Obtém credenciais das variáveis de ambiente
    const dashboardUsername = this.configService.get<string>('DASHBOARD_USERNAME', 'admin');
    const dashboardPasswordHash = this.configService.get<string>('DASHBOARD_PASSWORD_HASH');
    
    if (!dashboardPasswordHash) {
      throw new UnauthorizedException('Dashboard authentication not configured');
    }

    // Verifica se o usuário corresponde
    if (credentials.username !== dashboardUsername) {
      return false;
    }

    // Valida a senha
    return this.authService.validateBasicAuth(credentials.password, dashboardPasswordHash);
  }

  /**
   * Gera hash para senhas do Basic Auth
   * Usar este método para gerar hashes seguros das senhas
   */
  static async generatePasswordHash(password: string): Promise<string> {
    const bcrypt = require('bcrypt');
    return bcrypt.hash(password, 12);
  }
}
