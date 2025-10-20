# PR Review Knowledge Base

**Version:** 1.0
**Last Updated:** 2025-10-20
**Purpose:** Compiled knowledge for PR review agents (optimized for token efficiency)

---

## 1. Exception Handling

### Required Patterns

**Global Exception Filter (API):**
- Location: `apps/api/src/filters/http-exception.filter.ts`
- Must catch all exceptions
- Return structured error: `{ error: { code, message, requestId, timestamp, path } }`
- NEVER expose stack traces in production
- Log with structured JSON format

**Custom Business Exceptions:**
```typescript
export class BusinessException extends HttpException {
  constructor(
    public readonly code: string,
    message: string,
    status: HttpStatus = HttpStatus.BAD_REQUEST,
  ) {
    super({ code, message }, status);
  }
}
```

**Worker Error Handling:**
- Classify errors: permanent vs transient
- Permanent errors → no retry (move to DLQ)
- Transient errors → retry with backoff
- Always log: jobId, requestId, attempt number, error details

---

## 2. Structured Logging

### Required Format

**ALWAYS use JSON format:**
```typescript
this.logger.log({
  message: 'Clear event description',
  requestId: req.headers['x-request-id'],
  companyId: req.user.companyId,
  // relevant context
});
```

**Log Levels:**
- `error` → Requires attention (DB failures, SES errors)
- `warn` → Abnormal but recoverable (rate limit warning)
- `log` → Important events (email sent, job processed)
- `debug` → Detailed info (dev only)

**NEVER Log:**
- Passwords, API keys, tokens
- CPF/CNPJ without masking
- Full emails (use `maskEmail()`)
- Message content
- Payment data

**Required Fields:**
- `message` (string)
- `requestId` or `jobId` (for correlation)
- `timestamp` (automatic)

---

## 3. Request Tracking

**Request ID Middleware:**
- Generate or use existing `x-request-id` header
- Attach to response header
- Propagate: API → Queue → Worker

**Propagation Pattern:**
```typescript
// API enqueues
await queue.add('job', {
  outboxId: '123',
  requestId: req.headers['x-request-id'],  // PROPAGATE
});

// Worker logs
this.logger.log({
  jobId: job.id,
  requestId: job.data.requestId,  // SAME ID
});
```

---

## 4. Configuration Management

**Environment Variable Validation:**
- Use `class-validator` decorators
- Validate on app startup (fail fast)
- Location: `apps/api/src/config/env.validation.ts`

**Required:**
```typescript
class EnvironmentVariables {
  @IsString()
  DATABASE_URL: string;

  @IsNumber()
  @Min(1024)
  @Max(65535)
  PORT: number;

  @IsString()
  ENCRYPTION_KEY: string;
}
```

**Config Service Pattern:**
- Type-safe access via `AppConfigService`
- Never access `process.env` directly in business logic
- Centralize configuration

---

## 5. TypeScript Standards

**Strict Mode Requirements:**
```json
{
  "strict": true,
  "strictNullChecks": true,
  "noImplicitAny": true,
  "noUnusedLocals": true,
  "noUnusedParameters": true
}
```

**Rules:**
- NO `any` types (use specific types or `unknown`)
- Use interfaces for data structures
- Type guards for runtime validation
- Proper generics usage

---

## 6. Security Standards

### Encryption
**MUST use:**
```typescript
import { encryptCpfCnpj, decryptCpfCnpj } from '@email-gateway/shared';

const { encrypted, salt } = encryptCpfCnpj(cpfCnpj, process.env.ENCRYPTION_KEY);
```

**NEVER use:**
- `crypto.createCipher()` (deprecated, insecure)
- Plain text storage for PII
- Hardcoded secrets

### Input Validation
**MUST use class-validator:**
```typescript
export class SendEmailDto {
  @IsEmail()
  recipient: string;

  @IsString()
  @MaxLength(200)
  subject: string;
}
```

### Rate Limiting
**Critical endpoints:**
```typescript
@UseGuards(ThrottlerGuard)
@Throttle(60, 60)  // 60 req/min
@Post('send')
```

**Sensitive endpoints (auth):**
- `/login` → 10 req/min
- `/reset-password` → 5 req/min
- `/auth/*` → 20 req/min

---

## 7. Performance Guidelines

### Database Queries

**Always use indexes:**
```typescript
// Prisma schema
@@index([companyId, status, createdAt])
```

