# TASK 8.3 - Architectural Improvements and Best Practices

**Priority:** MEDIUM
**Category:** Architecture / Code Quality
**Estimated Effort:** 4-6 hours
**Dependencies:** TASK 8.1, TASK 8.2

## Context

After completing critical security fixes and queue integration, several architectural improvements should be made to enhance maintainability, testability, and follow best practices.

## Issues and Improvements

### 1. Global Exception Filter Missing

**Problem:** No global exception filter to handle errors consistently

**Impact:**
- Inconsistent error responses across endpoints
- Stack traces exposed in production
- Poor error logging/tracking

**Solution:** Create global exception filter

```typescript
// apps/api/src/filters/http-exception.filter.ts
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(private readonly logger: Logger) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status = exception instanceof HttpException
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;

    const errorResponse = {
      error: {
        code: this.getErrorCode(exception),
        message: this.getErrorMessage(exception),
        requestId: request.headers['x-request-id'] || 'unknown',
        timestamp: new Date().toISOString(),
        path: request.url,
      }
    };

    // Log error (structured)
    this.logger.error({
      ...errorResponse.error,
      stack: exception instanceof Error ? exception.stack : undefined,
      method: request.method,
      body: request.body,
      companyId: (request as any).companyId,
    });

    // Never expose stack traces in production
    if (process.env.NODE_ENV !== 'production' && exception instanceof Error) {
      (errorResponse.error as any).stack = exception.stack;
    }

    response.status(status).json(errorResponse);
  }
}
```

Apply globally:
```typescript
// apps/api/src/main.ts
app.useGlobalFilters(new AllExceptionsFilter(new Logger('ExceptionFilter')));
```

### 2. Request ID Middleware Missing

**Problem:** No correlation ID for request tracking across API → Queue → Worker

**Impact:**
- Difficult to trace requests end-to-end
- Logs are disconnected
- Poor debugging experience

**Solution:** Create request ID middleware

```typescript
// apps/api/src/middleware/request-id.middleware.ts
@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    // Use existing request ID or generate new one
    const requestId = req.headers['x-request-id'] || `req_${crypto.randomUUID()}`;

    // Set on request for use in controllers
    (req as any).requestId = requestId;

    // Echo back in response
    res.setHeader('X-Request-Id', requestId);

    next();
  }
}
```

Apply in AppModule:
```typescript
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(RequestIdMiddleware)
      .forRoutes('*');
  }
}
```

### 3. API Response Interceptor for Consistency

**Problem:** Response formats vary across endpoints

**Solution:** Create response interceptor

```typescript
// apps/api/src/interceptors/transform.interceptor.ts
@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<T, Response<T>> {
  intercept(context: ExecutionContext, next: CallHandler): Observable<Response<T>> {
    const request = context.switchToHttp().getRequest();

    return next.handle().pipe(
      map(data => ({
        data,
        meta: {
          requestId: request.requestId || request.headers['x-request-id'],
          timestamp: new Date().toISOString(),
        }
      }))
    );
  }
}

interface Response<T> {
  data: T;
  meta: {
    requestId: string;
    timestamp: string;
  };
}
```

### 4. Environment Variable Validation

**Problem:** No validation of required environment variables at startup

**Impact:**
- Runtime errors when config is missing
- Poor developer experience
- Difficult to diagnose misconfigurations

**Solution:** Add environment schema validation

```typescript
// apps/api/src/config/env.validation.ts
import { plainToInstance } from 'class-transformer';
import { IsEnum, IsNumber, IsString, validateSync, IsOptional } from 'class-validator';

enum Environment {
  Development = 'development',
  Production = 'production',
  Test = 'test',
}

class EnvironmentVariables {
  @IsEnum(Environment)
  NODE_ENV: Environment;

  @IsNumber()
  @Type(() => Number)
  PORT: number;

  @IsString()
  DATABASE_URL: string;

  @IsString()
  REDIS_HOST: string;

  @IsNumber()
  @Type(() => Number)
  REDIS_PORT: number;

  @IsString()
  AWS_REGION: string;

  @IsString()
  SES_FROM_ADDRESS: string;

  @IsString()
  ENCRYPTION_KEY: string;

  @IsOptional()
  @IsString()
  CORS_ORIGIN?: string;
}

export function validate(config: Record<string, unknown>) {
  const validatedConfig = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });

  const errors = validateSync(validatedConfig, { skipMissingProperties: false });

  if (errors.length > 0) {
    throw new Error(errors.toString());
  }

  return validatedConfig;
}
```

