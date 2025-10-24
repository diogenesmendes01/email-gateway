# TASK-024 — Processamento de Eventos SES via Webhook (Feature - Priority 2)

## Contexto
- Origem: Análise de arquitetura - Sistema 75% completo
- Resumo: AWS SES envia notificações de bounces, complaints e deliveries, mas o sistema não processa esses eventos. Sem isso, impossível rastrear bounces (email inválido) e complaints (spam), prejudicando reputação do sender.
- **Arquitetura:** Usar BullMQ/Redis (não SNS/SQS) conforme definido no README.md

## O que precisa ser feito
- [ ] Configurar SNS Topic no AWS SES para eventos (bounces, complaints, deliveries)
- [ ] Criar endpoint POST /webhooks/ses para receber notificações SNS
- [ ] Validar assinatura SNS (segurança)
- [ ] Enfileirar eventos SES no BullMQ
- [ ] Implementar worker para processar eventos da fila
- [ ] Atualizar EmailLog com eventos SES (bounce_type, complaint_feedback)
- [ ] Criar tabela `recipient_blocklist` para emails bounced/complained
- [ ] Implementar lógica de bloqueio automático (hard bounce, complaint)
- [ ] Adicionar métricas Prometheus (bounce_rate, complaint_rate)
- [ ] Criar alertas para taxa de bounce/complaint alta (> 5%)
- [ ] Documentar tipos de bounce (hard, soft, transient)
- [ ] Implementar endpoint GET /v1/emails/:id/events

## Urgência
- **Nível (1–5):** 4 (ALTO - Reputação de Sender)

## Responsável sugerido
- Backend + DevOps (AWS)

## Dependências / Riscos
- Dependências:
  - AWS SES configurado
  - AWS SNS Topic
  - BullMQ (já instalado)
  - Redis (já instalado)
  - AWS SDK (@aws-sdk/client-sns) para validação de assinatura
- Riscos:
  - ALTO: Sem processar bounces/complaints, reputação degrada
  - AWS pode suspender conta se complaint rate > 0.5%
  - Hard bounces devem ser bloqueados permanentemente
  - Endpoint webhook precisa ser HTTPS e público

## Detalhes Técnicos

### 1. Configurar AWS SES Notifications (Terraform)

**Arquivo:** `infrastructure/aws/ses-notifications.tf`

```hcl
# SNS Topic for SES events
resource "aws_sns_topic" "ses_events" {
  name = "email-gateway-ses-events"
}

# SNS Subscription to webhook endpoint
resource "aws_sns_topic_subscription" "ses_to_webhook" {
  topic_arn = aws_sns_topic.ses_events.arn
  protocol  = "https"
  endpoint  = "https://your-domain.com/webhooks/ses"
}

# Configure SES to send events to SNS
resource "aws_ses_configuration_set" "main" {
  name = "email-gateway-main"
}

resource "aws_ses_event_destination" "bounces_complaints" {
  name                   = "bounces-complaints-deliveries"
  configuration_set_name = aws_ses_configuration_set.main.name
  enabled                = true
  matching_types         = ["bounce", "complaint", "delivery"]

  sns_destination {
    topic_arn = aws_sns_topic.ses_events.arn
  }
}
```

### 2. Criar migration para blocklist

**Arquivo:** `packages/database/prisma/migrations/YYYYMMDD_add_recipient_blocklist/migration.sql`

```sql
-- Recipient Blocklist (bounced/complained emails)
CREATE TABLE "recipient_blocklist" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "company_id" TEXT NOT NULL,
  "email" VARCHAR(254) NOT NULL,
  "reason" VARCHAR(32) NOT NULL, -- 'hard_bounce', 'soft_bounce', 'complaint'
  "bounce_type" VARCHAR(32), -- 'Permanent', 'Temporary', 'Transient'
  "bounce_subtype" VARCHAR(64),
  "ses_message_id" VARCHAR(128),
  "blocked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "metadata" JSONB,

  CONSTRAINT "recipient_blocklist_company_id_fkey" FOREIGN KEY ("company_id")
    REFERENCES "companies"("id") ON DELETE CASCADE
);

CREATE UNIQUE INDEX "idx_blocklist_company_email" ON "recipient_blocklist"("company_id", "email");
CREATE INDEX "idx_blocklist_reason" ON "recipient_blocklist"("reason", "blocked_at");

COMMENT ON TABLE "recipient_blocklist" IS 'Emails blocked due to hard bounces or spam complaints';

-- Add SES event fields to EmailLog
ALTER TABLE "email_logs" ADD COLUMN "bounce_type" VARCHAR(32);
ALTER TABLE "email_logs" ADD COLUMN "bounce_subtype" VARCHAR(64);
ALTER TABLE "email_logs" ADD COLUMN "complaint_feedback_type" VARCHAR(64);
ALTER TABLE "email_logs" ADD COLUMN "delivery_timestamp" TIMESTAMP(3);
```

