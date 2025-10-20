# TASK 8.2 - Complete Queue Integration (API → Worker)

**Priority:** HIGH
**Category:** Architecture / Integration
**Estimated Effort:** 3-4 hours
**Dependencies:** TASK 8.1 (should be completed first)

## Context

The API and Worker are both implemented, but they are **not connected**. The API writes to `email_outbox` but does NOT enqueue jobs to BullMQ. The Worker is ready to process jobs, but nothing is sending them.

## Current State

### What Works
- API receives requests and writes to `email_outbox` ✅
- Worker is configured to process jobs from BullMQ ✅
- Email pipeline states are implemented ✅
- SES integration is ready ✅

### What's Missing
- API does NOT add jobs to BullMQ queue ❌
- Email remains in `PENDING` status forever ❌
- Worker never receives jobs to process ❌

**Evidence:**
`apps/api/src/modules/email/services/email-send.service.ts` line 91-96:
```typescript
// TODO: Implementar integração com queue (BullMQ)
// Por enquanto, marca como ENQUEUED sem processar
// Em uma implementação completa, aqui seria feita a integração com BullMQ
// await this.queueService.enqueueEmailJob(jobId, outbox);

console.log(`📧 Email enqueued for processing: ${jobId}`);
```

## Implementation Plan

### Phase 1: Create Queue Service in API

Create `apps/api/src/modules/queue/queue.service.ts`:

```typescript
import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import Redis from 'ioredis';
import { EMAIL_JOB_CONFIG, EmailSendJobData } from '@email-gateway/shared';

@Injectable()
export class QueueService implements OnModuleInit, OnModuleDestroy {
  private queue: Queue;
  private redis: Redis;

  constructor(private configService: ConfigService) {}

  async onModuleInit() {
    // Initialize Redis connection
    this.redis = new Redis({
      host: this.configService.get('REDIS_HOST', 'localhost'),
      port: this.configService.get('REDIS_PORT', 6379),
      password: this.configService.get('REDIS_PASSWORD'),
      db: this.configService.get('REDIS_DB', 0),
      maxRetriesPerRequest: null, // Required for BullMQ
    });

    // Initialize BullMQ Queue
    this.queue = new Queue(EMAIL_JOB_CONFIG.QUEUE_NAME, {
      connection: this.redis,
      defaultJobOptions: {
        attempts: EMAIL_JOB_CONFIG.MAX_ATTEMPTS,
        backoff: {
          type: 'exponential',
          delay: EMAIL_JOB_CONFIG.BACKOFF_DELAYS[0],
        },
        removeOnComplete: {
          age: 24 * 3600, // Keep for 24h
          count: 1000,
        },
        removeOnFail: {
          age: 7 * 24 * 3600, // Keep failed for 7 days
        },
      },
    });

    console.log('[QueueService] Initialized with queue:', EMAIL_JOB_CONFIG.QUEUE_NAME);
  }

  async onModuleDestroy() {
    await this.queue.close();
    await this.redis.quit();
  }

  /**
   * Enqueue email send job
   */
  async enqueueEmailJob(jobData: EmailSendJobData): Promise<string> {
    const job = await this.queue.add(
      'send-email',
      jobData,
      {
        jobId: jobData.outboxId, // Use outboxId as jobId for idempotency
        priority: jobData.priority || 1,
      }
    );

    return job.id!;
  }

  /**
   * Get queue health metrics
   */
  async getQueueHealth() {
    const [waiting, active, completed, failed, delayed] = await Promise.all([
      this.queue.getWaitingCount(),
      this.queue.getActiveCount(),
      this.queue.getCompletedCount(),
      this.queue.getFailedCount(),
      this.queue.getDelayedCount(),
    ]);

    return {
      waiting,
      active,
      completed,
      failed,
      delayed,
      total: waiting + active + delayed,
    };
  }
}
```

### Phase 2: Create Queue Module

Create `apps/api/src/modules/queue/queue.module.ts`:

```typescript
import { Module, Global } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { QueueService } from './queue.service';

@Global() // Make it available everywhere
@Module({
  imports: [ConfigModule],
  providers: [QueueService],
  exports: [QueueService],
})
export class QueueModule {}
```