**Pagination (cursor-based):**
```typescript
const items = await prisma.emailOutbox.findMany({
  take: limit + 1,
  cursor: cursor ? { id: cursor } : undefined,
  orderBy: { createdAt: 'desc' },
});
```

**Avoid N+1:**
```typescript
// WRONG
for (const email of emails) {
  const recipient = await prisma.recipient.findUnique({ where: { id: email.recipientId } });
}

// CORRECT
const emails = await prisma.emailOutbox.findMany({
  include: { recipient: true },
});
```

---

## 8. Testing Standards

### Coverage Requirements

| Code Type | Minimum Coverage |
|-----------|------------------|
| Services | 80% |
| Utils | 90% |
| Controllers | 70% |
| Processors | 80% |
| **Overall** | **70%** |

### Test Types (Pyramid)

```
     /\
    /E2E\       ← 5%
   /------\
  /Integr.\    ← 25%
 /----------\
/   Unit     \  ← 70%
```

### AAA Pattern
```typescript
it('should create email', async () => {
  // Arrange
  const dto = { recipient: 'test@example.com', subject: 'Test' };
  prisma.emailOutbox.create.mockResolvedValue({ id: '123' });

  // Act
  const result = await service.create(dto);

  // Assert
  expect(result.id).toBe('123');
});
```

### Mocking
- Mock external deps (SES, Redis, DB in unit tests)
- Use real DB for integration tests
- E2E tests with full stack

---

## 9. Database Schema Standards

**Required Fields:**
- `id` (String @id @default(cuid()))
- `createdAt` (DateTime @default(now()))
- `updatedAt` (DateTime @updatedAt)

**Naming:**
- Use snake_case for table names: `@@map("table_name")`
- Foreign keys: proper relations with `@relation`

**PII Storage:**
```prisma
model Recipient {
  cpfCnpjEnc   String?  // Encrypted (AES-256-CBC)
  cpfCnpjSalt  String?  // Salt for encryption
  cpfCnpjHash  String?  // HMAC-SHA256 for searching

  @@index([companyId, cpfCnpjHash])  // Search by hash
}
```

**Indexes:**
- Add for all foreign keys
- Add for common query patterns
- Format: `@@index([field1, field2])`

---

## 10. Code Organization

### Module Structure
```
apps/api/src/modules/feature/
├── controllers/
├── services/
├── dto/
├── guards/
├── interceptors/
└── feature.module.ts
```

### Single Responsibility
- One service = one concern
- Controllers delegate to services
- Services focus on business logic
- Utils are stateless functions

### Dependency Injection
**ALWAYS use constructor injection:**
```typescript
@Injectable()
export class EmailService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: QueueService,
    private readonly logger: Logger,
  ) {}
}
```

---

## 11. Common Anti-Patterns (RED FLAGS)

**BLOCKER Issues:**
- `console.log` / `console.error` in production code
- Hardcoded secrets (API keys, passwords)
- `crypto.createCipher()` usage
- Multiple `any` types (>5)
- No error handling in critical paths
- SQL injection vulnerabilities
- Non-reversible migrations
- Circular dependencies

**CRITICAL Issues:**
- Missing rate limiting on auth endpoints
- No input validation on public endpoints
- Missing tests (coverage <70%)
- Weak encryption (not AES-256+)
- N+1 queries in hot paths
- No structured logging
- Missing request ID propagation

---

## 12. PR Review Checklist

**Security:**
- [ ] No hardcoded secrets
- [ ] Encryption uses approved functions
- [ ] Input validation present
- [ ] Rate limiting on sensitive endpoints
- [ ] PII masked in logs

**Code Quality:**
- [ ] No `any` types
- [ ] Structured logging (JSON)
- [ ] Error handling with custom exceptions
- [ ] Dependency injection used
- [ ] TypeScript strict mode

**Testing:**
- [ ] Coverage >= 70%
- [ ] Unit tests for services/utils
- [ ] Integration tests for APIs
- [ ] AAA pattern followed
- [ ] Edge cases covered

**Database:**
- [ ] Migrations reversible
- [ ] Indexes on foreign keys
- [ ] Pagination implemented
- [ ] No N+1 queries
- [ ] PII encrypted

**Performance:**
- [ ] Queries optimized
- [ ] Indexes present
- [ ] Pagination used
- [ ] No blocking operations in API
- [ ] Caching where appropriate

---

## 13. Quick Reference: File Locations