**Atualizar schema.prisma:**

```prisma
model RecipientBlocklist {
  id             String   @id @default(cuid())
  companyId      String   @map("company_id")
  email          String   @db.VarChar(254)
  reason         String   @db.VarChar(32) // 'hard_bounce', 'soft_bounce', 'complaint'
  bounceType     String?  @map("bounce_type") @db.VarChar(32)
  bounceSubtype  String?  @map("bounce_subtype") @db.VarChar(64)
  sesMessageId   String?  @map("ses_message_id") @db.VarChar(128)
  blockedAt      DateTime @default(now()) @map("blocked_at")
  metadata       Json?

  company Company @relation(fields: [companyId], references: [id], onDelete: Cascade)

  @@unique([companyId, email], map: "idx_blocklist_company_email")
  @@index([reason, blockedAt], map: "idx_blocklist_reason")
  @@map("recipient_blocklist")
}

// Update EmailLog model
model EmailLog {
  // ... existing fields
  bounceType            String?   @map("bounce_type") @db.VarChar(32)
  bounceSubtype         String?   @map("bounce_subtype") @db.VarChar(64)
  complaintFeedbackType String?   @map("complaint_feedback_type") @db.VarChar(64)
  deliveryTimestamp     DateTime? @map("delivery_timestamp")
}
```

### 3. Criar endpoint webhook para receber SNS

**Arquivo:** `apps/api/src/modules/webhook/ses-webhook.controller.ts`

```typescript
import { Controller, Post, Body, Headers, BadRequestException, Logger } from '@nestjs/common';
import { SESWebhookService } from './ses-webhook.service';

@Controller('webhooks/ses')
export class SESWebhookController {
  private readonly logger = new Logger(SESWebhookController.name);

  constructor(private readonly sesWebhookService: SESWebhookService) {}

  /**
   * POST /webhooks/ses
   * Receive SNS notifications from AWS SES
   */
  @Post()
  async handleSNSNotification(
    @Body() body: any,
    @Headers('x-amz-sns-message-type') messageType: string
  ) {
    this.logger.log({
      message: 'Received SNS notification',
      messageType,
    });

    // Handle SNS subscription confirmation
    if (messageType === 'SubscriptionConfirmation') {
      await this.sesWebhookService.confirmSubscription(body);
      return { message: 'Subscription confirmed' };
    }

    // Handle SNS notification
    if (messageType === 'Notification') {
      // Validate SNS signature
      const isValid = await this.sesWebhookService.validateSNSSignature(body);
      if (!isValid) {
        throw new BadRequestException('Invalid SNS signature');
      }

      // Parse and enqueue SES event
      await this.sesWebhookService.processSNSNotification(body);
      return { message: 'Event queued for processing' };
    }

    throw new BadRequestException('Unknown SNS message type');
  }
}
```

**Arquivo:** `apps/api/src/modules/webhook/ses-webhook.service.ts`

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import axios from 'axios';
import * as crypto from 'crypto';

@Injectable()
export class SESWebhookService {
  private readonly logger = new Logger(SESWebhookService.name);
  private sesEventsQueue: Queue;

  constructor(private readonly configService: ConfigService) {
    // Initialize BullMQ queue for SES events
    this.sesEventsQueue = new Queue('ses-events', {
      connection: {
        host: this.configService.get('REDIS_HOST'),
        port: this.configService.get('REDIS_PORT'),
      },
    });
  }

  /**
   * Confirm SNS subscription (one-time setup)
   */
  async confirmSubscription(snsMessage: any) {
    const subscribeUrl = snsMessage.SubscribeURL;

    this.logger.log({
      message: 'Confirming SNS subscription',
      subscribeUrl,
    });

    // Call AWS subscribe URL to confirm
    await axios.get(subscribeUrl);

    this.logger.log('SNS subscription confirmed');
  }

