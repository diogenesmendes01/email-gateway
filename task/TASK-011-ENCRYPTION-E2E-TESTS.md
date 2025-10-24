# TASK-011 — Testes E2E de Criptografia (Testes)

## Contexto
- Origem: PR-BACKLOG (PR18-TASK-8.1-04)
- Resumo: Testes unitários validam funções isoladas, falta teste E2E validando fluxo completo: API recebe CPF/CNPJ → Encripta → Armazena → Recupera → Decripta

## O que precisa ser feito
- [ ] Criar `apps/api/test/recipient-encryption.e2e-spec.ts`
- [ ] Testar criação de recipient com CPF/CNPJ via API
- [ ] Verificar que dados são encriptados no banco
- [ ] Testar recuperação e descriptografia
- [ ] Testar busca por hash funciona corretamente
- [ ] Validar que salt é único por registro
- [ ] Testar que CPF/CNPJ nunca é retornado na API

## Urgência
- **Nível (1–5):** 3 (MODERADO - Qualidade)

## Responsável sugerido
- Backend

## Dependências / Riscos
- Dependências: supertest, jest, test database (já disponíveis)
- Riscos:
  - Baixo: Apenas testes
  - Necessita database limpo para testes

## Detalhes Técnicos

**Criar arquivo:** `apps/api/test/recipient-encryption.e2e-spec.ts`

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  decryptCpfCnpj,
  hashCpfCnpjSha256
} from '@email-gateway/shared';

