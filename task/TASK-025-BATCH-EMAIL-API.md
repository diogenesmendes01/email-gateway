# TASK-025 — API de Envio em Lote (Feature - Priority 2)

## Contexto
- Origem: Análise de arquitetura - Sistema 75% completo
- Resumo: Atualmente apenas um email por request (POST /v1/email/send). Para campanhas com milhares de destinatários, clientes precisam fazer milhares de requests HTTP, causando sobrecarga na API e lentidão.

## O que precisa ser feito
- [ ] Criar endpoint `POST /v1/email/batch` para envio em lote
- [ ] Aceitar array de emails (até 1000 por batch)
- [ ] Validar todos os emails antes de processar (all-or-nothing ou best-effort)
- [ ] Processar batch de forma assíncrona (não bloquear response)
- [ ] Retornar batch ID para tracking
- [ ] Criar endpoint `GET /v1/email/batch/:batchId` para status
- [ ] Implementar rate limiting por batch (prevenir abuso)
- [ ] Adicionar CSV upload para bulk import
- [ ] Otimizar bulk insert no banco (Prisma createMany)
- [ ] Adicionar métricas de batch processing
- [ ] Documentar limits e best practices

## Urgência
- **Nível (1–5):** 3 (MODERADO - Performance)

## Responsável sugerido
- Backend + API Design

## Dependências / Riscos
- Dependências:
  - BullMQ (já instalado)
  - Prisma (já instalado)
  - csv-parser (para CSV upload)
- Riscos:
  - MÉDIO: Batches grandes podem sobrecarregar banco/fila
  - Validação de 1000 emails pode ser lenta (> 1s)
  - Memória: batch de 1000 emails com attachments = ~100MB
  - Rate limiting precisa ser por batch, não por email

## Detalhes Técnicos

### 1. Criar schema de batch

**Arquivo:** `packages/database/prisma/migrations/YYYYMMDD_add_email_batches/migration.sql`

```sql
-- Email Batch tracking
CREATE TABLE "email_batches" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "company_id" TEXT NOT NULL,
  "status" VARCHAR(32) NOT NULL DEFAULT 'PROCESSING', -- 'PROCESSING', 'COMPLETED', 'PARTIAL', 'FAILED'
  "total_emails" INTEGER NOT NULL,
  "processed_count" INTEGER NOT NULL DEFAULT 0,
  "success_count" INTEGER NOT NULL DEFAULT 0,
  "failed_count" INTEGER NOT NULL DEFAULT 0,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  "completed_at" TIMESTAMP(3),

  CONSTRAINT "email_batches_company_id_fkey" FOREIGN KEY ("company_id")
    REFERENCES "companies"("id") ON DELETE CASCADE
);

CREATE INDEX "idx_email_batches_company" ON "email_batches"("company_id", "created_at" DESC);
CREATE INDEX "idx_email_batches_status" ON "email_batches"("status", "created_at");

-- Link EmailOutbox to batch
ALTER TABLE "email_outbox" ADD COLUMN "batch_id" TEXT;
ALTER TABLE "email_outbox" ADD CONSTRAINT "email_outbox_batch_id_fkey"
  FOREIGN KEY ("batch_id") REFERENCES "email_batches"("id") ON DELETE SET NULL;

CREATE INDEX "idx_email_outbox_batch" ON "email_outbox"("batch_id");

COMMENT ON TABLE "email_batches" IS 'Tracking for bulk email campaigns';
```

**Atualizar schema.prisma:**

