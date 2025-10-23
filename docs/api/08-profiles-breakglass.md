# 08. Perfis e Break-Glass

## 1. Visão Geral

Este documento especifica o sistema de controle de acesso baseado em perfis (RBAC) e o mecanismo de **break-glass** para acesso emergencial a dados sensíveis não mascarados.

## 2. Perfis de Acesso

### 2.1. Perfil: Ops (Mascarado)

**Descrição**: Perfil operacional com acesso a dados mascarados para operações do dia a dia.

**Permissões**:
- ✅ Visualizar logs de eventos (e-mails enviados, falhas, etc.)
- ✅ Visualizar métricas e dashboards
- ✅ Consultar status de envios
- ✅ Acessar runbooks e documentação
- ✅ Visualizar PIIs mascarados (e-mail, CPF, endereço)
- ❌ Visualizar PIIs não mascarados
- ❌ Solicitar break-glass (apenas Auditoria pode)
- ❌ Aprovar break-glass

**Mascaramento de Dados**:

| Campo | Valor Original | Valor Mascarado |
|-------|---------------|-----------------|
| Email | `joao.silva@example.com` | `j***o@e***e.com` |
| CPF | `123.456.789-00` | `***.***.789-**` |
| Nome | `João da Silva` | `J*** da S***` |
| Endereço | `Rua das Flores, 123` | `Rua *** Flores, ***` |
| Telefone | `(11) 98765-4321` | `(11) ****-4321` |

**Exemplo de Resposta Mascarada**:

```json
{
  "id": "msg_abc123",
  "to": "j***o@e***e.com",
  "subject": "Boleto Vencimento 15/01/2025",
  "status": "delivered",
  "recipient": {
    "name": "J*** da S***",
    "cpf": "***.***.789-**",
    "address": "Rua *** Flores, ***"
  },
  "sentAt": "2025-01-10T14:30:00Z"
}
```

### 2.2. Perfil: Auditoria (Desmascarado)

**Descrição**: Perfil de auditoria com acesso restrito via break-glass para visualizar dados não mascarados.

**Permissões**:
- ✅ Todas as permissões do perfil Ops
- ✅ Solicitar break-glass com justificativa
- ❌ Aprovar o próprio break-glass (requer aprovador diferente)

**Acesso via Break-Glass**:
- Acesso temporário a dados não mascarados
- Requer justificativa detalhada
- Requer aprovação de gestor/compliance
- Validade limitada (1-24 horas)
- Auditoria completa do acesso

**Exemplo de Resposta Desmascarada (após break-glass)**:

```json
{
  "id": "msg_abc123",
  "to": "joao.silva@example.com",
  "subject": "Boleto Vencimento 15/01/2025",
  "status": "delivered",
  "recipient": {
    "name": "João da Silva",
    "cpf": "123.456.789-00",
    "address": "Rua das Flores, 123, São Paulo - SP"
  },
  "sentAt": "2025-01-10T14:30:00Z",
  "_breakGlass": {
    "sessionId": "bg_xyz789",
    "grantedAt": "2025-01-10T15:00:00Z",
    "expiresAt": "2025-01-10T16:00:00Z"
  }
}
```

### 2.3. Perfil: Aprovador Break-Glass

**Descrição**: Gestores ou compliance que aprovam solicitações de break-glass.

**Permissões**:
- ✅ Aprovar solicitações de break-glass
- ✅ Rejeitar solicitações de break-glass
- ✅ Visualizar histórico de solicitações
- ✅ Receber notificações de novas solicitações
- ❌ Aprovar a própria solicitação (segregação de funções)

## 3. Fluxo Break-Glass

### 3.1. Solicitação

**Passo 1: Auditor solicita acesso**

```http
POST /api/v1/break-glass/requests
Authorization: Bearer {token-auditor}
Content-Type: application/json

{
  "reason": "Investigação de falha de entrega - Ticket INC-12345",
  "scope": {
    "resource": "messages",
    "filters": {
      "messageId": "msg_abc123"
    }
  },
  "duration": 3600,
  "approver": "manager@company.com"
}
```

