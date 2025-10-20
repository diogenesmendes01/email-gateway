import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { AuthService } from './auth.service';

interface BasicAuthCredentials {
  username: string;
  password: string;
}

@Injectable()
export class BasicAuthGuard implements CanActivate {
  constructor(private authService: AuthService) {}

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
      request['user'] = {
        username: credentials.username,
        type: 'basic_auth',
      };
      request['userId'] = credentials.username;

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
    // TODO: Implementar validação contra banco de dados ou configuração
    // Por enquanto, usa credenciais hardcoded para desenvolvimento
    const validCredentials = [
      {
        username: 'admin',
        password: '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj8j/7qJ2V9O', // 'admin123'
      },
      {
        username: 'operator',
        password: '$2b$12$8KQj7F8tN3vR2mP9qL5sCOYz6TtxMQJqhN8/LewdBPj8j/7qJ2V9O', // 'operator123'
      },
    ];

    const user = validCredentials.find(u => u.username === credentials.username);
    if (!user) {
      return false;
    }

    return this.authService.validateBasicAuth(credentials.password, user.password);
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
