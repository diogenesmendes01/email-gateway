/**
 * TASK 8.3 - Global Exception Filter
 *
 * Provides consistent error handling across all endpoints
 * - Structured error responses
 * - Never exposes stack traces in production
 * - Logs all errors with context
 * - Includes request ID for correlation
 */

import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

export interface ErrorResponse {
  error: {
    code: string;
    message: string;
    requestId: string;
    timestamp: string;
    path: string;
    stack?: string; // Only in development
  };
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.switchToHttp().getResponse<Response>();
    const request = ctx.switchToHttp().getRequest<Request>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const errorResponse: ErrorResponse = {
      error: {
        code: this.getErrorCode(exception),
        message: this.getErrorMessage(exception),
        requestId: (request as any).requestId || request.headers['x-request-id'] || 'unknown',
        timestamp: new Date().toISOString(),
        path: request.url,
      },
    };

    // Log error with full context (structured)
    this.logger.error({
      ...errorResponse.error,
      stack: exception instanceof Error ? exception.stack : undefined,
      method: request.method,
      body: request.body,
      query: request.query,
      params: request.params,
      companyId: (request as any).companyId,
      userId: (request as any).userId,
    });

    // Never expose stack traces in production
    if (process.env.NODE_ENV !== 'production' && exception instanceof Error) {
      errorResponse.error.stack = exception.stack;
    }

    response.status(status).json(errorResponse);
  }

  private getErrorCode(exception: unknown): string {
    if (exception instanceof HttpException) {
      const response = exception.getResponse();
      if (typeof response === 'object' && 'error' in response && typeof response.error === 'object') {
        const error = response.error as any;
        if ('code' in error) {
          return error.code;
        }
      }
      return exception.constructor.name;
    }

    if (exception instanceof Error) {
      return exception.constructor.name;
    }

    return 'UNKNOWN_ERROR';
  }

  private getErrorMessage(exception: unknown): string {
    if (exception instanceof HttpException) {
      const response = exception.getResponse();
      if (typeof response === 'string') {
        return response;
      }
      if (typeof response === 'object' && 'message' in response) {
        const message = response.message;
        if (Array.isArray(message)) {
          return message.join(', ');
        }
        return String(message);
      }
    }

    if (exception instanceof Error) {
      return exception.message;
    }

    return 'An unexpected error occurred';
  }
}
