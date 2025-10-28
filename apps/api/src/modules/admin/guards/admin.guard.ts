/**
 * TASK-021: Admin Guard
 *
 * Protects admin endpoints from unauthorized access
 * Uses special admin API key or token
 */

import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const adminKey = request.headers['x-admin-key'];

    // Get admin key from environment
    const validAdminKey = this.configService.get('ADMIN_API_KEY');

    if (!validAdminKey) {
      throw new UnauthorizedException('Admin access not configured');
    }

    if (!adminKey || adminKey !== validAdminKey) {
      throw new UnauthorizedException('Invalid admin credentials');
    }

    return true;
  }
}