**Resposta**:

```json
{
  "requestId": "bgr_xyz789",
  "status": "pending_approval",
  "requestedBy": "auditor@company.com",
  "requestedAt": "2025-01-10T15:00:00Z",
  "reason": "Investigação de falha de entrega - Ticket INC-12345",
  "approver": "manager@company.com",
  "expiresAt": null,
  "approvalLink": "https://portal.company.com/break-glass/bgr_xyz789"
}
```

**Notificação ao Aprovador**:

```
Para: manager@company.com
Assunto: [URGENTE] Solicitação Break-Glass #bgr_xyz789

Auditor: auditor@company.com
Motivo: Investigação de falha de entrega - Ticket INC-12345
Recurso: messages (msg_abc123)
Duração: 1 hora

Aprovar: https://portal.company.com/break-glass/bgr_xyz789/approve
Rejeitar: https://portal.company.com/break-glass/bgr_xyz789/reject
```

### 3.2. Aprovação

**Passo 2: Aprovador aprova a solicitação**

```http
POST /api/v1/break-glass/requests/bgr_xyz789/approve
Authorization: Bearer {token-aprovador}
Content-Type: application/json

{
  "comment": "Aprovado para investigação do ticket INC-12345"
}
```

**Resposta**:

```json
{
  "requestId": "bgr_xyz789",
  "status": "approved",
  "approvedBy": "manager@company.com",
  "approvedAt": "2025-01-10T15:05:00Z",
  "sessionId": "bgs_abc456",
  "expiresAt": "2025-01-10T16:05:00Z",
  "accessToken": "bg_eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Notificação ao Solicitante**:

```
Para: auditor@company.com
Assunto: Break-Glass Aprovado #bgr_xyz789

Sua solicitação foi aprovada por manager@company.com.

Session ID: bgs_abc456
Validade: 1 hora (expira às 16:05:00 UTC)

Use o token fornecido no header X-Break-Glass-Token para acessar dados desmascarados.
```

### 3.3. Utilização

**Passo 3: Auditor acessa dados não mascarados**

```http
GET /api/v1/messages/msg_abc123
Authorization: Bearer {token-auditor}
X-Break-Glass-Token: bg_eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Resposta (Desmascarada)**:

```json
{
  "id": "msg_abc123",
  "to": "joao.silva@example.com",
  "subject": "Boleto Vencimento 15/01/2025",
  "recipient": {
    "name": "João da Silva",
    "cpf": "123.456.789-00"
  },
  "_breakGlass": {
    "sessionId": "bgs_abc456",
    "expiresAt": "2025-01-10T16:05:00Z",
    "remainingTime": "55 minutes"
  }
}
```

### 3.4. Expiração

**Comportamento ao Expirar**:

1. Token break-glass se torna inválido
2. Sessão é encerrada automaticamente
3. Novas requisições retornam dados mascarados
4. Auditoria registra o fim da sessão

**Erro ao Tentar Usar Token Expirado**:

```json
{
  "error": {
    "code": "BREAK_GLASS_EXPIRED",
    "message": "Break-glass session expired",
    "sessionId": "bgs_abc456",
    "expiredAt": "2025-01-10T16:05:00Z"
  }
}
```

### 3.5. Rejeição

**Passo 2 (alternativo): Aprovador rejeita a solicitação**

```http
POST /api/v1/break-glass/requests/bgr_xyz789/reject
Authorization: Bearer {token-aprovador}
Content-Type: application/json

{
  "reason": "Justificativa insuficiente. Por favor, forneça mais detalhes sobre o incidente."
}
```

**Resposta**:

```json
{
  "requestId": "bgr_xyz789",
  "status": "rejected",
  "rejectedBy": "manager@company.com",
  "rejectedAt": "2025-01-10T15:05:00Z",
  "reason": "Justificativa insuficiente. Por favor, forneça mais detalhes sobre o incidente."
}
```

## 4. Trilha de Auditoria

### 4.1. Eventos Auditados

Todos os eventos de break-glass são registrados:

