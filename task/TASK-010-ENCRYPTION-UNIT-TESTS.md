# TASK-010 — Testes Unitários de Criptografia no EmailSendService (Testes)

## Contexto
- Origem: PR-BACKLOG (PR18-TASK-8.1-01)
- Resumo: Integração de criptografia em `email-send.service.ts` não possui testes unitários. Funções utilitárias têm 100% de cobertura, mas integração no serviço não está testada

## O que precisa ser feito
- [ ] Criar `apps/api/src/modules/email/services/__tests__/email-send.service.encryption.spec.ts`
- [ ] Testar `getEncryptionKey()` validation
- [ ] Testar `decryptCpfCnpj()` com inputs válidos/inválidos
- [ ] Testar integração na criação de recipients com CPF/CNPJ
- [ ] Testar error handling quando `ENCRYPTION_KEY` inválida
- [ ] Garantir cobertura >= 80% para serviços

## Urgência
- **Nível (1–5):** 3 (MODERADO - Qualidade)

## Responsável sugerido
- Backend

## Dependências / Riscos
- Dependências: jest, @nestjs/testing (já disponíveis)
- Riscos:
  - Baixo: Apenas testes, não afeta produção
  - Melhora confiança no código de criptografia

## Detalhes Técnicos

**Criar arquivo:** `apps/api/src/modules/email/services/__tests__/email-send.service.encryption.spec.ts`

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { EmailSendService } from '../email-send.service';
import { PrismaService } from '../../../../prisma/prisma.service';
import {
  encryptCpfCnpj,
  decryptCpfCnpj,
  hashCpfCnpjSha256
} from '@email-gateway/shared';