**API:**
- Exception Filter: `apps/api/src/filters/http-exception.filter.ts`
- Request ID Middleware: `apps/api/src/middleware/request-id.middleware.ts`
- Env Validation: `apps/api/src/config/env.validation.ts`
- Config Service: `apps/api/src/config/app.config.ts`

**Worker:**
- Processors: `apps/worker/src/processors/`
- Logging: `apps/worker/src/services/logging.service.ts`
- Metrics: `apps/worker/src/services/metrics.service.ts`

**Database:**
- Schema: `packages/database/prisma/schema.prisma`
- Migrations: `packages/database/prisma/migrations/`

**Shared:**
- Encryption: `packages/shared/src/utils/encryption.util.ts`
- Masking: `packages/shared/src/utils/masking.util.ts`

---

## 14. Project-Specific Context

**Architecture:**
- NestJS API (REST)
- BullMQ workers (background jobs)
- PostgreSQL (Prisma ORM)
- Redis (queue + cache)
- AWS SES (email sending)

**Key Flows:**
1. API receives request → validates → creates outbox → enqueues job
2. Worker picks job → processes → sends via SES → updates status
3. Retry logic: exponential backoff, max 5 attempts, DLQ for permanent failures

**Authentication:**
- API Key via `x-api-key` header
- Guard: `ApiKeyGuard`
- Attached to request: `req.companyId`

**Observability:**
- Request IDs propagated across API → Queue → Worker
- Structured JSON logging
- Metrics in Redis
- Distributed tracing (if implemented)

---

## 15. Task Type Quick Reference

When reviewing PRs, identify the task type to apply appropriate criteria:

**[1] NEW API ENDPOINT:**
- Check: `@UseGuards(ApiKeyGuard)`, structured logging, DTO validation
- Files: `controllers/*.ts`, `services/*.ts`, `dto/*.ts`

**[2] NEW WORKER/PROCESSOR:**
- Check: Error classification (permanent vs transient), retry logic, structured logging
- Files: `processors/*.processor.ts`

**[3] DATABASE SCHEMA CHANGE:**
- Check: Reversible migration, indexes, PII encryption, snake_case naming
- Files: `schema.prisma`, `migrations/*.sql`

**[4] SECURITY/AUTH FEATURE:**
- Check: No deprecated crypto, PII masked in logs, rate limiting, input validation
- Files: `guards/*.ts`, `auth/*.ts`, encryption utils

**[5] OBSERVABILITY:**
- Check: JSON format logs, request ID propagation, no PII in logs
- Files: `services/logging.service.ts`, `services/metrics.service.ts`

**[6] BUG FIX:**
- Check: Regression test added, root cause documented, minimal scope
- Files: Any, `*.spec.ts`

**[7] REFACTORING:**
- Check: No behavior change, tests still pass, coverage maintained
- Files: Any

**[8] CONFIGURATION/ENV VARS:**
- Check: Validation added, documented in .env.example, no secrets committed
- Files: `config/env.validation.ts`, `.env.example`

**[9] TESTING:**
- Check: AAA pattern, proper mocking, coverage >= 70%, edge cases
- Files: `*.spec.ts`, `*.e2e-spec.ts`

**[10] DOCUMENTATION:**
- Check: Clear and concise, code examples, diagrams use Mermaid, no typos
- Files: `docs/**/*.md`

---

## 16. Common Patterns by File Type

**Controllers (`*controller.ts`):**
- Must use `@UseGuards(ApiKeyGuard)`
- Must log with `requestId` and `companyId`
- Must use DTOs for validation
- Must delegate business logic to services

**Services (`*service.ts`):**
- Must use Dependency Injection
- Must use structured logging
- Must throw custom exceptions
- Must be unit tested (>= 80% coverage)

**DTOs (`*dto.ts`):**
- Must use class-validator decorators
- Must have validation tests
- No business logic

**Processors (`*processor.ts`):**
- Must classify errors (permanent vs transient)
- Must log jobId, requestId, attempt number
- Must handle retries correctly
- Must be integration tested

**Migrations (`*.sql`):**
- Must be reversible
- Must use snake_case
- Must not drop columns with data
- Must include indexes

**Tests (`*.spec.ts`):**
- Must follow AAA pattern
- Must mock external dependencies
- Must cover edge cases
- Must have descriptive names

---

**Last Updated:** 2025-10-20
**Maintained by:** Architecture Team
