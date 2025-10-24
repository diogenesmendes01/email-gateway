# TASK-004 — Implementar Recipient API Module

## Contexto
- Origem: Análise completa do código
- Resumo: Módulo `recipient` existe mas está vazio (apenas TODOs). Model do banco está completo, mas faltam controllers e services para gerenciar recipients via API

## O que precisa ser feito
- [ ] Criar `recipient.service.ts` com CRUD operations
- [ ] Criar `recipient.controller.ts` com endpoints REST
- [ ] Implementar validação de inputs (DTOs)
- [ ] Adicionar autenticação nos endpoints (API Key guard)
- [ ] Implementar paginação para listagem
- [ ] Adicionar testes unitários para service
- [ ] Adicionar testes E2E para endpoints
- [ ] Documentar endpoints na API docs

## Urgência
- **Nível (1–5):** 3 (MODERADO - Feature)

## Responsável sugerido
- Backend

## Dependências / Riscos
- Dependências:
  - Prisma Client (já disponível)
  - NestJS decorators (já disponível)
  - Encryption utils (já implementado)
- Riscos:
  - Médio: Expor dados sensíveis se não tomar cuidado
  - Mitigação: Nunca retornar CPF/CNPJ descriptografado na API

## Detalhes Técnicos

**Endpoints a implementar:**

```typescript
// Recipient Controller
GET    /v1/recipients          - Listar recipients (com paginação)
GET    /v1/recipients/:id      - Obter recipient por ID
POST   /v1/recipients          - Criar recipient
PUT    /v1/recipients/:id      - Atualizar recipient
DELETE /v1/recipients/:id      - Soft delete de recipient
GET    /v1/recipients/search   - Buscar por email ou hash CPF/CNPJ
```

**Estrutura de arquivos:**

```
apps/api/src/modules/recipient/
├── recipient.module.ts          ✓ (já existe, atualizar)
├── recipient.controller.ts      ✗ (criar)
├── recipient.service.ts         ✗ (criar)
├── dto/
│   ├── create-recipient.dto.ts  ✗ (criar)
│   ├── update-recipient.dto.ts  ✗ (criar)
│   └── recipient-query.dto.ts   ✗ (criar)
└── __tests__/
    ├── recipient.service.spec.ts    ✗ (criar)
    └── recipient.controller.spec.ts ✗ (criar)
```

**Exemplo de Service:**

```typescript
// recipient.service.ts
@Injectable()
export class RecipientService {
  constructor(private prisma: PrismaService) {}

  async create(
    companyId: string,
    dto: CreateRecipientDto
  ): Promise<Recipient> {
    const data: any = {
      email: dto.email,
      externalId: dto.externalId,
      companyId,
    };

    // Criptografar CPF/CNPJ se fornecido
    if (dto.cpfCnpj) {
      const hash = hashCpfCnpjSha256(dto.cpfCnpj);
      const { encrypted, salt } = encryptCpfCnpj(
        dto.cpfCnpj,
        process.env.ENCRYPTION_KEY
      );
      data.cpfCnpjHash = hash;
      data.cpfCnpjEnc = encrypted;
      data.cpfCnpjSalt = salt;
    }

    return this.prisma.recipient.create({ data });
  }

  async findAll(
    companyId: string,
    query: RecipientQueryDto
  ): Promise<{ data: Recipient[]; total: number }> {
    const where = { companyId, deletedAt: null };

    if (query.email) {
      where['email'] = { contains: query.email };
    }

    const [data, total] = await Promise.all([
      this.prisma.recipient.findMany({
        where,
        skip: query.skip || 0,
        take: query.limit || 20,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.recipient.count({ where }),
    ]);

    return { data, total };
  }

  async findOne(companyId: string, id: string): Promise<Recipient> {
    return this.prisma.recipient.findFirst({
      where: { id, companyId, deletedAt: null },
    });
  }

  async update(
    companyId: string,
    id: string,
    dto: UpdateRecipientDto
  ): Promise<Recipient> {
    return this.prisma.recipient.update({
      where: { id, companyId },
      data: dto,
    });
  }

  async softDelete(companyId: string, id: string): Promise<void> {
    await this.prisma.recipient.update({
      where: { id, companyId },
      data: { deletedAt: new Date() },
    });
  }
}
```

**Exemplo de Controller:**

```typescript
// recipient.controller.ts
@Controller('v1/recipients')
@UseGuards(ApiKeyGuard)
export class RecipientController {
  constructor(private recipientService: RecipientService) {}

  @Get()
  async findAll(
    @Query() query: RecipientQueryDto,
    @Req() req: Request
  ) {
    const companyId = req['companyId'];
    return this.recipientService.findAll(companyId, query);
  }

  @Get(':id')
  async findOne(
    @Param('id') id: string,
    @Req() req: Request
  ) {
    const companyId = req['companyId'];
    const recipient = await this.recipientService.findOne(companyId, id);

    if (!recipient) {
      throw new NotFoundException('Recipient not found');
    }

    // IMPORTANTE: Não retornar campos criptografados
    delete recipient.cpfCnpjEnc;
    delete recipient.cpfCnpjSalt;

    return recipient;
  }

  @Post()
  async create(
    @Body() dto: CreateRecipientDto,
    @Req() req: Request
  ) {
    const companyId = req['companyId'];
    return this.recipientService.create(companyId, dto);
  }

  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateRecipientDto,
    @Req() req: Request
  ) {
    const companyId = req['companyId'];
    return this.recipientService.update(companyId, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  async delete(
    @Param('id') id: string,
    @Req() req: Request
  ) {
    const companyId = req['companyId'];
    await this.recipientService.softDelete(companyId, id);
  }
}
```

**DTOs:**

```typescript
// create-recipient.dto.ts
export class CreateRecipientDto {
  @IsEmail()
  email: string;

  @IsOptional()
  @IsString()
  externalId?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{11}$|^\d{14}$/, {
    message: 'CPF must be 11 digits or CNPJ must be 14 digits',
  })
  cpfCnpj?: string;
}

// recipient-query.dto.ts
export class RecipientQueryDto {
  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  skip?: number = 0;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}
```

**Testes E2E:**

```typescript
describe('Recipient API (E2E)', () => {
  it('POST /v1/recipients - should create recipient', async () => {
    const response = await request(app.getHttpServer())
      .post('/v1/recipients')
      .set('x-api-key', 'test-key')
      .send({
        email: 'test@example.com',
        cpfCnpj: '12345678901',
      })
      .expect(201);

    expect(response.body.email).toBe('test@example.com');
    expect(response.body.cpfCnpjEnc).toBeUndefined(); // Não deve retornar
  });

  it('GET /v1/recipients - should list recipients', async () => {
    const response = await request(app.getHttpServer())
      .get('/v1/recipients')
      .set('x-api-key', 'test-key')
      .expect(200);

    expect(response.body.data).toBeArray();
    expect(response.body.total).toBeNumber();
  });
});
```

## Bloqueador para Produção?
**NÃO** - Este é um nice-to-have. O sistema funciona sem estes endpoints (recipients são criados automaticamente ao enviar emails). Pode ser implementado pós-MVP.
