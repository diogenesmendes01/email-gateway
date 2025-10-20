import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Request, Response } from 'express';
import { AuthService } from './auth.service';

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(private authService: AuthService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();
    
    const startTime = Date.now();
    const companyId = request['companyId'];
    const userId = request['userId']; // Para Basic Auth no dashboard
    const ipAddress = this.getClientIp(request);
    const userAgent = request.headers['user-agent'];

    return next.handle().pipe(
      tap({
        next: (data) => {
          this.logAuditEvent({
            request,
            response,
            companyId,
            userId,
            ipAddress,
            userAgent,
            startTime,
            status: 'success',
            data,
          });
        },
        error: (error) => {
          this.logAuditEvent({
            request,
            response,
            companyId,
            userId,
            ipAddress,
            userAgent,
            startTime,
            status: 'error',
            error: error.message,
          });
        },
      }),
    );
  }

  private async logAuditEvent({
    request,
    response,
    companyId,
    userId,
    ipAddress,
    userAgent,
    startTime,
    status,
    data,
    error,
  }: {
    request: Request;
    response: Response;
    companyId?: string;
    userId?: string;
    ipAddress: string;
    userAgent?: string;
    startTime: number;
    status: 'success' | 'error';
    data?: any;
    error?: string;
  }) {
    if (!companyId) {
      return; // Só audita requisições autenticadas
    }

    const duration = Date.now() - startTime;
    const action = this.getActionFromRequest(request);
    const resource = this.getResourceFromRequest(request);
    const resourceId = this.getResourceIdFromRequest(request);

    // Dados sensíveis que devem ser mascarados
    const sensitiveFields = ['cpf_cnpj', 'cpfCnpj', 'password', 'apiKey'];
    const sanitizedData = this.sanitizeData(data, sensitiveFields);

    await this.authService.logAuditEvent({
      companyId,
      userId,
      action,
      resource,
      resourceId,
      ipAddress,
      userAgent,
      metadata: {
        method: request.method,
        url: request.url,
        statusCode: response.statusCode,
        duration,
        status,
        error: error || null,
        data: sanitizedData,
      },
    });
  }

  private getActionFromRequest(request: Request): string {
    const method = request.method.toLowerCase();
    const path = request.path;

    // Mapeia métodos HTTP para ações de auditoria
    const actionMap: Record<string, string> = {
      'GET': 'read',
      'POST': 'create',
      'PUT': 'update',
      'PATCH': 'update',
      'DELETE': 'delete',
    };

    // Ações específicas baseadas no path
    if (path.includes('/email/send')) {
      return 'send_email';
    }
    if (path.includes('/emails') && method === 'get') {
      return 'list_emails';
    }
    if (path.includes('/emails/') && method === 'get') {
      return 'view_email';
    }

    return actionMap[method] || method;
  }

  private getResourceFromRequest(request: Request): string {
    const path = request.path;

    if (path.includes('/email')) {
      return 'email';
    }
    if (path.includes('/recipients')) {
      return 'recipient';
    }
    if (path.includes('/companies')) {
      return 'company';
    }

    return 'unknown';
  }

  private getResourceIdFromRequest(request: Request): string | undefined {
    const path = request.path;
    
    // Extrai ID de paths como /emails/123 ou /recipients/456
    const idMatch = path.match(/\/([a-f0-9-]{36})\/?$/);
    return idMatch ? idMatch[1] : undefined;
  }

  private sanitizeData(data: any, sensitiveFields: string[]): any {
    if (!data || typeof data !== 'object') {
      return data;
    }

    if (Array.isArray(data)) {
      return data.map(item => this.sanitizeData(item, sensitiveFields));
    }

    const sanitized = { ...data };
    
    for (const field of sensitiveFields) {
      if (field in sanitized) {
        sanitized[field] = '***MASKED***';
      }
    }

    // Recursivamente sanitiza objetos aninhados
    for (const key in sanitized) {
      if (typeof sanitized[key] === 'object' && sanitized[key] !== null) {
        sanitized[key] = this.sanitizeData(sanitized[key], sensitiveFields);
      }
    }

    return sanitized;
  }

  private getClientIp(request: Request): string {
    const forwarded = request.headers['x-forwarded-for'];
    const realIp = request.headers['x-real-ip'];
    const remoteAddress = request.connection.remoteAddress;
    
    if (forwarded) {
      return Array.isArray(forwarded) ? forwarded[0] : forwarded.split(',')[0].trim();
    }
    
    if (realIp) {
      return Array.isArray(realIp) ? realIp[0] : realIp;
    }
    
    return remoteAddress || 'unknown';
  }
}
