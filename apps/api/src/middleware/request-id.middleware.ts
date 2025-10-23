/**
 * TASK 8.3 - Request ID Middleware
 *
 * Generates or uses existing request ID for correlation tracking
 * - Enables end-to-end tracing: API → Queue → Worker
 * - Echoes request ID in response headers
 * - Attaches to request object for use in controllers/services
 */

import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import * as crypto from 'crypto';

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    // Use existing request ID from header or generate new one
    const requestId =
      (req.headers['x-request-id'] as string) ||
      \`req_\${crypto.randomUUID()}\`;

    // Attach to request for use in controllers/services
    (req as any).requestId = requestId;

    // Echo back in response headers for client correlation
    res.setHeader('X-Request-Id', requestId);

    next();
  }
}