```prisma
enum BatchStatus {
  PROCESSING
  COMPLETED
  PARTIAL
  FAILED
}

model EmailBatch {
  id             String      @id @default(cuid())
  companyId      String      @map("company_id")
  status         BatchStatus @default(PROCESSING)
  totalEmails    Int         @map("total_emails")
  processedCount Int         @default(0) @map("processed_count")
  successCount   Int         @default(0) @map("success_count")
  failedCount    Int         @default(0) @map("failed_count")
  metadata       Json?
  createdAt      DateTime    @default(now()) @map("created_at")
  updatedAt      DateTime    @updatedAt @map("updated_at")
  completedAt    DateTime?   @map("completed_at")

  company Company       @relation(fields: [companyId], references: [id], onDelete: Cascade)
  emails  EmailOutbox[]

  @@index([companyId, createdAt(sort: Desc)], map: "idx_email_batches_company")
  @@index([status, createdAt], map: "idx_email_batches_status")
  @@map("email_batches")
}

// Update EmailOutbox model
model EmailOutbox {
  // ... existing fields
  batchId String? @map("batch_id")
  batch   EmailBatch? @relation(fields: [batchId], references: [id], onDelete: SetNull)

  @@index([batchId], map: "idx_email_outbox_batch")
}
```

### 2. Criar DTOs para batch

**Arquivo:** `apps/api/src/modules/email/dto/email-batch.dto.ts`

```typescript
import { Type } from 'class-transformer';
import {
  IsArray,
  ValidateNested,
  ArrayMaxSize,
  ArrayMinSize,
  IsEnum,
  IsOptional,
} from 'class-validator';
import { EmailSendDto } from './email-send.dto';

export class BatchEmailDto {
  @IsArray()
  @ArrayMinSize(1, { message: 'Batch must contain at least 1 email' })
  @ArrayMaxSize(1000, { message: 'Batch cannot exceed 1000 emails' })
  @ValidateNested({ each: true })
  @Type(() => EmailSendDto)
  emails: EmailSendDto[];

  @IsOptional()
  @IsEnum(['all_or_nothing', 'best_effort'])
  mode?: 'all_or_nothing' | 'best_effort' = 'best_effort';
}

export class BatchStatusResponseDto {
  batchId: string;
  status: string;
  totalEmails: number;
  processedCount: number;
  successCount: number;
  failedCount: number;
  progress: number; // 0-100
  createdAt: Date;
  completedAt?: Date;
}
```

### 3. Implementar controller de batch

**Arquivo:** `apps/api/src/modules/email/batch-email.controller.ts`

```typescript
import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  UseGuards,
  UploadedFile,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiKeyGuard } from '../auth/guards/api-key.guard';
import { CompanyId } from '../auth/decorators/company-id.decorator';
import { BatchEmailService } from './services/batch-email.service';
import { BatchEmailDto, BatchStatusResponseDto } from './dto/email-batch.dto';

@Controller('v1/email')
@UseGuards(ApiKeyGuard)
export class BatchEmailController {
  constructor(private readonly batchEmailService: BatchEmailService) {}

  /**
   * POST /v1/email/batch
   * Send batch of emails
   */
  @Post('batch')
  async sendBatch(
    @CompanyId() companyId: string,
    @Body() dto: BatchEmailDto
  ) {
    const batch = await this.batchEmailService.createBatch(companyId, dto);

    return {
      batchId: batch.id,
      status: batch.status,
      totalEmails: batch.totalEmails,
      message: 'Batch accepted for processing',
    };
  }

  /**
   * GET /v1/email/batch/:batchId
   * Get batch status
   */
  @Get('batch/:batchId')
  async getBatchStatus(
    @CompanyId() companyId: string,
    @Param('batchId') batchId: string
  ): Promise<BatchStatusResponseDto> {
    return this.batchEmailService.getBatchStatus(companyId, batchId);
  }

  /**
   * POST /v1/email/batch/csv
   * Upload CSV file for batch processing
   */
  @Post('batch/csv')
  @UseInterceptors(FileInterceptor('file'))
  async uploadCSV(
    @CompanyId() companyId: string,
    @UploadedFile() file: Express.Multer.File
  ) {
    if (!file) {
      throw new BadRequestException('CSV file is required');
    }

    if (file.mimetype !== 'text/csv') {
      throw new BadRequestException('File must be CSV format');
    }

    const batch = await this.batchEmailService.processCsvFile(companyId, file);

    return {
      batchId: batch.id,
      status: batch.status,
      totalEmails: batch.totalEmails,
      message: 'CSV uploaded and processing started',
    };
  }

  /**
   * GET /v1/email/batch/:batchId/emails
   * List emails in batch (with pagination)
   */
  @Get('batch/:batchId/emails')
  async getBatchEmails(
    @CompanyId() companyId: string,
    @Param('batchId') batchId: string
  ) {
    return this.batchEmailService.getBatchEmails(companyId, batchId);
  }
}
```