| Evento | Descrição |
|--------|-----------|
| `break_glass.requested` | Solicitação criada |
| `break_glass.approved` | Solicitação aprovada |
| `break_glass.rejected` | Solicitação rejeitada |
| `break_glass.activated` | Sessão iniciada (primeiro acesso) |
| `break_glass.data_accessed` | Dados desmascarados acessados |
| `break_glass.expired` | Sessão expirada |
| `break_glass.revoked` | Sessão revogada manualmente |

### 4.2. Estrutura do Log de Auditoria

```json
{
  "eventId": "evt_123abc",
  "eventType": "break_glass.data_accessed",
  "timestamp": "2025-01-10T15:10:00Z",
  "actor": {
    "userId": "auditor@company.com",
    "role": "auditoria",
    "ip": "203.0.113.42",
    "userAgent": "Mozilla/5.0..."
  },
  "breakGlass": {
    "requestId": "bgr_xyz789",
    "sessionId": "bgs_abc456",
    "approvedBy": "manager@company.com",
    "reason": "Investigação de falha de entrega - Ticket INC-12345",
    "expiresAt": "2025-01-10T16:05:00Z"
  },
  "resource": {
    "type": "message",
    "id": "msg_abc123",
    "action": "read",
    "fieldsAccessed": ["to", "recipient.name", "recipient.cpf", "recipient.address"]
  },
  "metadata": {
    "traceId": "trace_abc123",
    "requestId": "req_xyz789"
  }
}
```

### 4.3. Armazenamento de Logs

**Requisitos**:
- ✅ Logs imutáveis (append-only)
- ✅ Retenção mínima: 5 anos (conformidade LGPD)
- ✅ Criptografia em repouso
- ✅ Acesso restrito (apenas compliance/auditoria)
- ✅ Backup diário

**Tecnologias Sugeridas**:
- AWS CloudWatch Logs com retention de 1825 dias (5 anos)
- AWS S3 Glacier para arquivamento de longo prazo
- AWS CloudTrail para auditoria de acesso aos logs

## 5. Relatórios Mensais

### 5.1. Relatório de Break-Glass

**Geração Automática**: Todo dia 1 do mês, às 00:00 UTC

**Conteúdo**:

```
=== RELATÓRIO BREAK-GLASS - Janeiro/2025 ===

RESUMO:
- Total de solicitações: 12
- Aprovadas: 9 (75%)
- Rejeitadas: 3 (25%)
- Tempo médio de aprovação: 8 minutos
- Duração média de sessão: 45 minutos

SOLICITAÇÕES APROVADAS:

1. bgr_xyz789
   Solicitante: auditor@company.com
   Aprovador: manager@company.com
   Motivo: Investigação de falha de entrega - Ticket INC-12345
   Data: 2025-01-10 15:00 UTC
   Duração: 1 hora
   Recursos acessados: 1 mensagem (msg_abc123)

2. bgr_abc456
   Solicitante: auditor2@company.com
   Aprovador: compliance@company.com
   Motivo: Auditoria trimestral LGPD - Processo AUD-2025-Q1
   Data: 2025-01-15 10:00 UTC
   Duração: 4 horas
   Recursos acessados: 150 mensagens

[...]

SOLICITAÇÕES REJEITADAS:

1. bgr_def123
   Solicitante: auditor@company.com
   Rejeitado por: manager@company.com
   Motivo da rejeição: Justificativa insuficiente
   Data: 2025-01-05 14:00 UTC

[...]

TOP 5 SOLICITANTES:
1. auditor@company.com: 5 solicitações
2. auditor2@company.com: 3 solicitações
3. compliance@company.com: 2 solicitações

TOP 5 APROVADORES:
1. manager@company.com: 6 aprovações
2. compliance@company.com: 3 aprovações

ALERTAS:
⚠️ Auditor 'auditor@company.com' teve 2 solicitações rejeitadas no mês
⚠️ Sessão 'bgs_xyz999' foi revogada manualmente (possível suspeita de abuso)

=== FIM DO RELATÓRIO ===
```

**Distribuição**:
- compliance@company.com
- dpo@company.com (Data Protection Officer)
- ciso@company.com (Chief Information Security Officer)

