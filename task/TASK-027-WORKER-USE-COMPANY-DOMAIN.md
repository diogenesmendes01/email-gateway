# TASK-027 — Worker Usar Domínio da Empresa (Feature - Priority 1)

## Contexto
- Origem: MULTI_TENANT_PLAN.md - Sprint 1
- Dependências: TASK-026 (schema multi-tenant)
- Resumo: Atualmente o worker usa sempre `SES_FROM_ADDRESS` global. Precisa buscar o domínio configurado da Company e usar como remetente, validando se está verificado.

## O que precisa ser feito
- [ ] Modificar `ses.service.ts` para aceitar fromAddress dinâmico
- [ ] Adicionar busca de Company com Domain no processor
- [ ] Validar se domínio está VERIFIED antes de usar
- [ ] Formatar Source com nome opcional (From Name <email@domain.com>)
- [ ] Fallback para SES_FROM_ADDRESS global se não configurado
- [ ] Logar avisos quando domínio não verificado
- [ ] Adicionar testes unitários
- [ ] Adicionar testes E2E

## Urgência
- **Nível (1–5):** 5 (CRÍTICO - Core do multi-tenant)

## Responsável sugerido
- Backend (Worker)

## Dependências / Riscos
- Dependências:
  - TASK-026 concluída (campos na Company)
  - Prisma Client atualizado
- Riscos:
  - MÉDIO: Query adicional pode aumentar latência (~10-20ms)
  - BAIXO: Domínio não verificado → usar fallback

## Detalhes Técnicos

### 1. Modificar SESService para aceitar fromAddress dinâmico

**Arquivo:** `apps/worker/src/services/ses.service.ts`

**Modificação na linha 133-180:**

```typescript
/**
 * Internal method to send email via AWS SES
 * TASK-027: Use company's verified domain
 */
private async sendEmailInternal(
  jobData: EmailSendJobData,
  htmlContent: string,
): Promise<SESSendResult> {
  try {
    // Chaos flag: SIMULAR SES 429/THROTTLING
    if (process.env.CHAOS_SES_429 === 'true') {
      throw new Error('Throttling: Simulated SES 429');
    }

    // TASK-027: Buscar Company com domínio verificado
    const company = await prisma.company.findUnique({
      where: { id: jobData.companyId },
      select: {
        id: true,
        name: true,
        defaultFromAddress: true,
        defaultFromName: true,
        domainId: true,
        isSuspended: true,
        defaultDomain: {
          select: {
            id: true,
            domain: true,
            status: true,
          },
        },
      },
    });

    if (!company) {
      throw new Error(`Company ${jobData.companyId} not found`);
    }

    // TASK-027: Verificar se empresa está suspensa
    if (company.isSuspended) {
      throw new Error(`Company ${company.id} is suspended. Cannot send emails.`);
    }

    // TASK-027: Determinar fromAddress e fromName
    let fromAddress = this.config.fromAddress; // Fallback global
    let fromName: string | undefined;

    if (company.defaultFromAddress && company.defaultDomain) {
      // Validar se domínio está verificado
      if (company.defaultDomain.status === 'VERIFIED') {
        fromAddress = company.defaultFromAddress;
        fromName = company.defaultFromName || undefined;

        console.log({
          message: 'Using company verified domain',
          companyId: company.id,
          domain: company.defaultDomain.domain,
          fromAddress,
        });
      } else {
        console.warn({
          message: 'Company domain not verified, using global address',
          companyId: company.id,
          domainStatus: company.defaultDomain.status,
          fallbackAddress: fromAddress,
        });
      }
    } else {
      console.log({
        message: 'Company has no default domain, using global address',
        companyId: company.id,
        fallbackAddress: fromAddress,
      });
    }

    // TASK-027: Formatar Source com nome (RFC 5322)
    // Formato: "Display Name <email@domain.com>"
    const source = fromName
      ? `${fromName} <${fromAddress}>`
      : fromAddress;

    // Prepara os parâmetros do comando
    const command = new SendEmailCommand({
      Source: source, // MODIFICADO: era this.config.fromAddress
      Destination: {
        ToAddresses: [jobData.to],
        CcAddresses: jobData.cc || [],
        BccAddresses: jobData.bcc || [],
      },
      Message: {
        Subject: {
          Data: jobData.subject,
          Charset: 'UTF-8',
        },
        Body: {
          Html: {
            Data: htmlContent,
            Charset: 'UTF-8',
          },
        },
      },
      ReplyToAddresses: jobData.replyTo
        ? [jobData.replyTo]
        : this.config.replyToAddress
          ? [this.config.replyToAddress]
          : undefined,
      ConfigurationSetName: this.config.configurationSetName,
      Tags: this.buildTags(jobData),
    });

    // Envia email (circuit breaker handles timeout)
    const response = await this.client.send(command);

    // Verifica resposta
    if (!response || !('MessageId' in response)) {
      throw new Error('SES request failed - no MessageId returned');
    }

    return {
      success: true,
      messageId: response.MessageId,
    };
  } catch (error) {
    // Mapeia o erro para nossa taxonomia
    const mappedError = ErrorMappingService.mapSESError(error);

    // TASK-009: Throw retryable errors so circuit breaker can detect failures
    // Non-retryable errors are returned as failed results
    if (mappedError.retryable) {
      const enrichedError = new Error(
        `${mappedError.code}: ${mappedError.message}`,
      );
      // Attach mapped error for debugging
      (enrichedError as any).mappedError = mappedError;
      throw enrichedError;
    }

    // Non-retryable errors don't count toward circuit breaker
    return {
      success: false,
      error: mappedError,
    };
  }
}
```