### 4. Implementar serviço de batch

**Arquivo:** `apps/api/src/modules/email/services/batch-email.service.ts`

```typescript
import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { prisma } from '@email-gateway/database';
import { BatchEmailDto, BatchStatusResponseDto } from '../dto/email-batch.dto';
import { EmailSendService } from './email-send.service';
import { QueueService } from '../../../queue/queue.service';
import * as csvParser from 'csv-parser';
import { Readable } from 'stream';

@Injectable()
export class BatchEmailService {
  private readonly logger = new Logger(BatchEmailService.name);

  constructor(
    private readonly emailSendService: EmailSendService,
    private readonly queueService: QueueService
  ) {}

  async createBatch(companyId: string, dto: BatchEmailDto) {
    const { emails, mode } = dto;

    this.logger.log({
      message: 'Creating email batch',
      companyId,
      totalEmails: emails.length,
      mode,
    });

    // Validate all emails first if mode is all_or_nothing
    if (mode === 'all_or_nothing') {
      await this.validateAllEmails(emails);
    }

    // Create batch record
    const batch = await prisma.emailBatch.create({
      data: {
        companyId,
        status: 'PROCESSING',
        totalEmails: emails.length,
        metadata: { mode },
      },
    });

    // Process batch asynchronously
    this.processBatchAsync(companyId, batch.id, emails, mode);

    return batch;
  }

  private async validateAllEmails(emails: any[]) {
    // Run validation on all emails
    // If any fails, throw error (all_or_nothing mode)
    const validationErrors: string[] = [];

    for (let i = 0; i < emails.length; i++) {
      try {
        // Basic validation
        if (!emails[i].to || !emails[i].subject || !emails[i].html) {
          validationErrors.push(`Email ${i}: Missing required fields`);
        }
      } catch (error) {
        validationErrors.push(`Email ${i}: ${error.message}`);
      }
    }

    if (validationErrors.length > 0) {
      throw new BadRequestException({
        message: 'Validation failed',
        errors: validationErrors,
      });
    }
  }

  private async processBatchAsync(
    companyId: string,
    batchId: string,
    emails: any[],
    mode: string
  ) {
    let successCount = 0;
    let failedCount = 0;

    // Use Prisma transaction for bulk insert
    const emailOutboxRecords = [];

    for (const email of emails) {
      try {
        // Create EmailOutbox record (no SES call yet)
        const outbox = await this.emailSendService.createOutboxRecord(
          companyId,
          email,
          batchId
        );

        emailOutboxRecords.push(outbox);

        // Add to queue for processing
        await this.queueService.addEmailJob({
          outboxId: outbox.id,
          to: outbox.to,
          subject: outbox.subject,
          html: outbox.html,
        });

        successCount++;
      } catch (error) {
        failedCount++;

        this.logger.error({
          message: 'Failed to add email to batch',
          batchId,
          email: email.to,
          error: error.message,
        });

        if (mode === 'all_or_nothing') {
          // Rollback: delete batch and all created records
          await this.rollbackBatch(batchId);
          throw error;
        }
      }

      // Update batch progress periodically
      if ((successCount + failedCount) % 100 === 0) {
        await prisma.emailBatch.update({
          where: { id: batchId },
          data: {
            processedCount: successCount + failedCount,
            successCount,
            failedCount,
          },
        });
      }
    }

    // Final update
    await prisma.emailBatch.update({
      where: { id: batchId },
      data: {
        status: failedCount === 0 ? 'COMPLETED' : failedCount < emails.length ? 'PARTIAL' : 'FAILED',
        processedCount: successCount + failedCount,
        successCount,
        failedCount,
        completedAt: new Date(),
      },
    });

    this.logger.log({
      message: 'Batch processing completed',
      batchId,
      successCount,
      failedCount,
      totalEmails: emails.length,
    });
  }

  private async rollbackBatch(batchId: string) {
    // Delete all emails created for this batch
    await prisma.emailOutbox.deleteMany({
      where: { batchId },
    });

    // Delete batch record
    await prisma.emailBatch.delete({
      where: { id: batchId },
    });

    this.logger.warn({
      message: 'Batch rolled back due to failure',
      batchId,
    });
  }

  async getBatchStatus(
    companyId: string,
    batchId: string
  ): Promise<BatchStatusResponseDto> {
    const batch = await prisma.emailBatch.findFirst({
      where: {
        id: batchId,
        companyId,
      },
    });

    if (!batch) {
      throw new NotFoundException('Batch not found');
    }

    const progress =
      batch.totalEmails > 0
        ? Math.round((batch.processedCount / batch.totalEmails) * 100)
        : 0;

    return {
      batchId: batch.id,
      status: batch.status,
      totalEmails: batch.totalEmails,
      processedCount: batch.processedCount,
      successCount: batch.successCount,
      failedCount: batch.failedCount,
      progress,
      createdAt: batch.createdAt,
      completedAt: batch.completedAt,
    };
  }

  async getBatchEmails(companyId: string, batchId: string, limit = 100) {
    // Verify batch belongs to company
    await this.getBatchStatus(companyId, batchId);

    return prisma.emailOutbox.findMany({
      where: { batchId },
      take: limit,
      select: {
        id: true,
        to: true,
        subject: true,
        status: true,
        createdAt: true,
        processedAt: true,
      },
    });
  }

  /**
   * Process CSV file for batch upload
   */
  async processCsvFile(companyId: string, file: Express.Multer.File) {
    const emails: any[] = [];

    // Parse CSV
    const stream = Readable.from(file.buffer.toString());

    return new Promise<any>((resolve, reject) => {
      stream
        .pipe(csvParser())
        .on('data', (row) => {
          // Expected CSV format:
          // to,subject,html,recipient_name,recipient_cpf
          emails.push({
            to: row.to,
            subject: row.subject,
            html: row.html,
            recipient: {
              email: row.to,
              nome: row.recipient_name,
              cpfCnpj: row.recipient_cpf,
            },
          });
        })
        .on('end', async () => {
          try {
            // Create batch with parsed emails
            const batch = await this.createBatch(companyId, {
              emails,
              mode: 'best_effort',
            });
            resolve(batch);
          } catch (error) {
            reject(error);
          }
        })
        .on('error', (error) => {
          reject(error);
        });
    });
  }
}
```