### 5.2. API de Relatórios

```http
GET /api/v1/reports/break-glass?month=2025-01&format=json
Authorization: Bearer {token-compliance}
```

**Resposta**:

```json
{
  "period": {
    "start": "2025-01-01T00:00:00Z",
    "end": "2025-01-31T23:59:59Z"
  },
  "summary": {
    "totalRequests": 12,
    "approved": 9,
    "rejected": 3,
    "approvalRate": 0.75,
    "avgApprovalTime": 480,
    "avgSessionDuration": 2700
  },
  "requests": [...],
  "topRequesters": [...],
  "topApprovers": [...],
  "alerts": [...]
}
```

## 6. Implementação

### 6.1. Modelo de Dados

**Tabela: break_glass_requests**

```sql
CREATE TABLE break_glass_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id VARCHAR(50) UNIQUE NOT NULL, -- bgr_xyz789
  requested_by VARCHAR(255) NOT NULL,
  requested_at TIMESTAMP NOT NULL DEFAULT NOW(),
  reason TEXT NOT NULL,
  scope JSONB NOT NULL, -- {resource, filters}
  duration INTEGER NOT NULL, -- segundos
  approver VARCHAR(255) NOT NULL,
  status VARCHAR(20) NOT NULL, -- pending_approval, approved, rejected, expired
  approved_by VARCHAR(255),
  approved_at TIMESTAMP,
  rejected_by VARCHAR(255),
  rejected_at TIMESTAMP,
  rejection_reason TEXT,
  expires_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_bg_requests_status ON break_glass_requests(status);
CREATE INDEX idx_bg_requests_requested_by ON break_glass_requests(requested_by);
CREATE INDEX idx_bg_requests_approver ON break_glass_requests(approver);
```

**Tabela: break_glass_sessions**

```sql
CREATE TABLE break_glass_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id VARCHAR(50) UNIQUE NOT NULL, -- bgs_abc456
  request_id VARCHAR(50) NOT NULL REFERENCES break_glass_requests(request_id),
  access_token_hash VARCHAR(255) NOT NULL, -- hash do token
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMP NOT NULL,
  revoked_at TIMESTAMP,
  revoked_by VARCHAR(255),
  revoke_reason TEXT
);

CREATE INDEX idx_bg_sessions_request_id ON break_glass_sessions(request_id);
CREATE INDEX idx_bg_sessions_expires_at ON break_glass_sessions(expires_at);
```

**Tabela: break_glass_audit_log**

```sql
CREATE TABLE break_glass_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id VARCHAR(50) UNIQUE NOT NULL,
  event_type VARCHAR(50) NOT NULL,
  timestamp TIMESTAMP NOT NULL DEFAULT NOW(),
  actor_user_id VARCHAR(255) NOT NULL,
  actor_role VARCHAR(50) NOT NULL,
  actor_ip VARCHAR(45) NOT NULL,
  actor_user_agent TEXT,
  request_id VARCHAR(50),
  session_id VARCHAR(50),
  resource_type VARCHAR(50),
  resource_id VARCHAR(255),
  action VARCHAR(50),
  fields_accessed TEXT[], -- array de campos acessados
  metadata JSONB
);

CREATE INDEX idx_bg_audit_event_type ON break_glass_audit_log(event_type);
CREATE INDEX idx_bg_audit_timestamp ON break_glass_audit_log(timestamp);
CREATE INDEX idx_bg_audit_request_id ON break_glass_audit_log(request_id);
CREATE INDEX idx_bg_audit_session_id ON break_glass_audit_log(session_id);
```

### 6.2. Service: BreakGlassService