Use in AppModule:
```typescript
ConfigModule.forRoot({
  isGlobal: true,
  validate,
});
```

### 5. Structured Logging Service

**Problem:** Inconsistent logging with `console.log`

**Solution:** Create logging service wrapper

```typescript
// apps/api/src/services/logger.service.ts
@Injectable()
export class LoggerService extends Logger {
  log(message: string, context?: Record<string, any>) {
    super.log(JSON.stringify({ message, ...context, level: 'info' }));
  }

  error(message: string, trace?: string, context?: Record<string, any>) {
    super.error(JSON.stringify({
      message,
      trace,
      ...context,
      level: 'error'
    }));
  }

  warn(message: string, context?: Record<string, any>) {
    super.warn(JSON.stringify({ message, ...context, level: 'warn' }));
  }

  debug(message: string, context?: Record<string, any>) {
    super.debug(JSON.stringify({ message, ...context, level: 'debug' }));
  }
}
```

### 6. Health Check Improvements

**Problem:** Basic health check doesn't verify dependencies

**Solution:** Enhanced health checks with Terminus

```typescript
// apps/api/src/modules/health/health.controller.ts
import { HealthCheck, HealthCheckService, PrismaHealthIndicator } from '@nestjs/terminus';

@Controller('health')
export class HealthController {
  constructor(
    private health: HealthCheckService,
    private db: PrismaHealthIndicator,
    private redis: RedisHealthIndicator,
    private queueService: QueueService,
  ) {}

  @Get()
  @HealthCheck()
  check() {
    return this.health.check([
      () => this.db.pingCheck('database'),
      () => this.redis.pingCheck('redis'),
      async () => {
        const queueHealth = await this.queueService.getQueueHealth();
        const isHealthy = queueHealth.active < 1000; // Threshold
        return {
          queue: {
            status: isHealthy ? 'up' : 'degraded',
            ...queueHealth,
          }
        };
      },
    ]);
  }

  @Get('ready')
  @HealthCheck()
  readiness() {
    // For Kubernetes readiness probe
    return this.health.check([
      () => this.db.pingCheck('database'),
    ]);
  }

  @Get('live')
  liveness() {
    // For Kubernetes liveness probe
    return { status: 'ok' };
  }
}
```

### 7. DTOs and Validation Improvements

**Problem:** Inconsistent use of DTOs, some validation done manually

**Solution:**
- Create DTOs for all endpoints
- Use class-validator consistently
- Move Zod validation to NestJS pipes

```typescript
// apps/api/src/modules/email/dto/send-email.dto.ts
import { IsEmail, IsString, IsOptional, IsArray, MaxLength } from 'class-validator';

export class SendEmailDto {
  @IsEmail()
  to: string;

  @IsArray()
  @IsEmail({}, { each: true })
  @IsOptional()
  cc?: string[];

  @IsArray()
  @IsEmail({}, { each: true })
  @IsOptional()
  bcc?: string[];

  @IsString()
  @MaxLength(150)
  subject: string;

  @IsString()
  html: string;

  @IsEmail()
  @IsOptional()
  replyTo?: string;

  // ... other fields
}
```

### 8. Decorator for Company Context

**Problem:** Manually extracting companyId from request

**Solution:** Create custom decorator

```typescript
// apps/api/src/modules/auth/decorators.ts
export const GetCompany = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): ApiKeyPayload => {
    const request = ctx.switchToHttp().getRequest();
    return request.company; // Set by ApiKeyGuard
  },
);

// Usage in controller
@Post('send')
async sendEmail(
  @Body() body: SendEmailDto,
  @GetCompany() company: ApiKeyPayload,
) {
  return this.emailSendService.sendEmail({
    companyId: company.companyId,
    body,
  });
}
```

### 9. Worker Graceful Shutdown Improvements

**Problem:** Worker shutdown waits blindly for 30s

**Solution:** Actually check for active jobs

```typescript
// apps/worker/src/index.ts
private async shutdown(signal: string) {
  console.log(`[Worker] Received ${signal}, shutting down gracefully...`);

  await this.worker.pause(); // Stop accepting new jobs

  // Wait for active jobs to complete
  const timeout = 30000;
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    const activeCount = await this.queue.getActiveCount();

    if (activeCount === 0) {
      console.log('[Worker] All jobs completed');
      break;
    }

    console.log(`[Worker] Waiting for ${activeCount} active jobs...`);
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  await this.worker.close();
  await this.prisma.$disconnect();
  process.exit(0);
}
```