### 5. Otimizar bulk insert no EmailService

**Arquivo:** `apps/api/src/modules/email/services/email-send.service.ts` (adicionar)

```typescript
/**
 * Create EmailOutbox record without sending (for batch processing)
 */
async createOutboxRecord(companyId: string, emailDto: EmailSendDto, batchId?: string) {
  // Handle recipient (create/upsert)
  const recipient = await this.recipientService.upsertRecipient(
    companyId,
    emailDto.recipient || { email: emailDto.to }
  );

  // Create outbox record
  const outbox = await prisma.emailOutbox.create({
    data: {
      companyId,
      recipientId: recipient.id,
      batchId, // Link to batch if provided
      to: emailDto.to,
      cc: emailDto.cc || [],
      bcc: emailDto.bcc || [],
      subject: emailDto.subject,
      html: emailDto.html,
      replyTo: emailDto.replyTo,
      headers: emailDto.headers,
      tags: emailDto.tags || [],
      status: 'PENDING',
      externalId: emailDto.externalId,
    },
  });

  return outbox;
}
```

### 6. Adicionar rate limiting por batch

**Arquivo:** `apps/api/src/modules/email/guards/batch-rate-limit.guard.ts`

```typescript
import { Injectable, CanActivate, ExecutionContext, HttpException, HttpStatus } from '@nestjs/common';
import { prisma } from '@email-gateway/database';

@Injectable()
export class BatchRateLimitGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const companyId = request.companyId;

    // Check batches in last hour
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const recentBatches = await prisma.emailBatch.count({
      where: {
        companyId,
        createdAt: { gte: oneHourAgo },
      },
    });

    // Limit: 10 batches per hour
    if (recentBatches >= 10) {
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: 'Batch rate limit exceeded. Maximum 10 batches per hour.',
          retryAfter: 3600, // 1 hour
        },
        HttpStatus.TOO_MANY_REQUESTS
      );
    }

    return true;
  }
}
```