### 2. Adicionar import do Prisma

**Arquivo:** `apps/worker/src/services/ses.service.ts` (topo do arquivo)

```typescript
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import {
  EmailSendJobData,
  PIPELINE_CONSTANTS,
  ErrorCode,
  ErrorCategory,
} from '@email-gateway/shared';
import { ErrorMappingService, type MappedError } from './error-mapping.service';
import CircuitBreaker from 'opossum';
import { prisma } from '@email-gateway/database'; // ADICIONAR
```

### 3. Testes unitários

**Arquivo:** `apps/worker/src/services/__tests__/ses.service.company-domain.spec.ts`

```typescript
import { SESService } from '../ses.service';
import { prisma } from '@email-gateway/database';

// Mock Prisma
jest.mock('@email-gateway/database', () => ({
  prisma: {
    company: {
      findUnique: jest.fn(),
    },
  },
}));

// Mock AWS SDK
jest.mock('@aws-sdk/client-ses');

describe('SESService - Company Domain (TASK-027)', () => {
  let sesService: SESService;

  beforeEach(() => {
    sesService = new SESService({
      region: 'us-east-1',
      fromAddress: 'noreply@certshiftsoftware.com.br',
    });
  });

  it('should use company verified domain', async () => {
    // Mock company with verified domain
    (prisma.company.findUnique as jest.Mock).mockResolvedValue({
      id: 'company-1',
      name: 'Test Company',
      defaultFromAddress: 'vendas@testcompany.com',
      defaultFromName: 'Equipe Vendas',
      domainId: 'domain-1',
      isSuspended: false,
      defaultDomain: {
        id: 'domain-1',
        domain: 'testcompany.com',
        status: 'VERIFIED',
      },
    });

    const jobData = {
      companyId: 'company-1',
      to: 'recipient@example.com',
      subject: 'Test',
      html: '<p>Test</p>',
    } as any;

    // Mock SES response
    const mockSend = jest.fn().mockResolvedValue({
      MessageId: 'msg-123',
    });
    (sesService as any).client.send = mockSend;

    await sesService.sendEmail(jobData, '<p>Test</p>');

    // Verificar que usou domínio da empresa
    const sentCommand = mockSend.mock.calls[0][0];
    expect(sentCommand.input.Source).toBe('Equipe Vendas <vendas@testcompany.com>');
  });

  it('should use global fallback when domain not verified', async () => {
    (prisma.company.findUnique as jest.Mock).mockResolvedValue({
      id: 'company-2',
      defaultFromAddress: 'vendas@unverified.com',
      domainId: 'domain-2',
      isSuspended: false,
      defaultDomain: {
        id: 'domain-2',
        domain: 'unverified.com',
        status: 'PENDING', // Não verificado
      },
    });

    const mockSend = jest.fn().mockResolvedValue({ MessageId: 'msg-456' });
    (sesService as any).client.send = mockSend;

    await sesService.sendEmail({
      companyId: 'company-2',
      to: 'test@example.com',
      subject: 'Test',
      html: '<p>Test</p>',
    } as any, '<p>Test</p>');

    const sentCommand = mockSend.mock.calls[0][0];
    expect(sentCommand.input.Source).toBe('noreply@certshiftsoftware.com.br');
  });

  it('should throw error when company is suspended', async () => {
    (prisma.company.findUnique as jest.Mock).mockResolvedValue({
      id: 'company-3',
      isSuspended: true,
    });

    await expect(
      sesService.sendEmail({
        companyId: 'company-3',
        to: 'test@example.com',
        subject: 'Test',
        html: '<p>Test</p>',
      } as any, '<p>Test</p>')
    ).rejects.toThrow('Company company-3 is suspended');
  });

  it('should use global fallback when no default domain', async () => {
    (prisma.company.findUnique as jest.Mock).mockResolvedValue({
      id: 'company-4',
      defaultFromAddress: null,
      domainId: null,
      isSuspended: false,
      defaultDomain: null,
    });

    const mockSend = jest.fn().mockResolvedValue({ MessageId: 'msg-789' });
    (sesService as any).client.send = mockSend;

    await sesService.sendEmail({
      companyId: 'company-4',
      to: 'test@example.com',
      subject: 'Test',
      html: '<p>Test</p>',
    } as any, '<p>Test</p>');

    const sentCommand = mockSend.mock.calls[0][0];
    expect(sentCommand.input.Source).toBe('noreply@certshiftsoftware.com.br');
  });
});
```