```typescript
import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomBytes } from 'crypto';

@Injectable()
export class BreakGlassService {
  constructor(
    @InjectRepository(BreakGlassRequest)
    private requestRepo: Repository<BreakGlassRequest>,
    @InjectRepository(BreakGlassSession)
    private sessionRepo: Repository<BreakGlassSession>,
    private jwtService: JwtService,
    private auditService: BreakGlassAuditService,
    private notificationService: NotificationService,
  ) {}

  async createRequest(dto: CreateBreakGlassRequestDto, user: User): Promise<BreakGlassRequest> {
    // Validar role
    if (user.role !== 'auditoria') {
      throw new ForbiddenException('Only auditors can request break-glass access');
    }

    // Validar duração (máximo 24 horas)
    if (dto.duration > 86400) {
      throw new BadRequestException('Maximum duration is 24 hours');
    }

    const request = this.requestRepo.create({
      requestId: `bgr_${randomBytes(8).toString('hex')}`,
      requestedBy: user.email,
      reason: dto.reason,
      scope: dto.scope,
      duration: dto.duration,
      approver: dto.approver,
      status: 'pending_approval',
    });

    await this.requestRepo.save(request);

    // Auditar
    await this.auditService.log({
      eventType: 'break_glass.requested',
      actor: user,
      requestId: request.requestId,
      metadata: { scope: dto.scope },
    });

    // Notificar aprovador
    await this.notificationService.notifyApprover(request);

    return request;
  }

  async approveRequest(requestId: string, approver: User, comment?: string): Promise<BreakGlassSession> {
    const request = await this.requestRepo.findOne({ where: { requestId } });

    if (!request) {
      throw new NotFoundException('Request not found');
    }

    if (request.status !== 'pending_approval') {
      throw new BadRequestException('Request is not pending approval');
    }

    // Validar aprovador
    if (request.approver !== approver.email) {
      throw new ForbiddenException('You are not authorized to approve this request');
    }

    // Segregação de funções: não pode aprovar a própria solicitação
    if (request.requestedBy === approver.email) {
      throw new ForbiddenException('Cannot approve your own request');
    }

    // Atualizar request
    request.status = 'approved';
    request.approvedBy = approver.email;
    request.approvedAt = new Date();
    request.expiresAt = new Date(Date.now() + request.duration * 1000);
    await this.requestRepo.save(request);

    // Criar sessão
    const accessToken = this.generateAccessToken(request);
    const tokenHash = createHash('sha256').update(accessToken).digest('hex');

    const session = this.sessionRepo.create({
      sessionId: `bgs_${randomBytes(8).toString('hex')}`,
      requestId: request.requestId,
      accessTokenHash: tokenHash,
      expiresAt: request.expiresAt,
    });

    await this.sessionRepo.save(session);

    // Auditar
    await this.auditService.log({
      eventType: 'break_glass.approved',
      actor: approver,
      requestId: request.requestId,
      sessionId: session.sessionId,
      metadata: { comment },
    });

    // Notificar solicitante
    await this.notificationService.notifyRequester(request, session, accessToken);

    return { ...session, accessToken };
  }

  async rejectRequest(requestId: string, approver: User, reason: string): Promise<void> {
    const request = await this.requestRepo.findOne({ where: { requestId } });

    if (!request) {
      throw new NotFoundException('Request not found');
    }

    if (request.status !== 'pending_approval') {
      throw new BadRequestException('Request is not pending approval');
    }

    if (request.approver !== approver.email) {
      throw new ForbiddenException('You are not authorized to reject this request');
    }

    request.status = 'rejected';
    request.rejectedBy = approver.email;
    request.rejectedAt = new Date();
    request.rejectionReason = reason;
    await this.requestRepo.save(request);

    // Auditar
    await this.auditService.log({
      eventType: 'break_glass.rejected',
      actor: approver,
      requestId: request.requestId,
      metadata: { reason },
    });

    // Notificar solicitante
    await this.notificationService.notifyRejection(request);
  }

  async validateSession(token: string): Promise<BreakGlassSession | null> {
    const tokenHash = createHash('sha256').update(token).digest('hex');

    const session = await this.sessionRepo.findOne({
      where: { accessTokenHash: tokenHash },
      relations: ['request'],
    });

    if (!session) {
      return null;
    }

    // Verificar expiração
    if (session.expiresAt < new Date()) {
      return null;
    }

    // Verificar revogação
    if (session.revokedAt) {
      return null;
    }

    return session;
  }

  private generateAccessToken(request: BreakGlassRequest): string {
    return this.jwtService.sign(
      {
        requestId: request.requestId,
        requestedBy: request.requestedBy,
        scope: request.scope,
      },
      {
        expiresIn: request.duration,
        issuer: 'break-glass-service',
      },
    );
  }
}
```