### 7. Documentar CSV format e limits

**Arquivo:** `docs/BATCH-EMAIL-API.md`

```markdown
# Batch Email API

## Endpoint

```http
POST /v1/email/batch
Content-Type: application/json
X-API-Key: your-api-key
```

## Request Body

```json
{
  "emails": [
    {
      "to": "user1@example.com",
      "subject": "Welcome!",
      "html": "<p>Hello user1</p>",
      "recipient": {
        "email": "user1@example.com",
        "nome": "User 1"
      }
    },
    {
      "to": "user2@example.com",
      "subject": "Welcome!",
      "html": "<p>Hello user2</p>"
    }
  ],
  "mode": "best_effort"
}
```

## Modes

- **best_effort** (default): Process all emails, skip failures
- **all_or_nothing**: Validate all emails first, rollback if any fails

## Limits

- **Max emails per batch**: 1000
- **Max batches per hour**: 10
- **Max batch size**: 10MB

## CSV Upload

```http
POST /v1/email/batch/csv
Content-Type: multipart/form-data
X-API-Key: your-api-key
```

### CSV Format

```csv
to,subject,html,recipient_name,recipient_cpf
user1@example.com,Welcome,<p>Hello</p>,John Doe,12345678901
user2@example.com,Welcome,<p>Hi</p>,Jane Smith,98765432100
```

## Track Batch Status

```http
GET /v1/email/batch/{batchId}
```

**Response:**

```json
{
  "batchId": "clx123abc",
  "status": "PROCESSING",
  "totalEmails": 1000,
  "processedCount": 750,
  "successCount": 745,
  "failedCount": 5,
  "progress": 75,
  "createdAt": "2025-10-24T12:00:00Z"
}
```

## Best Practices

1. **Use batch API for > 100 emails**
2. **Split large campaigns into multiple batches** (1000 emails each)
3. **Monitor batch status** using GET /batch/:batchId
4. **Handle partial failures** gracefully (best_effort mode)
5. **Use CSV upload** for very large campaigns (> 10k emails)
```

### 8. Adicionar métricas

```typescript
this.metricsService.recordBatchCreated(companyId, batch.totalEmails);
this.metricsService.recordBatchCompleted(companyId, successCount, failedCount);
```

## Categoria
**Feature - Performance + API**

## Bloqueador para Produção?
**NÃO - Nice to Have**

Sem batch API:
- ⚠️ Campanhas grandes requerem milhares de HTTP requests
- ⚠️ Sobrecarga na API (latência, rate limiting)
- ⚠️ Experiência ruim para clientes (lento)

Com batch API:
- ✅ 1 request para enviar 1000 emails
- ✅ Menor latência e overhead HTTP
- ✅ Melhor experiência do desenvolvedor
- ✅ Suporte a CSV para bulk import

**Recomendação:** Implementar após Priority 1 tasks, especialmente se clientes precisarem enviar > 1k emails/dia.

**Performance Gain:**
- Antes: 1000 emails = 1000 requests (~5-10 min)
- Depois: 1000 emails = 1 request (~30s)