**Rodar testes:**
```bash
npm test apps/worker/src/services/__tests__/ses.service.company-domain.spec.ts
```

### 4. Testes E2E

**Arquivo:** `apps/worker/tests/e2e/company-domain.e2e.spec.ts`

```typescript
import { prisma } from '@email-gateway/database';
import { Queue } from 'bullmq';

describe('E2E: Company Domain (TASK-027)', () => {
  let emailQueue: Queue;

  beforeAll(async () => {
    emailQueue = new Queue('email-send', {
      connection: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379'),
      },
    });
  });

  afterAll(async () => {
    await emailQueue.close();
    await prisma.$disconnect();
  });

  it('should send email from company verified domain', async () => {
    // Criar empresa com domínio verificado
    const company = await prisma.company.create({
      data: {
        name: 'E2E Test Company',
        apiKey: 'sk_test_e2e',
        apiKeyHash: 'hash',
        apiKeyPrefix: 'sk_test',
        apiKeyCreatedAt: new Date(),
        apiKeyExpiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
        dailyEmailLimit: 100,
        isApproved: true,
        domains: {
          create: {
            domain: 'e2e-test.com',
            status: 'VERIFIED',
            dkimStatus: 'VERIFIED',
          },
        },
      },
      include: {
        domains: true,
      },
    });

    // Definir domínio padrão
    await prisma.company.update({
      where: { id: company.id },
      data: {
        domainId: company.domains[0].id,
        defaultFromAddress: 'test@e2e-test.com',
        defaultFromName: 'E2E Test',
      },
    });

    // Adicionar job na fila
    const job = await emailQueue.add('send-email', {
      companyId: company.id,
      to: 'recipient@example.com',
      subject: 'E2E Test',
      html: '<p>Testing company domain</p>',
    });

    // Aguardar processamento (máx 10s)
    await job.waitUntilFinished(emailQueue.events, 10000);

    // Verificar EmailLog
    const log = await prisma.emailLog.findFirst({
      where: {
        companyId: company.id,
      },
    });

    expect(log).toBeDefined();
    expect(log?.status).toBe('SENT');

    // Cleanup
    await prisma.company.delete({ where: { id: company.id } });
  }, 15000);
});
```

## Categoria
**Feature - Worker + Multi-tenant**

## Bloqueador para Produção?
**SIM - CRÍTICO**

Sem esta mudança:
- ❌ Todos emails saem do mesmo endereço global
- ❌ Clientes não podem usar domínio próprio
- ❌ Multi-tenant não funciona de verdade

Com esta mudança:
- ✅ Cada empresa envia do próprio domínio
- ✅ Validação de domínio verificado
- ✅ Fallback seguro para global
- ✅ Logs claros de qual domínio foi usado

## Checklist de Conclusão

- [ ] SESService modificado
- [ ] Import do Prisma adicionado
- [ ] Testes unitários criados e passando
- [ ] Testes E2E criados e passando
- [ ] Logs adicionados
- [ ] PR criado e revisado
- [ ] Merge na branch principal

## Próximos Passos

- **TASK-028:** Criar API de gerenciamento de domínios
