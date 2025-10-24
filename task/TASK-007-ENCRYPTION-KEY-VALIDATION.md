# TASK-007 — Melhorar Validação de Encryption Key (Segurança)

## Contexto
- Origem: Análise completa do código + PR-BACKLOG
- Resumo: Validação atual apenas verifica comprimento (>= 32 chars). Chaves fracas como "00000000000000000000000000000000" ou "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" passariam na validação

## O que precisa ser feito
- [ ] Adicionar blacklist de padrões fracos
- [ ] Verificar entropia mínima da chave
- [ ] Rejeitar chaves com caracteres repetidos
- [ ] Rejeitar chaves com palavras comuns (changeme, test, example)
- [ ] Adicionar sugestão de comando para gerar chave forte
- [ ] Documentar requisitos de segurança da chave
- [ ] Adicionar testes para validação

## Urgência
- **Nível (1–5):** 2 (IMPORTANTE - Segurança Preventiva)

## Responsável sugerido
- Backend/Segurança

## Dependências / Riscos
- Dependências: Nenhuma
- Riscos:
  - Alto se não implementado: Usuários podem usar chaves fracas
  - Baixo após implementação: Força uso de chaves fortes
  - Nenhum impacto em chaves já em uso

## Detalhes Técnicos

**Criar arquivo:** `apps/api/src/utils/key-validation.ts`

```typescript
export function validateEncryptionKey(key: string): { valid: boolean; error?: string } {
  // 1. Length check
  if (key.length < 32) {
    return {
      valid: false,
      error: 'ENCRYPTION_KEY must be at least 32 characters (256 bits)'
    };
  }

  // 2. Blacklist weak patterns
  const weakPatterns = [
    /^(.)\1+$/,                    // All same character (e.g., "aaaa...")
    /^0+$/,                        // All zeros
    /^(0123456789abcdef)+$/,       // Sequential hex
    /changeme|example|test|demo|password|secret/i, // Common placeholder words
  ];

  for (const pattern of weakPatterns) {
    if (pattern.test(key)) {
      return {
        valid: false,
        error: 'ENCRYPTION_KEY appears to be weak or a placeholder. Use a cryptographically random key.'
      };
    }
  }

  // 3. Entropy check (simplified)
  const uniqueChars = new Set(key).size;
  if (uniqueChars < 16) {
    return {
      valid: false,
      error: 'ENCRYPTION_KEY has insufficient entropy (too few unique characters). Need at least 16 unique characters.'
    };
  }

  // 4. Check for sequential patterns
  const hasSequential = /(?:abc|123|xyz|789|012)/i.test(key);
  if (hasSequential && key.length < 48) {
    return {
      valid: false,
      error: 'ENCRYPTION_KEY contains sequential patterns. Use a truly random key.'
    };
  }

  return { valid: true };
}
```

**Usar no startup (`apps/api/src/main.ts`):**

```typescript
import { validateEncryptionKey } from './utils/key-validation';

async function bootstrap() {
  // ... outras validações

  // Validate encryption key
  const encryptionKey = process.env.ENCRYPTION_KEY;
  if (!encryptionKey) {
    logger.error('❌ ENCRYPTION_KEY environment variable is not set');
    logger.error('Generate a strong key with: openssl rand -base64 32');
    process.exit(1);
  }

  const validation = validateEncryptionKey(encryptionKey);
  if (!validation.valid) {
    logger.error(`❌ ${validation.error}`);
    logger.error('');
    logger.error('Generate a strong key with:');
    logger.error('  openssl rand -base64 32');
    logger.error('');
    logger.error('Or use Node.js:');
    logger.error('  node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'base64\'))"');
    process.exit(1);
  }

  logger.log('✅ Encryption key validation passed');

  // ... resto do bootstrap
}
```

**Testes:**

```typescript
describe('validateEncryptionKey', () => {
  it('should reject keys shorter than 32 characters', () => {
    const result = validateEncryptionKey('short');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('at least 32 characters');
  });

  it('should reject all-same-character keys', () => {
    const result = validateEncryptionKey('a'.repeat(32));
    expect(result.valid).toBe(false);
    expect(result.error).toContain('weak or a placeholder');
  });

  it('should reject sequential patterns', () => {
    const result = validateEncryptionKey('0123456789abcdef0123456789abcdef');
    expect(result.valid).toBe(false);
  });

  it('should reject keys with common words', () => {
    const result = validateEncryptionKey('changeme12345678901234567890');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('weak or a placeholder');
  });

  it('should reject keys with low entropy', () => {
    const result = validateEncryptionKey('aAbBcCdDeEfFgGhHiIjJkKlLmMnNoOpP');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('insufficient entropy');
  });

  it('should accept strong random key from openssl', () => {
    // Example of real key from: openssl rand -base64 32
    const strongKey = 'x7K9mP2vN8qR4tY6wE3sA5dF1gH0jL9zU4vB7nM3kP8w';
    const result = validateEncryptionKey(strongKey);
    expect(result.valid).toBe(true);
  });

  it('should accept key with high entropy', () => {
    const strongKey = 'Kj8#mNq2$pLs9*xRt4&vWz7!bFy3@gHc5';
    const result = validateEncryptionKey(strongKey);
    expect(result.valid).toBe(true);
  });
});
```

**Documentação (.env.example):**

```bash
# ENCRYPTION_KEY - Chave para criptografia AES-256-CBC de dados sensíveis (CPF/CNPJ)
# IMPORTANTE:
# - Deve ter pelo menos 32 caracteres (256 bits)
# - Deve ser criptograficamente aleatória
# - NUNCA use valores como "changeme", "test", "00000...", "aaaa..."
# - Gere com: openssl rand -base64 32
# - Ou com Node: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
# - NUNCA commite a chave real no git
ENCRYPTION_KEY=<GERAR_COM_OPENSSL_RAND>
```

## Categoria
**Segurança - Preventivo**

## Bloqueador para Produção?
**NÃO** - Mas fortemente recomendado. Previne configurações inseguras.