### 10. Configuration Management

**Problem:** Configuration scattered across services

**Solution:** Centralized configuration service

```typescript
// apps/api/src/config/configuration.ts
export default () => ({
  port: parseInt(process.env.PORT, 10) || 3000,
  database: {
    url: process.env.DATABASE_URL,
  },
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT, 10) || 6379,
    password: process.env.REDIS_PASSWORD,
    db: parseInt(process.env.REDIS_DB, 10) || 0,
  },
  queue: {
    name: process.env.QUEUE_NAME || 'email:send',
    concurrency: parseInt(process.env.QUEUE_CONCURRENCY, 10) || 2,
    maxRetries: parseInt(process.env.QUEUE_MAX_RETRIES, 10) || 5,
  },
  aws: {
    region: process.env.AWS_REGION,
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
  ses: {
    fromAddress: process.env.SES_FROM_ADDRESS,
    replyToAddress: process.env.SES_REPLY_TO_ADDRESS,
    configurationSetName: process.env.SES_CONFIGURATION_SET_NAME,
  },
  security: {
    encryptionKey: process.env.ENCRYPTION_KEY,
    corsOrigin: process.env.CORS_ORIGIN || '*',
  },
  rateLimit: {
    ttl: parseInt(process.env.RATE_LIMIT_TTL, 10) || 60,
    limit: parseInt(process.env.RATE_LIMIT_LIMIT, 10) || 100,
  },
});
```

## Implementation Checklist

### Phase 1: Error Handling & Logging
- [ ] Create AllExceptionsFilter
- [ ] Create RequestIdMiddleware
- [ ] Create structured LoggerService
- [ ] Apply globally in main.ts
- [ ] Replace console.log with LoggerService

### Phase 2: Configuration
- [ ] Create env.validation.ts
- [ ] Create configuration.ts
- [ ] Add validation to ConfigModule
- [ ] Update services to use ConfigService

### Phase 3: API Improvements
- [ ] Create TransformInterceptor (optional)
- [ ] Create custom decorators (@GetCompany)
- [ ] Create DTOs for all endpoints
- [ ] Add Swagger/OpenAPI annotations

### Phase 4: Health Checks
- [ ] Install @nestjs/terminus
- [ ] Create health indicators
- [ ] Add readiness/liveness endpoints
- [ ] Test with load

### Phase 5: Worker Improvements
- [ ] Improve graceful shutdown logic
- [ ] Add structured logging
- [ ] Add worker health endpoint

### Phase 6: Testing
- [ ] Unit tests for new services
- [ ] Integration tests for middleware
- [ ] E2E tests for full flow

## Files to Create

1. `apps/api/src/filters/http-exception.filter.ts`
2. `apps/api/src/middleware/request-id.middleware.ts`
3. `apps/api/src/interceptors/transform.interceptor.ts`
4. `apps/api/src/config/env.validation.ts`
5. `apps/api/src/config/configuration.ts`
6. `apps/api/src/services/logger.service.ts`
7. `apps/api/src/modules/health/indicators/redis.indicator.ts`

## Files to Modify

1. `apps/api/src/main.ts` - Apply global filters, interceptors
2. `apps/api/src/app.module.ts` - Add middleware, configuration
3. `apps/api/src/modules/email/controllers/*.ts` - Use new decorators/DTOs
4. `apps/worker/src/index.ts` - Improve shutdown logic
5. All services - Replace console.log with LoggerService

## Success Criteria

- [ ] All errors return consistent format
- [ ] All logs are structured JSON
- [ ] Request IDs flow through entire system
- [ ] Environment validation catches config issues
- [ ] Health checks verify all dependencies
- [ ] No direct console.log usage
- [ ] Worker gracefully shuts down
- [ ] All tests pass

## Benefits

1. **Better Observability**: Structured logs, request tracing
2. **Easier Debugging**: Consistent error formats, correlation IDs
3. **Better DX**: Fail fast on misconfiguration
4. **Production Ready**: Proper health checks, graceful shutdown
5. **Maintainable**: Centralized configuration, consistent patterns

## Related Tasks

- TASK 7.1 - Metrics (enhanced with better logging)
- TASK 8.1 - Security (validation helps catch issues)
- TASK 8.2 - Queue Integration (better error handling)

## Documentation Updates

- `docs/architecture/01-visao-geral-sistema.md` - Update architecture diagrams
- `docs/api/01-endpoints.md` - Document error responses
- `README.md` - Update setup with validation
