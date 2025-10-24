# TASK-023 — Sistema de Webhooks para Notificações (Feature - Priority 2)

## Contexto
- Origem: Análise de arquitetura - Sistema 75% completo
- Resumo: Atualmente clientes precisam fazer polling (GET /v1/emails/:id) para verificar status de emails. Webhooks permitem notificação push em tempo real quando email é enviado, falha, ou recebe bounce/complaint.

## O que precisa ser feito
- [ ] Criar tabela `webhooks` no banco (URL, eventos, secret, status)
- [ ] Implementar CRUD de webhooks (POST/GET/DELETE /v1/webhooks)
- [ ] Criar worker dedicado para envio de webhooks
- [ ] Implementar retry com exponential backoff para webhooks falhados
- [ ] Adicionar assinatura HMAC-SHA256 para segurança
- [ ] Validar SSL dos endpoints (HTTPS obrigatório)
- [ ] Criar fila separada para webhooks (desacoplado de emails)
- [ ] Adicionar logs de webhook delivery (sucesso/falha)
- [ ] Implementar rate limiting por cliente
- [ ] Criar endpoint de teste (`POST /v1/webhooks/:id/test`)
- [ ] Documentar formato de payload e verificação de assinatura

## Urgência
- **Nível (1–5):** 3 (MODERADO - Nice to Have)

## Responsável sugerido
- Backend + API Design

## Dependências / Riscos
- Dependências:
  - BullMQ (já instalado)
  - Axios ou node-fetch para HTTP requests
  - crypto (built-in) para HMAC
- Riscos:
  - MÉDIO: Webhooks podem ser lentos (timeout de cliente)
  - Clientes com endpoints down podem encher DLQ
  - Necessita retry logic robusto
  - Segurança: validar que endpoint é legítimo

## Detalhes Técnicos

### 1. Criar migration para tabela de webhooks

**Arquivo:** `packages/database/prisma/migrations/YYYYMMDD_add_webhooks/migration.sql`

```sql
-- Create webhooks table
CREATE TABLE "webhooks" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "company_id" TEXT NOT NULL,
  "url" VARCHAR(2048) NOT NULL,
  "secret" VARCHAR(64) NOT NULL,
  "events" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "webhooks_company_id_fkey" FOREIGN KEY ("company_id")
    REFERENCES "companies"("id") ON DELETE CASCADE
);

CREATE INDEX "idx_webhooks_company_active" ON "webhooks"("company_id", "is_active");

-- Create webhook_deliveries table (logs)
CREATE TABLE "webhook_deliveries" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "webhook_id" TEXT NOT NULL,
  "event_type" VARCHAR(64) NOT NULL,
  "payload" JSONB NOT NULL,
  "status" VARCHAR(32) NOT NULL, -- 'pending', 'success', 'failed', 'retrying'
  "response_code" INTEGER,
  "response_body" TEXT,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "next_retry_at" TIMESTAMP(3),
  "delivered_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "webhook_deliveries_webhook_id_fkey" FOREIGN KEY ("webhook_id")
    REFERENCES "webhooks"("id") ON DELETE CASCADE
);

CREATE INDEX "idx_webhook_deliveries_webhook" ON "webhook_deliveries"("webhook_id", "created_at" DESC);
CREATE INDEX "idx_webhook_deliveries_status" ON "webhook_deliveries"("status", "next_retry_at");

COMMENT ON TABLE "webhooks" IS 'Webhook configurations for real-time event notifications';
COMMENT ON TABLE "webhook_deliveries" IS 'Webhook delivery attempts and logs';
```

**Atualizar schema.prisma:**

```prisma
model Webhook {
  id        String   @id @default(cuid())
  companyId String   @map("company_id")
  url       String   @db.VarChar(2048)
  secret    String   @db.VarChar(64)
  events    String[] @default([])
  isActive  Boolean  @default(true) @map("is_active")
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  company    Company             @relation(fields: [companyId], references: [id], onDelete: Cascade)
  deliveries WebhookDelivery[]

  @@index([companyId, isActive], map: "idx_webhooks_company_active")
  @@map("webhooks")
}

enum WebhookDeliveryStatus {
  PENDING
  SUCCESS
  FAILED
  RETRYING
}

model WebhookDelivery {
  id           String                @id @default(cuid())
  webhookId    String                @map("webhook_id")
  eventType    String                @map("event_type") @db.VarChar(64)
  payload      Json
  status       WebhookDeliveryStatus @default(PENDING)
  responseCode Int?                  @map("response_code")
  responseBody String?               @map("response_body") @db.Text
  attempts     Int                   @default(0)
  nextRetryAt  DateTime?             @map("next_retry_at")
  deliveredAt  DateTime?             @map("delivered_at")
  createdAt    DateTime              @default(now()) @map("created_at")

  webhook Webhook @relation(fields: [webhookId], references: [id], onDelete: Cascade)

  @@index([webhookId, createdAt(sort: Desc)], map: "idx_webhook_deliveries_webhook")
  @@index([status, nextRetryAt], map: "idx_webhook_deliveries_status")
  @@map("webhook_deliveries")
}
```