### 6.3. Middleware: BreakGlassMiddleware

```typescript
import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

@Injectable()
export class BreakGlassMiddleware implements NestMiddleware {
  constructor(
    private breakGlassService: BreakGlassService,
    private auditService: BreakGlassAuditService,
  ) {}

  async use(req: Request, res: Response, next: NextFunction) {
    const breakGlassToken = req.headers['x-break-glass-token'] as string;

    if (!breakGlassToken) {
      // Sem token break-glass, continuar com dados mascarados
      req['breakGlass'] = null;
      return next();
    }

    // Validar sessão
    const session = await this.breakGlassService.validateSession(breakGlassToken);

    if (!session) {
      return res.status(401).json({
        error: {
          code: 'BREAK_GLASS_INVALID',
          message: 'Invalid or expired break-glass token',
        },
      });
    }

    // Adicionar contexto break-glass no request
    req['breakGlass'] = {
      sessionId: session.sessionId,
      requestId: session.requestId,
      scope: session.request.scope,
      expiresAt: session.expiresAt,
    };

    // Auditar acesso
    await this.auditService.log({
      eventType: 'break_glass.data_accessed',
      actor: req.user,
      requestId: session.requestId,
      sessionId: session.sessionId,
      resource: {
        type: req.path.split('/')[3], // ex: /api/v1/messages/...
        id: req.params.id,
        action: req.method.toLowerCase(),
      },
    });

    next();
  }
}
```

### 6.4. Decorator: Unmask

```typescript
import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const Unmask = createParamDecorator((data: unknown, ctx: ExecutionContext): boolean => {
  const request = ctx.switchToHttp().getRequest();
  return !!request.breakGlass;
});
```

**Uso no Controller**:

```typescript
@Controller('messages')
export class MessagesController {
  @Get(':id')
  async getMessage(@Param('id') id: string, @Unmask() unmask: boolean) {
    const message = await this.messagesService.findOne(id);

    if (unmask) {
      // Retornar dados desmascarados
      return message;
    } else {
      // Retornar dados mascarados
      return this.maskingService.maskMessage(message);
    }
  }
}
```

### 6.5. Service: MaskingService

```typescript
@Injectable()
export class MaskingService {
  maskEmail(email: string): string {
    const [local, domain] = email.split('@');
    const [domainName, tld] = domain.split('.');

    const maskedLocal = local.charAt(0) + '***' + local.charAt(local.length - 1);
    const maskedDomain = domainName.charAt(0) + '***' + domainName.charAt(domainName.length - 1);

    return `${maskedLocal}@${maskedDomain}.${tld}`;
  }

  maskCpf(cpf: string): string {
    // 123.456.789-00 -> ***.***.789-**
    return cpf.replace(/(\d{3})\.(\d{3})\.(\d{3})-(\d{2})/, '***.***.$3-**');
  }

  maskName(name: string): string {
    // João da Silva -> J*** da S***
    return name
      .split(' ')
      .map((part) => {
        if (part.length <= 2) return part; // Preposições (da, de, do)
        return part.charAt(0) + '***';
      })
      .join(' ');
  }

  maskAddress(address: string): string {
    // Rua das Flores, 123 -> Rua *** Flores, ***
    return address.replace(/\b\w+\b/g, (word) => {
      if (word.length <= 3) return word;
      return '***';
    });
  }

  maskPhone(phone: string): string {
    // (11) 98765-4321 -> (11) ****-4321
    return phone.replace(/(\(\d{2}\) )\d{4,5}(-\d{4})/, '$1****$2');
  }

  maskMessage(message: any): any {
    return {
      ...message,
      to: this.maskEmail(message.to),
      recipient: {
        name: this.maskName(message.recipient.name),
        cpf: this.maskCpf(message.recipient.cpf),
        address: this.maskAddress(message.recipient.address),
        phone: message.recipient.phone ? this.maskPhone(message.recipient.phone) : undefined,
      },
    };
  }
}
```

