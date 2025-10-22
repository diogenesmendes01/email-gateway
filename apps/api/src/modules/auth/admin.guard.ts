import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';

interface DashboardUser {
  username: string;
  type: 'basic_auth';
  role: 'admin' | 'readonly';
}

@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requireAdmin = this.reflector.getAllAndOverride<boolean>('requireAdmin', [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requireAdmin) {
      return true; // Se não requer admin, permite acesso
    }

    const request = context.switchToHttp().getRequest<Request>();
    const user = (request as any).user as DashboardUser;

    if (!user) {
      throw new ForbiddenException('User not authenticated');
    }

    if (user.role !== 'admin') {
      throw new ForbiddenException('Admin privileges required');
    }

    return true;
  }
}