### 2. Criar API de gerenciamento de webhooks

**Arquivo:** `apps/api/src/modules/webhook/webhook.controller.ts`

```typescript
import { Controller, Get, Post, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { ApiKeyGuard } from '../auth/guards/api-key.guard';
import { CompanyId } from '../auth/decorators/company-id.decorator';
import { WebhookService } from './webhook.service';
import { CreateWebhookDto, WebhookEventType } from './dto/webhook.dto';

@Controller('v1/webhooks')
@UseGuards(ApiKeyGuard)
export class WebhookController {
  constructor(private readonly webhookService: WebhookService) {}

  /**
   * POST /v1/webhooks
   * Create a new webhook
   */
  @Post()
  async createWebhook(
    @CompanyId() companyId: string,
    @Body() dto: CreateWebhookDto
  ) {
    return this.webhookService.create(companyId, dto);
  }

  /**
   * GET /v1/webhooks
   * List all webhooks for company
   */
  @Get()
  async listWebhooks(@CompanyId() companyId: string) {
    return this.webhookService.findAll(companyId);
  }

  /**
   * GET /v1/webhooks/:id
   * Get webhook details
   */
  @Get(':id')
  async getWebhook(
    @CompanyId() companyId: string,
    @Param('id') webhookId: string
  ) {
    return this.webhookService.findOne(companyId, webhookId);
  }

  /**
   * DELETE /v1/webhooks/:id
   * Delete webhook
   */
  @Delete(':id')
  async deleteWebhook(
    @CompanyId() companyId: string,
    @Param('id') webhookId: string
  ) {
    await this.webhookService.delete(companyId, webhookId);
    return { message: 'Webhook deleted successfully' };
  }

  /**
   * POST /v1/webhooks/:id/test
   * Send test webhook
   */
  @Post(':id/test')
  async testWebhook(
    @CompanyId() companyId: string,
    @Param('id') webhookId: string
  ) {
    await this.webhookService.sendTestEvent(companyId, webhookId);
    return { message: 'Test webhook sent' };
  }

  /**
   * GET /v1/webhooks/:id/deliveries
   * Get webhook delivery logs
   */
  @Get(':id/deliveries')
  async getDeliveries(
    @CompanyId() companyId: string,
    @Param('id') webhookId: string
  ) {
    return this.webhookService.getDeliveries(companyId, webhookId);
  }
}
```

**Arquivo:** `apps/api/src/modules/webhook/dto/webhook.dto.ts`

```typescript
import { IsUrl, IsArray, IsEnum, IsNotEmpty } from 'class-validator';

export enum WebhookEventType {
  EMAIL_SENT = 'email.sent',
  EMAIL_FAILED = 'email.failed',
  EMAIL_BOUNCED = 'email.bounced',
  EMAIL_COMPLAINED = 'email.complained',
  EMAIL_DELIVERED = 'email.delivered',
}

export class CreateWebhookDto {
  @IsUrl({ protocols: ['https'], require_tld: true })
  url: string;

  @IsArray()
  @IsEnum(WebhookEventType, { each: true })
  @IsNotEmpty()
  events: WebhookEventType[];
}
```

### 3. Implementar serviço de webhooks

**Arquivo:** `apps/api/src/modules/webhook/webhook.service.ts`