  /**
   * Validate SNS message signature
   * https://docs.aws.amazon.com/sns/latest/dg/sns-verify-signature-of-message.html
   */
  async validateSNSSignature(snsMessage: any): Promise<boolean> {
    try {
      const {
        SignatureVersion,
        Signature,
        SigningCertURL,
        Message,
        MessageId,
        Subject,
        Timestamp,
        TopicArn,
        Type,
      } = snsMessage;

      // Only support v1 signatures
      if (SignatureVersion !== '1') {
        return false;
      }

      // Download signing certificate
      const certResponse = await axios.get(SigningCertURL);
      const certificate = certResponse.data;

      // Build string to sign
      const stringToSign = Type === 'Notification'
        ? [
            'Message',
            Message,
            'MessageId',
            MessageId,
            Subject ? 'Subject' : null,
            Subject,
            'Timestamp',
            Timestamp,
            'TopicArn',
            TopicArn,
            'Type',
            Type,
          ].filter(Boolean).join('\n') + '\n'
        : [
            'Message',
            Message,
            'MessageId',
            MessageId,
            'SubscribeURL',
            snsMessage.SubscribeURL,
            'Timestamp',
            Timestamp,
            'Token',
            snsMessage.Token,
            'TopicArn',
            TopicArn,
            'Type',
            Type,
          ].join('\n') + '\n';

      // Verify signature
      const verifier = crypto.createVerify('RSA-SHA1');
      verifier.update(stringToSign);
      return verifier.verify(certificate, Signature, 'base64');
    } catch (error) {
      this.logger.error({
        message: 'Failed to validate SNS signature',
        error: error.message,
      });
      return false;
    }
  }

  /**
   * Process SNS notification and enqueue to BullMQ
   */
  async processSNSNotification(snsMessage: any) {
    // Parse SES event from SNS message
    const sesEvent = JSON.parse(snsMessage.Message);

    this.logger.log({
      message: 'Processing SES event',
      eventType: sesEvent.eventType,
      sesMessageId: sesEvent.mail?.messageId,
    });

    // Add to BullMQ queue for processing
    await this.sesEventsQueue.add('process-ses-event', sesEvent, {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 5000,
      },
      removeOnComplete: true,
      removeOnFail: false,
    });

    this.logger.log({
      message: 'SES event enqueued',
      eventType: sesEvent.eventType,
    });
  }
}
```

### 4. Implementar worker para processar eventos

**Arquivo:** `apps/worker/src/services/ses-event-processor.service.ts`

```typescript
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Worker, Job } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import { prisma } from '@email-gateway/database';
import { MetricsService } from '../metrics/metrics.service';

interface SESBounceEvent {
  eventType: 'Bounce';
  bounce: {
    bounceType: 'Permanent' | 'Temporary' | 'Transient';
    bounceSubType: string;
    bouncedRecipients: Array<{
      emailAddress: string;
      status: string;
      diagnosticCode?: string;
    }>;
    timestamp: string;
  };
  mail: {
    messageId: string;
    timestamp: string;
  };
}

interface SESComplaintEvent {
  eventType: 'Complaint';
  complaint: {
    complainedRecipients: Array<{
      emailAddress: string;
    }>;
    timestamp: string;
    feedbackType?: string;
  };
  mail: {
    messageId: string;
  };
}

interface SESDeliveryEvent {
  eventType: 'Delivery';
  delivery: {
    timestamp: string;
    recipients: string[];
    processingTimeMillis: number;
  };
  mail: {
    messageId: string;
  };
}

@Injectable()
export class SESEventProcessorService implements OnModuleInit {
  private readonly logger = new Logger(SESEventProcessorService.name);
  private worker: Worker;

  constructor(
    private readonly configService: ConfigService,
    private readonly metricsService: MetricsService
  ) {}

  async onModuleInit() {
    // Create BullMQ worker for SES events
    this.worker = new Worker(
      'ses-events',
      async (job: Job) => this.processEvent(job),
      {
        connection: {
          host: this.configService.get('REDIS_HOST'),
          port: this.configService.get('REDIS_PORT'),
        },
        concurrency: 10,
      }
    );

    this.worker.on('completed', (job) => {
      this.logger.log({ message: 'SES event processed', jobId: job.id });
    });

    this.worker.on('failed', (job, err) => {
      this.logger.error({
        message: 'SES event processing failed',
        jobId: job?.id,
        error: err.message,
      });
    });
  }