describe('Recipient Encryption (E2E)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let apiKey: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe());

    prisma = app.get<PrismaService>(PrismaService);

    await app.init();

    // Setup test API key
    const company = await prisma.company.create({
      data: {
        name: 'Test Company',
        apiKeyHash: 'test-hash',
        apiKeyPrefix: 'test',
      },
    });
    apiKey = 'test-api-key';
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await app.close();
  });

  beforeEach(async () => {
    // Limpar recipients antes de cada teste
    await prisma.recipient.deleteMany({});
  });

  describe('POST /v1/email/send - with CPF/CNPJ encryption', () => {
    it('should encrypt CPF/CNPJ when creating recipient', async () => {
      const cpf = '12345678901';
      const email = 'test@example.com';

      const response = await request(app.getHttpServer())
        .post('/v1/email/send')
        .set('x-api-key', apiKey)
        .send({
          to: email,
          subject: 'Test Email',
          html: '<p>Test content</p>',
          recipient: {
            cpfCnpj: cpf,
          },
        })
        .expect(201);

      expect(response.body.jobId).toBeDefined();

      // Verificar dados no banco
      const recipient = await prisma.recipient.findFirst({
        where: { email },
      });

      expect(recipient).toBeDefined();
      expect(recipient.cpfCnpjEnc).toBeDefined();
      expect(recipient.cpfCnpjSalt).toBeDefined();
      expect(recipient.cpfCnpjHash).toBeDefined();

      // Verificar que valor encriptado não é plaintext
      expect(recipient.cpfCnpjEnc).not.toBe(cpf);
      expect(recipient.cpfCnpjEnc).not.toContain(cpf);

      // Verificar formato do encrypted (deve ser base64:base64:base64)
      expect(recipient.cpfCnpjEnc.split(':')).toHaveLength(3);
    });

    it('should generate correct hash for CPF search', async () => {
      const cpf = '12345678901';

      await request(app.getHttpServer())
        .post('/v1/email/send')
        .set('x-api-key', apiKey)
        .send({
          to: 'test@example.com',
          subject: 'Test',
          html: '<p>Test</p>',
          recipient: { cpfCnpj: cpf },
        })
        .expect(201);

      // Buscar por hash
      const expectedHash = hashCpfCnpjSha256(cpf);
      const recipient = await prisma.recipient.findFirst({
        where: { cpfCnpjHash: expectedHash },
      });

      expect(recipient).toBeDefined();
      expect(recipient.email).toBe('test@example.com');
    });

    it('should be able to decrypt CPF/CNPJ with correct key', async () => {
      const cpf = '12345678901';

      await request(app.getHttpServer())
        .post('/v1/email/send')
        .set('x-api-key', apiKey)
        .send({
          to: 'test@example.com',
          subject: 'Test',
          html: '<p>Test</p>',
          recipient: { cpfCnpj: cpf },
        })
        .expect(201);

      const recipient = await prisma.recipient.findFirst({
        where: { email: 'test@example.com' },
      });

      // Descriptografar
      const decrypted = decryptCpfCnpj(
        recipient.cpfCnpjEnc,
        process.env.ENCRYPTION_KEY,
        recipient.cpfCnpjSalt
      );

      expect(decrypted).toBe(cpf);
    });

    it('should work with CNPJ (14 digits)', async () => {
      const cnpj = '12345678000190';

      await request(app.getHttpServer())
        .post('/v1/email/send')
        .set('x-api-key', apiKey)
        .send({
          to: 'company@example.com',
          subject: 'Test',
          html: '<p>Test</p>',
          recipient: { cpfCnpj: cnpj },
        })
        .expect(201);

      const recipient = await prisma.recipient.findFirst({
        where: { email: 'company@example.com' },
      });

      expect(recipient.cpfCnpjEnc).toBeDefined();

      const decrypted = decryptCpfCnpj(
        recipient.cpfCnpjEnc,
        process.env.ENCRYPTION_KEY,
        recipient.cpfCnpjSalt
      );

      expect(decrypted).toBe(cnpj);
    });
  });

  describe('Unique salt per recipient', () => {
    it('should use unique salt for each recipient with same CPF', async () => {
      const cpf = '12345678901';

      // Criar dois recipients com mesmo CPF
      await request(app.getHttpServer())
        .post('/v1/email/send')
        .set('x-api-key', apiKey)
        .send({
          to: 'user1@example.com',
          subject: 'Test',
          html: '<p>Test</p>',
          recipient: { cpfCnpj: cpf },
        })
        .expect(201);

      await request(app.getHttpServer())
        .post('/v1/email/send')
        .set('x-api-key', apiKey)
        .send({
          to: 'user2@example.com',
          subject: 'Test',
          html: '<p>Test</p>',
          recipient: { cpfCnpj: cpf },
        })
        .expect(201);

      const recipients = await prisma.recipient.findMany({
        orderBy: { createdAt: 'asc' },
      });

      expect(recipients).toHaveLength(2);

      // Verificar que salts são diferentes
      expect(recipients[0].cpfCnpjSalt).not.toBe(recipients[1].cpfCnpjSalt);

      // Verificar que encrypted values são diferentes
      expect(recipients[0].cpfCnpjEnc).not.toBe(recipients[1].cpfCnpjEnc);

      // Mas hashes são iguais (para busca)
      expect(recipients[0].cpfCnpjHash).toBe(recipients[1].cpfCnpjHash);

      // Ambos descriptografam para o mesmo CPF
      const decrypted1 = decryptCpfCnpj(
        recipients[0].cpfCnpjEnc,
        process.env.ENCRYPTION_KEY,
        recipients[0].cpfCnpjSalt
      );
      const decrypted2 = decryptCpfCnpj(
        recipients[1].cpfCnpjEnc,
        process.env.ENCRYPTION_KEY,
        recipients[1].cpfCnpjSalt
      );

      expect(decrypted1).toBe(cpf);
      expect(decrypted2).toBe(cpf);
    });
  });

  describe('API should never return CPF/CNPJ plaintext', () => {
    it('should not return CPF/CNPJ in GET /v1/emails/:id', async () => {
      const cpf = '12345678901';

      // Enviar email
      const sendResponse = await request(app.getHttpServer())
        .post('/v1/email/send')
        .set('x-api-key', apiKey)
        .send({
          to: 'test@example.com',
          subject: 'Test',
          html: '<p>Test</p>',
          recipient: { cpfCnpj: cpf },
        })
        .expect(201);

      const outboxId = sendResponse.body.outboxId;

      // Buscar email
      const getResponse = await request(app.getHttpServer())
        .get(`/v1/emails/${outboxId}`)
        .set('x-api-key', apiKey)
        .expect(200);

      const body = JSON.stringify(getResponse.body);

      // Verificar que CPF não aparece em nenhum lugar
      expect(body).not.toContain(cpf);
      expect(body).not.toContain('cpfCnpj');
      expect(body).not.toContain('cpfCnpjEnc');
      expect(body).not.toContain('cpfCnpjSalt');
    });

    it('should not return encrypted fields in GET /v1/emails', async () => {
      await request(app.getHttpServer())
        .post('/v1/email/send')
        .set('x-api-key', apiKey)
        .send({
          to: 'test@example.com',
          subject: 'Test',
          html: '<p>Test</p>',
          recipient: { cpfCnpj: '12345678901' },
        })
        .expect(201);

      const response = await request(app.getHttpServer())
        .get('/v1/emails')
        .set('x-api-key', apiKey)
        .expect(200);

      const body = JSON.stringify(response.body);

      expect(body).not.toContain('cpfCnpjEnc');
      expect(body).not.toContain('cpfCnpjSalt');
      expect(body).not.toContain('12345678901');
    });
  });

  describe('Search by CPF hash', () => {
    it('should find recipients by CPF hash', async () => {
      const cpf = '12345678901';

      await request(app.getHttpServer())
        .post('/v1/email/send')
        .set('x-api-key', apiKey)
        .send({
          to: 'test@example.com',
          subject: 'Test',
          html: '<p>Test</p>',
          recipient: { cpfCnpj: cpf },
        })
        .expect(201);

      // Buscar usando hash
      const hash = hashCpfCnpjSha256(cpf);
      const found = await prisma.recipient.findFirst({
        where: { cpfCnpjHash: hash },
      });

      expect(found).toBeDefined();
      expect(found.email).toBe('test@example.com');
    });

    it('should not find recipient with wrong CPF', async () => {
      await request(app.getHttpServer())
        .post('/v1/email/send')
        .set('x-api-key', apiKey)
        .send({
          to: 'test@example.com',
          subject: 'Test',
          html: '<p>Test</p>',
          recipient: { cpfCnpj: '12345678901' },
        })
        .expect(201);

      // Buscar com CPF diferente
      const wrongHash = hashCpfCnpjSha256('99999999999');
      const found = await prisma.recipient.findFirst({
        where: { cpfCnpjHash: wrongHash },
      });

      expect(found).toBeNull();
    });
  });

  describe('Error cases', () => {
    it('should handle emails without CPF/CNPJ', async () => {
      const response = await request(app.getHttpServer())
        .post('/v1/email/send')
        .set('x-api-key', apiKey)
        .send({
          to: 'test@example.com',
          subject: 'Test',
          html: '<p>Test</p>',
        })
        .expect(201);

      const recipient = await prisma.recipient.findFirst({
        where: { email: 'test@example.com' },
      });

      expect(recipient.cpfCnpjEnc).toBeNull();
      expect(recipient.cpfCnpjSalt).toBeNull();
      expect(recipient.cpfCnpjHash).toBeNull();
    });
  });
});
```

**Rodar testes E2E:**

```bash
cd apps/api
npm run test:e2e recipient-encryption.e2e-spec.ts

# Com ambiente de teste isolado
NODE_ENV=test npm run test:e2e
```

**Setup de database para testes (package.json):**

```json
"scripts": {
  "test:e2e": "jest --config ./test/jest-e2e.json",
  "test:e2e:watch": "jest --config ./test/jest-e2e.json --watch",
  "pretest:e2e": "npm run test:db:reset",
  "test:db:reset": "DATABASE_URL=$DATABASE_TEST_URL npx prisma migrate reset --force --skip-generate"
}
```

## Categoria
**Testes - End-to-End**

## Bloqueador para Produção?
**NÃO** - Mas fortemente recomendado. Valida fluxo completo de segurança.