```typescript
import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { prisma } from '@email-gateway/database';
import { randomBytes } from 'crypto';
import { WebhookQueueService } from './webhook-queue.service';

@Injectable()
export class WebhookService {
  constructor(private readonly webhookQueue: WebhookQueueService) {}

  async create(companyId: string, dto: CreateWebhookDto) {
    // Validate URL is HTTPS
    if (!dto.url.startsWith('https://')) {
      throw new BadRequestException('Webhook URL must use HTTPS');
    }

    // Generate secret for HMAC signing
    const secret = randomBytes(32).toString('hex');

    const webhook = await prisma.webhook.create({
      data: {
        companyId,
        url: dto.url,
        secret,
        events: dto.events,
        isActive: true,
      },
    });

    return {
      id: webhook.id,
      url: webhook.url,
      events: webhook.events,
      secret, // Return secret only on creation (store securely!)
      isActive: webhook.isActive,
      createdAt: webhook.createdAt,
    };
  }

  async findAll(companyId: string) {
    return prisma.webhook.findMany({
      where: { companyId },
      select: {
        id: true,
        url: true,
        events: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        // Do not return secret
      },
    });
  }

  async findOne(companyId: string, webhookId: string) {
    const webhook = await prisma.webhook.findFirst({
      where: { id: webhookId, companyId },
    });

    if (!webhook) {
      throw new NotFoundException('Webhook not found');
    }

    return {
      id: webhook.id,
      url: webhook.url,
      events: webhook.events,
      isActive: webhook.isActive,
      createdAt: webhook.createdAt,
    };
  }

  async delete(companyId: string, webhookId: string) {
    const webhook = await prisma.webhook.findFirst({
      where: { id: webhookId, companyId },
    });

    if (!webhook) {
      throw new NotFoundException('Webhook not found');
    }

    await prisma.webhook.delete({ where: { id: webhookId } });
  }

  async sendTestEvent(companyId: string, webhookId: string) {
    const webhook = await this.findOne(companyId, webhookId);

    await this.webhookQueue.enqueue({
      webhookId: webhook.id,
      eventType: 'webhook.test',
      payload: {
        type: 'webhook.test',
        timestamp: new Date().toISOString(),
        data: {
          message: 'This is a test webhook',
        },
      },
    });
  }

  async getDeliveries(companyId: string, webhookId: string, limit: number = 50) {
    // Verify webhook belongs to company
    await this.findOne(companyId, webhookId);

    return prisma.webhookDelivery.findMany({
      where: { webhookId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        eventType: true,
        status: true,
        responseCode: true,
        attempts: true,
        deliveredAt: true,
        createdAt: true,
      },
    });
  }

  /**
   * Trigger webhook for email event
   * Called by email service when email status changes
   */
  async triggerEmailEvent(
    companyId: string,
    eventType: WebhookEventType,
    emailData: any
  ) {
    const webhooks = await prisma.webhook.findMany({
      where: {
        companyId,
        isActive: true,
        events: { has: eventType },
      },
    });

    for (const webhook of webhooks) {
      await this.webhookQueue.enqueue({
        webhookId: webhook.id,
        eventType,
        payload: {
          type: eventType,
          timestamp: new Date().toISOString(),
          data: emailData,
        },
      });
    }
  }
}
```

### 4. Implementar worker de entrega de webhooks

**Arquivo:** `apps/worker/src/services/webhook-delivery.service.ts`

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { Worker, Job, Queue } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import { prisma } from '@email-gateway/database';
import axios from 'axios';
import { createHmac } from 'crypto';

interface WebhookJob {
  webhookId: string;
  eventType: string;
  payload: any;
}

@Injectable()
export class WebhookDeliveryService {
  private readonly logger = new Logger(WebhookDeliveryService.name);
  private worker: Worker;
  private queue: Queue;

  constructor(private readonly configService: ConfigService) {
    const redisConfig = {
      host: this.configService.get('REDIS_HOST'),
      port: this.configService.get('REDIS_PORT'),
    };

    this.queue = new Queue('webhook-delivery', { connection: redisConfig });

    this.worker = new Worker(
      'webhook-delivery',
      async (job: Job<WebhookJob>) => this.processWebhook(job),
      {
        connection: redisConfig,
        concurrency: 10, // 10 webhooks in parallel
        limiter: {
          max: 100, // Max 100 webhooks
          duration: 1000, // per second
        },
      }
    );

    this.worker.on('completed', (job) => {
      this.logger.log({ message: 'Webhook delivered', jobId: job.id });
    });

    this.worker.on('failed', (job, err) => {
      this.logger.error({
        message: 'Webhook delivery failed',
        jobId: job?.id,
        error: err.message,
      });
    });
  }

