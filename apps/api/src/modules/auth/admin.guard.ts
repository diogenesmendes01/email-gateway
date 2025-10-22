import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Request } from 'express';

interface DashboardUser {
  username: string;
  type: 'basic_auth';
  role: 'admin' | 'readonly';
}

@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
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
