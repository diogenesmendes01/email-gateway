# TASK-024 — Processamento de Eventos SES (Feature - Priority 2)

## Contexto
- Origem: Análise de arquitetura - Sistema 75% completo
- Resumo: AWS SES envia notificações de bounces, complaints e deliveries via SNS/SQS, mas o sistema não processa esses eventos. Sem isso, impossível rastrear bounces (email inválido) e complaints (spam), prejudicando reputação do sender.

## O que precisa ser feito
- [ ] Configurar SNS Topic no AWS SES para eventos (bounces, complaints, deliveries)
- [ ] Criar SQS Queue para receber eventos do SNS
- [ ] Implementar worker para processar eventos SQS
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
  - AWS SQS Queue
  - AWS SDK (@aws-sdk/client-sqs)
- Riscos:
  - ALTO: Sem processar bounces/complaints, reputação degrada
  - AWS pode suspender conta se complaint rate > 0.5%
  - Hard bounces devem ser bloqueados permanentemente
  - Processar eventos com delay (SNS → SQS → Worker)

## Detalhes Técnicos

### 1. Configurar AWS SES Notifications (Terraform/CloudFormation)

**Arquivo:** `infrastructure/aws/ses-notifications.tf`

```hcl
# SNS Topic for SES events
resource "aws_sns_topic" "ses_events" {
  name = "email-gateway-ses-events"
}

# SQS Queue for processing events
resource "aws_sqs_queue" "ses_events" {
  name                      = "email-gateway-ses-events"
  visibility_timeout_seconds = 300  # 5 minutes
  message_retention_seconds  = 1209600  # 14 days
  receive_wait_time_seconds  = 20  # Long polling

  # Dead Letter Queue after 3 failures
  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.ses_events_dlq.arn
    maxReceiveCount     = 3
  })
}

resource "aws_sqs_queue" "ses_events_dlq" {
  name = "email-gateway-ses-events-dlq"
  message_retention_seconds = 1209600  # 14 days
}

# Subscribe SQS to SNS
resource "aws_sns_topic_subscription" "ses_to_sqs" {
  topic_arn = aws_sns_topic.ses_events.arn
  protocol  = "sqs"
  endpoint  = aws_sqs_queue.ses_events.arn
}

# SQS Policy to allow SNS
resource "aws_sqs_queue_policy" "ses_events" {
  queue_url = aws_sqs_queue.ses_events.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Principal = { Service = "sns.amazonaws.com" }
      Action = "sqs:SendMessage"
      Resource = aws_sqs_queue.ses_events.arn
      Condition = {
        ArnEquals = { "aws:SourceArn" = aws_sns_topic.ses_events.arn }
      }
    }]
  })
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

### 3. Implementar worker de processamento SES

**Arquivo:** `apps/worker/src/services/ses-event-processor.service.ts`

```typescript
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SQSClient, ReceiveMessageCommand, DeleteMessageCommand } from '@aws-sdk/client-sqs';
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
  private sqsClient: SQSClient;
  private queueUrl: string;
  private isProcessing = false;

  constructor(
    private readonly configService: ConfigService,
    private readonly metricsService: MetricsService
  ) {
    this.sqsClient = new SQSClient({
      region: this.configService.get('AWS_REGION'),
      credentials: {
        accessKeyId: this.configService.get('AWS_ACCESS_KEY_ID'),
        secretAccessKey: this.configService.get('AWS_SECRET_ACCESS_KEY'),
      },
    });

    this.queueUrl = this.configService.get('SES_EVENTS_QUEUE_URL');
  }

  async onModuleInit() {
    // Start polling SQS
    this.startPolling();
  }

  private startPolling() {
    if (this.isProcessing) return;
    this.isProcessing = true;

    // Poll every 5 seconds
    setInterval(async () => {
      try {
        await this.pollMessages();
      } catch (error) {
        this.logger.error({
          message: 'Error polling SQS',
          error: error.message,
        });
      }
    }, 5000);
  }

  private async pollMessages() {
    const command = new ReceiveMessageCommand({
      QueueUrl: this.queueUrl,
      MaxNumberOfMessages: 10, // Process up to 10 messages at once
      WaitTimeSeconds: 20, // Long polling
      VisibilityTimeout: 300, // 5 minutes to process
    });

    const response = await this.sqsClient.send(command);

    if (!response.Messages || response.Messages.length === 0) {
      return; // No messages
    }

    for (const message of response.Messages) {
      try {
        await this.processMessage(message);

        // Delete message after successful processing
        await this.sqsClient.send(
          new DeleteMessageCommand({
            QueueUrl: this.queueUrl,
            ReceiptHandle: message.ReceiptHandle,
          })
        );
      } catch (error) {
        this.logger.error({
          message: 'Failed to process SES event',
          messageId: message.MessageId,
          error: error.message,
        });
        // Message will return to queue after visibility timeout
      }
    }
  }

  private async processMessage(message: any) {
    // Parse SNS message
    const snsMessage = JSON.parse(message.Body);
    const sesEvent = JSON.parse(snsMessage.Message);

    this.logger.log({
      message: 'Processing SES event',
      eventType: sesEvent.eventType,
      sesMessageId: sesEvent.mail.messageId,
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

### 4. Validar email contra blocklist antes de enviar

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

### 5. Criar endpoint para listar eventos

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

### 6. Adicionar métricas e alertas

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