  async onModuleDestroy() {
    await this.worker?.close();
  }

  private async processEvent(job: Job) {
    const sesEvent = job.data;

    this.logger.log({
      message: 'Processing SES event',
      eventType: sesEvent.eventType,
      sesMessageId: sesEvent.mail?.messageId,
    });

    switch (sesEvent.eventType) {
      case 'Bounce':
        await this.processBounce(sesEvent as SESBounceEvent);
        break;
      case 'Complaint':
        await this.processComplaint(sesEvent as SESComplaintEvent);
        break;
      case 'Delivery':
        await this.processDelivery(sesEvent as SESDeliveryEvent);
        break;
      default:
        this.logger.warn({ message: 'Unknown event type', eventType: sesEvent.eventType });
    }
  }

  private async processBounce(event: SESBounceEvent) {
    const { bounceType, bounceSubType, bouncedRecipients } = event.bounce;
    const { messageId } = event.mail;

    // Find EmailLog by SES Message ID
    const emailLog = await prisma.emailLog.findUnique({
      where: { sesMessageId: messageId },
      include: { company: true },
    });

    if (!emailLog) {
      this.logger.warn({ message: 'EmailLog not found for bounce', messageId });
      return;
    }

    // Update EmailLog with bounce info
    await prisma.emailLog.update({
      where: { id: emailLog.id },
      data: {
        bounceType,
        bounceSubtype: bounceSubType,
      },
    });

    // Create EmailEvent
    await prisma.emailEvent.create({
      data: {
        emailLogId: emailLog.id,
        type: 'BOUNCED',
        metadata: {
          bounceType,
          bounceSubType,
          bouncedRecipients,
        },
      },
    });

    // Hard bounce = permanent failure, add to blocklist
    if (bounceType === 'Permanent') {
      for (const recipient of bouncedRecipients) {
        await prisma.recipientBlocklist.upsert({
          where: {
            companyId_email: {
              companyId: emailLog.companyId,
              email: recipient.emailAddress,
            },
          },
          create: {
            companyId: emailLog.companyId,
            email: recipient.emailAddress,
            reason: 'hard_bounce',
            bounceType,
            bounceSubtype: bounceSubType,
            sesMessageId: messageId,
            metadata: {
              status: recipient.status,
              diagnosticCode: recipient.diagnosticCode,
            },
          },
          update: {
            reason: 'hard_bounce',
            bounceType,
            bounceSubtype: bounceSubType,
            metadata: {
              status: recipient.status,
              diagnosticCode: recipient.diagnosticCode,
            },
          },
        });

        this.logger.warn({
          message: 'Email added to blocklist (hard bounce)',
          email: recipient.emailAddress,
          companyId: emailLog.companyId,
        });
      }
    }

    // Update metrics
    this.metricsService.recordBounce(emailLog.companyId, bounceType);

    this.logger.log({
      message: 'Bounce processed',
      bounceType,
      recipients: bouncedRecipients.length,
    });
  }

  private async processComplaint(event: SESComplaintEvent) {
    const { complainedRecipients, feedbackType } = event.complaint;
    const { messageId } = event.mail;

    const emailLog = await prisma.emailLog.findUnique({
      where: { sesMessageId: messageId },
    });

    if (!emailLog) {
      this.logger.warn({ message: 'EmailLog not found for complaint', messageId });
      return;
    }

    // Update EmailLog
    await prisma.emailLog.update({
      where: { id: emailLog.id },
      data: {
        complaintFeedbackType: feedbackType,
      },
    });

    // Create EmailEvent
    await prisma.emailEvent.create({
      data: {
        emailLogId: emailLog.id,
        type: 'COMPLAINED',
        metadata: {
          complainedRecipients,
          feedbackType,
        },
      },
    });

    // Add to blocklist (CRITICAL - prevent spam reputation damage)
    for (const recipient of complainedRecipients) {
      await prisma.recipientBlocklist.upsert({
        where: {
          companyId_email: {
            companyId: emailLog.companyId,
            email: recipient.emailAddress,
          },
        },
        create: {
          companyId: emailLog.companyId,
          email: recipient.emailAddress,
          reason: 'complaint',
          sesMessageId: messageId,
          metadata: { feedbackType },
        },
        update: {
          reason: 'complaint',
          metadata: { feedbackType },
        },
      });

      this.logger.error({
        message: '🚨 SPAM COMPLAINT - Email added to blocklist',
        email: recipient.emailAddress,
        companyId: emailLog.companyId,
        feedbackType,
      });
    }

    // Update metrics
    this.metricsService.recordComplaint(emailLog.companyId);

    this.logger.log({
      message: 'Complaint processed',
      recipients: complainedRecipients.length,
    });
  }