describe('EmailSendService - Encryption Integration', () => {
  let service: EmailSendService;
  let prisma: PrismaService;

  const originalEnv = process.env;

  beforeEach(async () => {
    jest.resetModules();
    process.env = { ...originalEnv };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmailSendService,
        {
          provide: PrismaService,
          useValue: {
            recipient: {
              create: jest.fn(),
              findUnique: jest.fn(),
            },
            emailOutbox: {
              create: jest.fn(),
            },
          },
        },
      ],
    }).compile();

    service = module.get<EmailSendService>(EmailSendService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('getEncryptionKey', () => {
    it('should throw error if ENCRYPTION_KEY not set', () => {
      delete process.env.ENCRYPTION_KEY;

      expect(() => service['getEncryptionKey']()).toThrow(
        'ENCRYPTION_KEY must be set in environment variables'
      );
    });

    it('should throw error if ENCRYPTION_KEY too short', () => {
      process.env.ENCRYPTION_KEY = 'short';

      expect(() => service['getEncryptionKey']()).toThrow(
        'ENCRYPTION_KEY must be at least 32 characters'
      );
    });

    it('should return key if valid', () => {
      const validKey = 'a'.repeat(32);
      process.env.ENCRYPTION_KEY = validKey;

      expect(service['getEncryptionKey']()).toBe(validKey);
    });

    it('should return key if longer than 32 chars', () => {
      const validKey = 'x7K9mP2vN8qR4tY6wE3sA5dF1gH0jL9zU4vB7nM3kP8w';
      process.env.ENCRYPTION_KEY = validKey;

      expect(service['getEncryptionKey']()).toBe(validKey);
    });
  });

  describe('decryptCpfCnpj', () => {
    const testKey = 'testkey12345678901234567890123'; // 32 chars

    beforeEach(() => {
      process.env.ENCRYPTION_KEY = testKey;
    });

    it('should decrypt valid encrypted CPF/CNPJ', () => {
      const cpf = '12345678901';
      const { encrypted, salt } = encryptCpfCnpj(cpf, testKey);

      const decrypted = service['decryptCpfCnpj'](encrypted, salt);

      expect(decrypted).toBe(cpf);
    });

    it('should decrypt CNPJ (14 digits)', () => {
      const cnpj = '12345678000190';
      const { encrypted, salt } = encryptCpfCnpj(cnpj, testKey);

      const decrypted = service['decryptCpfCnpj'](encrypted, salt);

      expect(decrypted).toBe(cnpj);
    });

    it('should throw error with wrong key', () => {
      const cpf = '12345678901';
      const { encrypted, salt } = encryptCpfCnpj(cpf, 'wrongkey1234567890123456789012');

      expect(() => service['decryptCpfCnpj'](encrypted, salt)).toThrow();
    });

    it('should throw error with corrupted encrypted data', () => {
      const { salt } = encryptCpfCnpj('12345678901', testKey);
      const corruptedData = 'corrupted:data:here';

      expect(() => service['decryptCpfCnpj'](corruptedData, salt)).toThrow(
        'Failed to decrypt sensitive data'
      );
    });

    it('should throw error with wrong salt', () => {
      const cpf = '12345678901';
      const { encrypted } = encryptCpfCnpj(cpf, testKey);
      const wrongSalt = 'wrongsalt123';

      expect(() => service['decryptCpfCnpj'](encrypted, wrongSalt)).toThrow();
    });
  });

  describe('createRecipient - with CPF/CNPJ encryption', () => {
    const testKey = 'testkey12345678901234567890123';
    const companyId = 'company-123';

    beforeEach(() => {
      process.env.ENCRYPTION_KEY = testKey;
    });

    it('should encrypt and hash CPF/CNPJ when creating recipient', async () => {
      const cpf = '12345678901';
      const email = 'test@example.com';

      prisma.recipient.create = jest.fn().mockResolvedValue({
        id: 'recipient-123',
        email,
        cpfCnpjEnc: 'encrypted-data',
        cpfCnpjSalt: 'salt',
        cpfCnpjHash: 'hash',
      });

      const dto = {
        email,
        cpfCnpj: cpf,
      };

      await service['createRecipient'](dto, companyId, 'request-123');

      // Verificar que create foi chamado
      expect(prisma.recipient.create).toHaveBeenCalled();

      const createCall = (prisma.recipient.create as jest.Mock).mock.calls[0][0];
      const data = createCall.data;

      // Verificar que campos de criptografia foram preenchidos
      expect(data.cpfCnpjEnc).toBeDefined();
      expect(data.cpfCnpjSalt).toBeDefined();
      expect(data.cpfCnpjHash).toBeDefined();

      // Verificar que hash está correto
      const expectedHash = hashCpfCnpjSha256(cpf);
      expect(data.cpfCnpjHash).toBe(expectedHash);

      // Verificar que encrypted não é plaintext
      expect(data.cpfCnpjEnc).not.toBe(cpf);

      // Verificar que descriptografia funciona
      const decrypted = decryptCpfCnpj(
        data.cpfCnpjEnc,
        testKey,
        data.cpfCnpjSalt
      );
      expect(decrypted).toBe(cpf);
    });

    it('should handle recipient without CPF/CNPJ', async () => {
      const email = 'test@example.com';

      prisma.recipient.create = jest.fn().mockResolvedValue({
        id: 'recipient-123',
        email,
        cpfCnpjEnc: null,
        cpfCnpjSalt: null,
        cpfCnpjHash: null,
      });

      const dto = { email };

      await service['createRecipient'](dto, companyId, 'request-123');

      const createCall = (prisma.recipient.create as jest.Mock).mock.calls[0][0];
      const data = createCall.data;

      // Verificar que campos de criptografia NÃO foram preenchidos
      expect(data.cpfCnpjEnc).toBeUndefined();
      expect(data.cpfCnpjSalt).toBeUndefined();
      expect(data.cpfCnpjHash).toBeUndefined();
    });

    it('should generate unique salt for each recipient with same CPF', async () => {
      const cpf = '12345678901';

      prisma.recipient.create = jest.fn()
        .mockResolvedValueOnce({ id: 'recipient-1' })
        .mockResolvedValueOnce({ id: 'recipient-2' });

      await service['createRecipient'](
        { email: 'user1@example.com', cpfCnpj: cpf },
        companyId,
        'request-1'
      );

      await service['createRecipient'](
        { email: 'user2@example.com', cpfCnpj: cpf },
        companyId,
        'request-2'
      );

      const call1 = (prisma.recipient.create as jest.Mock).mock.calls[0][0].data;
      const call2 = (prisma.recipient.create as jest.Mock).mock.calls[1][0].data;

      // Salts devem ser diferentes
      expect(call1.cpfCnpjSalt).not.toBe(call2.cpfCnpjSalt);

      // Encrypted values devem ser diferentes
      expect(call1.cpfCnpjEnc).not.toBe(call2.cpfCnpjEnc);

      // Mas hashes devem ser iguais (para busca)
      expect(call1.cpfCnpjHash).toBe(call2.cpfCnpjHash);
    });

    it('should throw error if encryption fails', async () => {
      // Simular falha de criptografia com key inválida
      delete process.env.ENCRYPTION_KEY;

      const dto = {
        email: 'test@example.com',
        cpfCnpj: '12345678901',
      };

      await expect(
        service['createRecipient'](dto, companyId, 'request-123')
      ).rejects.toThrow();
    });
  });

  describe('Error handling edge cases', () => {
    const testKey = 'testkey12345678901234567890123';

    beforeEach(() => {
      process.env.ENCRYPTION_KEY = testKey;
    });

    it('should handle empty CPF/CNPJ gracefully', async () => {
      prisma.recipient.create = jest.fn().mockResolvedValue({
        id: 'recipient-123',
        email: 'test@example.com',
      });

      await service['createRecipient'](
        { email: 'test@example.com', cpfCnpj: '' },
        'company-123',
        'request-123'
      );

      const createCall = (prisma.recipient.create as jest.Mock).mock.calls[0][0];

      // CPF vazio não deve gerar dados de criptografia
      expect(createCall.data.cpfCnpjEnc).toBeUndefined();
    });

    it('should handle null CPF/CNPJ', async () => {
      prisma.recipient.create = jest.fn().mockResolvedValue({
        id: 'recipient-123',
        email: 'test@example.com',
      });

      await service['createRecipient'](
        { email: 'test@example.com', cpfCnpj: null },
        'company-123',
        'request-123'
      );

      const createCall = (prisma.recipient.create as jest.Mock).mock.calls[0][0];

      expect(createCall.data.cpfCnpjEnc).toBeUndefined();
    });
  });
});
```

**Rodar testes:**

```bash
cd apps/api
npm test -- email-send.service.encryption.spec.ts

# Com coverage
npm test -- --coverage --testPathPattern=email-send.service.encryption
```

**Adicionar ao coverage threshold (package.json):**

```json
"jest": {
  "coverageThreshold": {
    "global": {
      "branches": 70,
      "functions": 70,
      "lines": 70,
      "statements": 70
    },
    "./src/modules/email/services/": {
      "branches": 80,
      "functions": 80,
      "lines": 80,
      "statements": 80
    }
  }
}
```

## Categoria
**Testes - Qualidade de Código**

## Bloqueador para Produção?
**NÃO** - Mas recomendado. Aumenta confiança no código de segurança.