## 7. Testes

### 7.1. Teste: Solicitação Break-Glass

```typescript
describe('BreakGlassService - createRequest', () => {
  it('should create a break-glass request successfully', async () => {
    const dto: CreateBreakGlassRequestDto = {
      reason: 'Investigation of delivery failure - Ticket INC-12345',
      scope: {
        resource: 'messages',
        filters: { messageId: 'msg_abc123' },
      },
      duration: 3600,
      approver: 'manager@company.com',
    };

    const user: User = {
      email: 'auditor@company.com',
      role: 'auditoria',
    };

    const request = await service.createRequest(dto, user);

    expect(request.requestId).toMatch(/^bgr_[a-f0-9]{16}$/);
    expect(request.status).toBe('pending_approval');
    expect(request.requestedBy).toBe('auditor@company.com');
  });

  it('should reject request from non-auditor user', async () => {
    const dto: CreateBreakGlassRequestDto = { /* ... */ };
    const user: User = { email: 'ops@company.com', role: 'ops' };

    await expect(service.createRequest(dto, user)).rejects.toThrow(ForbiddenException);
  });

  it('should reject request with duration > 24 hours', async () => {
    const dto: CreateBreakGlassRequestDto = {
      /* ... */
      duration: 100000, // > 86400
    };
    const user: User = { email: 'auditor@company.com', role: 'auditoria' };

    await expect(service.createRequest(dto, user)).rejects.toThrow(BadRequestException);
  });
});
```

### 7.2. Teste: Aprovação Break-Glass

```typescript
describe('BreakGlassService - approveRequest', () => {
  it('should approve a pending request', async () => {
    const request = await createPendingRequest();
    const approver: User = { email: 'manager@company.com', role: 'manager' };

    const session = await service.approveRequest(request.requestId, approver);

    expect(session.sessionId).toMatch(/^bgs_[a-f0-9]{16}$/);
    expect(session.accessToken).toBeDefined();
    expect(session.expiresAt).toBeInstanceOf(Date);
  });

  it('should reject approval from unauthorized user', async () => {
    const request = await createPendingRequest();
    const wrongApprover: User = { email: 'other@company.com', role: 'manager' };

    await expect(service.approveRequest(request.requestId, wrongApprover)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('should reject self-approval (segregation of duties)', async () => {
    const request = await createPendingRequest();
    const selfApprover: User = { email: request.requestedBy, role: 'auditoria' };

    await expect(service.approveRequest(request.requestId, selfApprover)).rejects.toThrow(
      ForbiddenException,
    );
  });
});
```

### 7.3. Teste: Mascaramento de Dados

```typescript
describe('MaskingService', () => {
  it('should mask email correctly', () => {
    expect(service.maskEmail('joao.silva@example.com')).toBe('j***a@e***e.com');
  });

  it('should mask CPF correctly', () => {
    expect(service.maskCpf('123.456.789-00')).toBe('***.***.789-**');
  });

  it('should mask name correctly', () => {
    expect(service.maskName('João da Silva')).toBe('J*** da S***');
  });

  it('should mask entire message object', () => {
    const message = {
      id: 'msg_abc123',
      to: 'joao.silva@example.com',
      recipient: {
        name: 'João da Silva',
        cpf: '123.456.789-00',
        address: 'Rua das Flores, 123',
        phone: '(11) 98765-4321',
      },
    };

    const masked = service.maskMessage(message);

    expect(masked.to).toBe('j***a@e***e.com');
    expect(masked.recipient.name).toBe('J*** da S***');
    expect(masked.recipient.cpf).toBe('***.***.789-**');
  });
});
```

## 8. Segurança

### 8.1. Ameaças e Mitigações

| Ameaça | Mitigação |
|--------|-----------|
| Abuso de break-glass | Auditoria completa; relatórios mensais; alertas automáticos |
| Auto-aprovação | Segregação de funções: solicitante ≠ aprovador |
| Token roubado | Tokens expiram; validação por IP; rate limiting |
| Sessão não expirada | Job automático para expirar sessões antigas |
| Falta de justificativa | Justificativa obrigatória; aprovador pode rejeitar |
| Logs adulterados | Logs imutáveis (append-only); criptografia; CloudTrail |