  private async processDelivery(event: SESDeliveryEvent) {
    const { recipients, timestamp, processingTimeMillis } = event.delivery;
    const { messageId } = event.mail;

    const emailLog = await prisma.emailLog.findUnique({
      where: { sesMessageId: messageId },
    });

    if (!emailLog) {
      return; // Already processed or not in our system
    }

    // Update EmailLog
    await prisma.emailLog.update({
      where: { id: emailLog.id },
      data: {
        deliveryTimestamp: new Date(timestamp),
      },
    });

    // Create EmailEvent
    await prisma.emailEvent.create({
      data: {
        emailLogId: emailLog.id,
        type: 'DELIVERED',
        metadata: {
          recipients,
          processingTimeMillis,
        },
      },
    });

    this.logger.log({
      message: 'Delivery processed',
      recipients: recipients.length,
      processingTimeMs: processingTimeMillis,
    });
  }
}
```

### 5. Validar email contra blocklist antes de enviar

**Arquivo:** `apps/api/src/modules/email/services/email-send.service.ts` (adicionar)

```typescript
async sendEmail(data: EmailSendDto, companyId: string) {
  // Check if recipient is in blocklist
  const blocked = await prisma.recipientBlocklist.findUnique({
    where: {
      companyId_email: {
        companyId,
        email: data.to,
      },
    },
  });

  if (blocked) {
    throw new BadRequestException(
      `Recipient blocked due to ${blocked.reason}. Remove from blocklist to retry.`
    );
  }

  // ... rest of email sending logic
}
```

### 6. Criar endpoint para listar eventos

**Arquivo:** `apps/api/src/modules/email/email.controller.ts` (adicionar)

```typescript
@Get(':id/events')
async getEmailEvents(
  @CompanyId() companyId: string,
  @Param('id') outboxId: string
) {
  const emailLog = await prisma.emailLog.findFirst({
    where: {
      outboxId,
      companyId,
    },
    include: {
      events: {
        orderBy: { createdAt: 'asc' },
      },
    },
  });

  if (!emailLog) {
    throw new NotFoundException('Email not found');
  }

  return {
    outboxId,
    status: emailLog.status,
    events: emailLog.events,
  };
}
```

### 7. Adicionar métricas e alertas

**Prometheus metrics:**

```typescript
this.metricsService.recordBounce(companyId, bounceType);
this.metricsService.recordComplaint(companyId);
```

**Alertas:**

```yaml
- alert: HighBounceRate
  expr: rate(email_bounced_total[1h]) / rate(email_sent_total[1h]) > 0.05
  for: 30m
  labels:
    severity: warning
  annotations:
    summary: "Bounce rate > 5%"

- alert: ComplaintRateCritical
  expr: rate(email_complaint_total[1h]) / rate(email_sent_total[1h]) > 0.005
  for: 15m
  labels:
    severity: critical
  annotations:
    summary: "🚨 Complaint rate > 0.5% - AWS may suspend account!"
```

## Categoria
**Feature - AWS Integration + Compliance**

## Bloqueador para Produção?
**SIM - ALTO RISCO**

Sem processar eventos SES:
- ❌ Hard bounces continuam recebendo emails (desperdício)
- ❌ Spam complaints não são rastreados (risco de suspensão AWS)
- ❌ Impossível detectar problemas de deliverability
- ❌ Reputação de sender degrada silenciosamente

**AWS SES Penalties:**
- Bounce rate > 10% = Warning
- Complaint rate > 0.5% = Account suspension risk

**Prioridade Alta:** Implementar após Priority 1 tasks, mas antes de escalar volume.

## Diferença vs. Versão Anterior

Esta versão **redesigned** usa BullMQ/Redis em vez de SQS:
- SNS → Webhook HTTP → BullMQ → Worker
- Mantém infraestrutura consistente com o resto do sistema
- Elimina dependência de mais um serviço AWS (SQS)
- Segue arquitetura definida no README.md