  async processWebhook(job: Job<WebhookJob>) {
    const { webhookId, eventType, payload } = job.data;

    // Get webhook config
    const webhook = await prisma.webhook.findUnique({
      where: { id: webhookId },
    });

    if (!webhook || !webhook.isActive) {
      this.logger.warn({ message: 'Webhook not active', webhookId });
      return;
    }

    // Create delivery record
    const delivery = await prisma.webhookDelivery.create({
      data: {
        webhookId,
        eventType,
        payload,
        status: 'PENDING',
      },
    });

    try {
      // Generate HMAC signature
      const signature = this.generateSignature(payload, webhook.secret);

      // Send HTTP POST
      const response = await axios.post(webhook.url, payload, {
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Signature': signature,
          'X-Webhook-Event': eventType,
          'User-Agent': 'EmailGateway-Webhook/1.0',
        },
        timeout: 30000, // 30s timeout
        validateStatus: (status) => status >= 200 && status < 300,
      });

      // Update delivery as success
      await prisma.webhookDelivery.update({
        where: { id: delivery.id },
        data: {
          status: 'SUCCESS',
          responseCode: response.status,
          responseBody: JSON.stringify(response.data).substring(0, 1000),
          attempts: job.attemptsMade + 1,
          deliveredAt: new Date(),
        },
      });

      this.logger.log({
        message: 'Webhook delivered successfully',
        webhookId,
        deliveryId: delivery.id,
        responseCode: response.status,
      });
    } catch (error) {
      // Classify errors as retryable or not
      const isRetryable =
        error.code === 'ECONNREFUSED' ||
        error.code === 'ETIMEDOUT' ||
        error.code === 'ENOTFOUND' ||
        (error.response?.status >= 500); // 5xx errors are retryable

      const isLastAttempt = job.attemptsMade >= 2; // 3 total attempts

      await prisma.webhookDelivery.update({
        where: { id: delivery.id },
        data: {
          status: isLastAttempt || !isRetryable ? 'FAILED' : 'RETRYING',
          responseCode: error.response?.status,
          responseBody: error.message.substring(0, 1000),
          attempts: job.attemptsMade + 1,
        },
      });

      // Only throw (trigger retry) if error is retryable and not last attempt
      if (isRetryable && !isLastAttempt) {
        throw error; // BullMQ will retry
      }

      // Non-retryable errors (4xx) don't throw - just log and mark as failed
      this.logger.warn({
        message: 'Webhook failed with non-retryable error',
        webhookId,
        responseCode: error.response?.status,
        error: error.message,
      });
    }
  }

  /**
   * Generate HMAC-SHA256 signature for webhook payload
   */
  private generateSignature(payload: any, secret: string): string {
    const payloadString = JSON.stringify(payload);
    return createHmac('sha256', secret).update(payloadString).digest('hex');
  }

  async enqueue(jobData: WebhookJob) {
    return this.queue.add('deliver', jobData, {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 5000, // 5s, 10s, 20s
      },
      removeOnComplete: true,
      removeOnFail: false, // Keep failed for investigation
    });
  }
}
```

### 5. Documentar verificação de assinatura

**Arquivo:** `docs/WEBHOOK-VERIFICATION.md`

```markdown
# Webhook Signature Verification

## Security

All webhooks are signed using HMAC-SHA256. You MUST verify the signature to ensure the webhook came from Email Gateway.

## Headers

```
X-Webhook-Signature: <hmac-sha256-hex>
X-Webhook-Event: email.sent
Content-Type: application/json
```

## Verification Example (Node.js)

```javascript
const crypto = require('crypto');

function verifyWebhookSignature(payload, signature, secret) {
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(JSON.stringify(payload))
    .digest('hex');

  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}

// Express middleware
app.post('/webhook', (req, res) => {
  const signature = req.headers['x-webhook-signature'];
  const secret = 'your-webhook-secret';

  if (!verifyWebhookSignature(req.body, signature, secret)) {
    return res.status(401).send('Invalid signature');
  }

  // Process webhook...
  res.status(200).send('OK');
});
```

## Payload Format

```json
{
  "type": "email.sent",
  "timestamp": "2025-10-24T12:34:56.789Z",
  "data": {
    "outboxId": "clx123abc",
    "to": "user@example.com",
    "subject": "Welcome",
    "status": "SENT",
    "sesMessageId": "01234567-89ab-cdef-0123-456789abcdef",
    "sentAt": "2025-10-24T12:34:56.789Z"
  }
}
```

## Event Types

- `email.sent` - Email successfully sent
- `email.failed` - Email permanently failed
- `email.bounced` - Email bounced (from SES)
- `email.complained` - Spam complaint (from SES)
- `email.delivered` - Email delivered (from SES)

## Best Practices

1. **Always verify signature** - Reject webhooks with invalid signature
2. **Use HTTPS** - Webhook URLs must be HTTPS
3. **Respond quickly** - Return 200 OK within 30s
4. **Process async** - Queue webhook for processing, don't block response
5. **Handle retries** - We retry 3 times with exponential backoff
```

## Categoria
**Feature - Integration**

## Bloqueador para Produção?
**NÃO - Nice to Have**

Sem webhooks:
- ⚠️ Clientes precisam fazer polling (ineficiente)
- ⚠️ Não há notificação em tempo real
- ⚠️ Maior carga na API (GET requests frequentes)

Com webhooks:
- ✅ Notificações push em tempo real
- ✅ Reduz carga de polling
- ✅ Melhor experiência do desenvolvedor
- ✅ Integração mais eficiente

**Recomendação:** Implementar após Priority 1 tasks.