### Phase 3: Integrate in EmailSendService

Modify `apps/api/src/modules/email/services/email-send.service.ts`:

```typescript
import { QueueService } from '../../queue/queue.service';

@Injectable()
export class EmailSendService {
  constructor(private queueService: QueueService) {}

  async sendEmail(params: SendEmailParams): Promise<EmailSendResponse> {
    // ... existing code to create outbox ...

    // Build job data
    const jobData: EmailSendJobData = {
      outboxId,
      companyId,
      recipientId,
      to: body.to,
      cc: body.cc || [],
      bcc: body.bcc || [],
      subject: body.subject,
      replyTo: body.replyTo,
      headers: body.headers,
      tags: body.tags || [],
      requestId: requestId || this.generateRequestId(),
      attempt: 0,
      priority: body.priority || 1,
      recipient: {
        recipientId: recipientId || '',
        email: body.to,
        cpfCnpj: body.recipient?.cpfCnpj,
        nome: body.recipient?.nome,
        razaoSocial: body.recipient?.razaoSocial,
      },
    };

    // Enqueue job to BullMQ
    const jobId = await this.queueService.enqueueEmailJob(jobData);

    // Update outbox with jobId and ENQUEUED status
    await prisma.emailOutbox.update({
      where: { id: outboxId },
      data: {
        jobId,
        status: EmailStatus.ENQUEUED,
        enqueuedAt: new Date(),
      },
    });

    console.log(`✅ Email enqueued: outboxId=${outboxId}, jobId=${jobId}`);

    // Return response
    const response: EmailSendResponse = {
      outboxId,
      jobId,
      requestId: jobData.requestId,
      status: EmailStatus.ENQUEUED,
      receivedAt: receivedAt.toISOString(),
      recipient: body.recipient?.externalId ? {
        externalId: body.recipient.externalId,
      } : undefined,
    };

    return response;
  }
}
```

### Phase 4: Update AppModule

Modify `apps/api/src/app.module.ts`:

```typescript
import { QueueModule } from './modules/queue/queue.module';

@Module({
  imports: [
    // ... existing imports ...
    QueueModule, // Add this
    EmailModule,
    // ...
  ],
})
export class AppModule {}
```

### Phase 5: Add Dependencies

Update `apps/api/package.json`:

```json
{
  "dependencies": {
    "bullmq": "^5.0.0",
    "ioredis": "^5.8.1"
  }
}
```

## Implementation Checklist

### Code Changes
- [ ] Create `apps/api/src/modules/queue/queue.service.ts`
- [ ] Create `apps/api/src/modules/queue/queue.module.ts`
- [ ] Update `apps/api/src/modules/email/email.module.ts` to import QueueModule
- [ ] Update `apps/api/src/app.module.ts` to import QueueModule
- [ ] Modify `email-send.service.ts` to use QueueService
- [ ] Remove TODO comment and console.log placeholder
- [ ] Add proper error handling for queue failures

### Configuration
- [ ] Add BullMQ dependencies to `apps/api/package.json`
- [ ] Verify Redis connection settings in `.env`
- [ ] Add queue-related environment variables if needed

### Testing
- [ ] Unit test for QueueService
- [ ] Integration test: API → Queue → Worker flow
- [ ] Test queue failure scenarios (Redis down)
- [ ] Test job idempotency (same outboxId)
- [ ] Test concurrent requests

### Monitoring
- [ ] Add health check endpoint for queue status
- [ ] Log queue metrics on startup
- [ ] Add alerts for queue depth > threshold

## Files to Create/Modify

### Create
1. `apps/api/src/modules/queue/queue.service.ts` (150 lines)
2. `apps/api/src/modules/queue/queue.module.ts` (15 lines)
3. `apps/api/src/modules/queue/__tests__/queue.service.spec.ts` (100 lines)

### Modify
1. `apps/api/src/modules/email/services/email-send.service.ts`
   - Line 91-96: Replace TODO with actual queue integration
   - Add QueueService injection
   - Update outbox with jobId and ENQUEUED status

2. `apps/api/src/modules/email/email.module.ts`
   - Import QueueModule