### 8.2. Rate Limiting

```typescript
// Máximo 5 solicitações por auditor por dia
@Throttle(5, 86400)
@Post('/break-glass/requests')
async createRequest(@Body() dto: CreateBreakGlassRequestDto, @CurrentUser() user: User) {
  return this.breakGlassService.createRequest(dto, user);
}
```

### 8.3. Alertas Automáticos

```typescript
// Enviar alerta se:
// 1. Auditor tem > 2 rejeições em 30 dias
// 2. Sessão é usada de IP diferente do esperado
// 3. Tentativa de acesso após expiração

@Injectable()
export class BreakGlassAlertService {
  async checkAndAlert(event: BreakGlassAuditEvent): Promise<void> {
    // Verificar padrões suspeitos
    const recentRejections = await this.countRecentRejections(event.actor.userId, 30);

    if (recentRejections > 2) {
      await this.sendAlert({
        level: 'warning',
        message: `User ${event.actor.userId} has ${recentRejections} rejections in last 30 days`,
        recipients: ['compliance@company.com', 'ciso@company.com'],
      });
    }

    // Verificar IP suspeito
    if (event.actor.ip !== event.session.expectedIp) {
      await this.sendAlert({
        level: 'critical',
        message: `Break-glass session ${event.sessionId} accessed from unexpected IP`,
        recipients: ['soc@company.com', 'ciso@company.com'],
      });
    }
  }
}
```

## 9. Conformidade LGPD

### 9.1. Princípios Atendidos

| Princípio | Como é Atendido |
|-----------|-----------------|
| **Necessidade** | Acesso não mascarado apenas quando estritamente necessário |
| **Finalidade** | Justificativa obrigatória para cada solicitação |
| **Transparência** | Titular pode consultar acessos via portal |
| **Segurança** | Criptografia, auditoria, expiração automática |
| **Prevenção** | Logs imutáveis, alertas automáticos |
| **Responsabilização** | Trilha completa de quem acessou o quê, quando e por quê |

### 9.2. Direitos do Titular

**Portal do Titular**:

```http
GET /api/v1/data-subject/access-log
Authorization: Bearer {token-titular}
```

**Resposta**:

```json
{
  "subject": {
    "cpf": "123.456.789-00",
    "email": "joao.silva@example.com"
  },
  "accessLog": [
    {
      "accessedAt": "2025-01-10T15:10:00Z",
      "accessedBy": "auditor@company.com",
      "reason": "Investigação de falha de entrega - Ticket INC-12345",
      "approvedBy": "manager@company.com",
      "dataAccessed": ["email", "cpf", "nome", "endereço"],
      "breakGlassSession": "bgs_abc456"
    }
  ]
}
```

## 10. Troubleshooting

### 10.1. Problemas Comuns

**Problema**: Token break-glass não está funcionando

**Solução**:
1. Verificar se a sessão não expirou: `GET /api/v1/break-glass/sessions/{sessionId}`
2. Verificar se o token está sendo enviado no header `X-Break-Glass-Token`
3. Verificar se o token não foi revogado

**Problema**: Solicitação sempre é rejeitada

**Solução**:
1. Verificar se a justificativa é suficientemente detalhada
2. Entrar em contato com o aprovador para entender o motivo
3. Incluir ticket/processo relacionado na justificativa

**Problema**: Dados ainda aparecem mascarados mesmo com break-glass ativo

**Solução**:
1. Verificar se o endpoint suporta desmascaramento
2. Verificar se o scope da solicitação inclui o recurso acessado
3. Verificar logs: `GET /api/v1/break-glass/audit-log?sessionId={sessionId}`

---

**Referências**:
- LGPD (Lei nº 13.709/2018)
- NIST SP 800-53 (Access Control)
- CIS Controls v8 (Break-Glass Procedures)
- ISO 27001 (Information Security Management)