3. `apps/api/src/app.module.ts`
   - Add QueueModule to imports

4. `apps/api/package.json`
   - Add `bullmq` and `ioredis` dependencies

## Testing Strategy

### Unit Tests
```typescript
describe('QueueService', () => {
  it('should enqueue job to BullMQ', async () => {
    const jobData = { /* ... */ };
    const jobId = await queueService.enqueueEmailJob(jobData);
    expect(jobId).toBeDefined();
  });

  it('should use outboxId as jobId', async () => {
    const jobData = { outboxId: 'test-123', /* ... */ };
    const jobId = await queueService.enqueueEmailJob(jobData);
    expect(jobId).toBe('test-123');
  });
});
```

### Integration Tests
```typescript
describe('Email Send Flow (E2E)', () => {
  it('should enqueue job when email is sent', async () => {
    // Send email via API
    const response = await request(app)
      .post('/v1/email/send')
      .send({ /* email data */ });

    // Verify outbox created
    const outbox = await prisma.emailOutbox.findUnique({
      where: { id: response.body.outboxId }
    });
    expect(outbox.status).toBe('ENQUEUED');
    expect(outbox.jobId).toBeDefined();

    // Verify job in queue
    const job = await queue.getJob(outbox.jobId);
    expect(job).toBeDefined();
    expect(job.data.outboxId).toBe(response.body.outboxId);
  });
});
```

## Error Handling

Handle these scenarios:
1. **Redis Connection Failure**: Fail fast, don't create outbox
2. **Queue Full**: Return 503 Service Unavailable
3. **Duplicate JobId**: Log warning, return existing outbox
4. **Worker Not Running**: Job waits in queue (acceptable)

Example error handling:
```typescript
try {
  const jobId = await this.queueService.enqueueEmailJob(jobData);
} catch (error) {
  // Rollback outbox creation
  await prisma.emailOutbox.delete({ where: { id: outboxId } });

  throw new InternalServerErrorException({
    error: {
      code: 'QUEUE_UNAVAILABLE',
      message: 'Unable to enqueue email for processing',
      requestId: requestId,
    }
  });
}
```

## Health Check Integration

Add queue health to existing health endpoint:

```typescript
@Get('health')
async getHealth() {
  const queueHealth = await this.queueService.getQueueHealth();

  return {
    status: 'ok',
    database: 'connected',
    redis: 'connected',
    queue: {
      waiting: queueHealth.waiting,
      active: queueHealth.active,
      failed: queueHealth.failed,
    }
  };
}
```

## Success Criteria

- [ ] API enqueues jobs to BullMQ after creating outbox
- [ ] Worker receives and processes jobs
- [ ] End-to-end flow works: Request → API → Queue → Worker → SES
- [ ] Outbox status transitions: PENDING → ENQUEUED → RECEIVED → SENT
- [ ] No more TODO comments in email-send.service.ts
- [ ] All tests pass
- [ ] Health check shows queue status

## Validation Commands

```bash
# 1. Start services
docker-compose up -d
npm run dev:api
npm run dev:worker

# 2. Send test email
curl -X POST http://localhost:3000/v1/email/send \
  -H "X-API-Key: <test-key>" \
  -H "Content-Type: application/json" \
  -d '{
    "to": "test@example.com",
    "subject": "Test",
    "html": "<p>Test</p>"
  }'

# 3. Check queue (Redis CLI)
redis-cli
> KEYS bull:email:send:*
> HGETALL bull:email:send:jobs:<job-id>

# 4. Check worker logs
# Should see: "Job received: <job-id>"

# 5. Check outbox status
# Should transition: PENDING → ENQUEUED → RECEIVED → SENT
```

## Related Tasks

- TASK 4.1 - Pipeline states (implemented, needs connection)
- TASK 4.2 - Concurrency and fairness (implemented, needs jobs)
- TASK 7.1 - Metrics (implemented, needs data)

## Documentation Updates

- `docs/api/03-email-send-contract.md` - Update flow diagram
- `docs/architecture/01-visao-geral-sistema.md` - Confirm queue integration
- `README.md` - Update setup instructions if needed
