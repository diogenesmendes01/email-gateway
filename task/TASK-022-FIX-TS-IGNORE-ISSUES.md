# TASK-022 — Corrigir Issues com @ts-ignore (Code Quality - Priority 1)

## Contexto
- Origem: Análise de arquitetura - Sistema 75% completo
- Resumo: Codebase contém múltiplos `@ts-ignore` e `@ts-expect-error` que desabilitam verificação de tipos do TypeScript. Isso mascara bugs potenciais e reduz confiabilidade do código.

## O que precisa ser feito
- [ ] Encontrar todos os `@ts-ignore` e `@ts-expect-error` no codebase
- [ ] Analisar cada ocorrência e documentar motivo
- [ ] Corrigir type safety onde possível (adicionar tipos corretos)
- [ ] Substituir `@ts-ignore` por `@ts-expect-error` (melhor prática)
- [ ] Adicionar comentários explicativos obrigatórios
- [ ] Configurar ESLint para proibir `@ts-ignore` sem comentário
- [ ] Criar tipo utilities para casos complexos
- [ ] Documentar casos legítimos que precisam de bypass

## Urgência
- **Nível (1–5):** 4 (ALTO - Code Quality + Security)

## Responsável sugerido
- Backend + Tech Lead

## Dependências / Riscos
- Dependências:
  - TypeScript (já instalado)
  - ESLint (já instalado)
- Riscos:
  - MÉDIO: Remover @ts-ignore pode revelar bugs reais
  - Corrigir tipos pode quebrar testes existentes
  - Algumas bibliotecas third-party têm tipos ruins (legítimo usar @ts-expect-error)

## Detalhes Técnicos

### 1. Encontrar todas as ocorrências

```bash
# Buscar @ts-ignore no codebase
grep -r "@ts-ignore" apps/ packages/ --include="*.ts" --include="*.tsx"

# Buscar @ts-expect-error
grep -r "@ts-expect-error" apps/ packages/ --include="*.ts" --include="*.tsx"

# Contar ocorrências
grep -r "@ts-ignore" apps/ packages/ --include="*.ts" --include="*.tsx" | wc -l
```

### 2. Categorizar ocorrências comuns

**Categoria 1: Acesso a propriedades privadas em testes**

❌ **Errado:**
```typescript
// @ts-ignore - acessa private
const queue = service.queue;
```

✅ **Correto:**
```typescript
// Access private property for testing purposes
// Type assertion is safe here because we control the test environment
const queue = (service as any).queue as Queue;

// OR criar helper no test
type ServiceWithPrivates = {
  queue: Queue;
};

const queue = (service as unknown as ServiceWithPrivates).queue;
```

**Categoria 2: Tipos incompletos de bibliotecas third-party**

❌ **Errado:**
```typescript
// @ts-ignore - biblioteca não tem tipos
import something from 'some-package';
```

✅ **Correto:**
```typescript
// @ts-expect-error - 'some-package' has incomplete type definitions
// TODO: Create .d.ts file or contribute types to DefinitelyTyped
import something from 'some-package';

// OR criar arquivo de tipos
// types/some-package.d.ts
declare module 'some-package' {
  export function something(): void;
}
```

**Categoria 3: Type narrowing complexo**

❌ **Errado:**
```typescript
// @ts-ignore - TypeScript não entende este narrowing
const result = data.field;
```

✅ **Correto:**
```typescript
// Type guard para narrowing seguro
function hasField(obj: unknown): obj is { field: string } {
  return typeof obj === 'object' && obj !== null && 'field' in obj;
}

if (hasField(data)) {
  const result = data.field; // Type-safe
}
```

**Categoria 4: JSON.parse com tipo desconhecido**

❌ **Errado:**
```typescript
// @ts-ignore - JSON.parse retorna any
const parsed = JSON.parse(jsonString);
```

✅ **Correto:**
```typescript
import { z } from 'zod';

const schema = z.object({
  id: z.string(),
  name: z.string(),
});

const parsed: unknown = JSON.parse(jsonString);
const validated = schema.parse(parsed); // Type-safe + runtime validation
```

### 3. Configurar ESLint para proibir @ts-ignore sem comentário

**Arquivo:** `.eslintrc.js` (adicionar)

```javascript
module.exports = {
  rules: {
    // Proibir @ts-ignore sem comentário explicativo
    '@typescript-eslint/ban-ts-comment': [
      'error',
      {
        'ts-expect-error': {
          descriptionFormat: '^\\s*\\S.*$', // Require non-empty description
        },
        'ts-ignore': true, // Sempre proibir @ts-ignore
        'ts-nocheck': true,
        'ts-check': false,
        minimumDescriptionLength: 10,
      },
    ],

    // Preferir @ts-expect-error sobre @ts-ignore
    '@typescript-eslint/prefer-ts-expect-error': 'error',

    // Proibir any explícito sem comentário
    '@typescript-eslint/no-explicit-any': [
      'error',
      {
        ignoreRestArgs: true,
      },
    ],
  },
};
```

### 4. Criar type utilities para casos comuns

**Arquivo:** `packages/shared/src/types/test-utils.types.ts`

```typescript
/**
 * Type utility para acessar propriedades privadas em testes
 *
 * @example
 * const queue = getPrivate(service, 'queue') as Queue;
 */
export function getPrivate<T, K extends keyof T>(
  obj: T,
  key: K
): T[K] {
  return (obj as any)[key];
}

/**
 * Type-safe JSON.parse com validação Zod
 */
export function parseJSON<T>(
  jsonString: string,
  schema: z.ZodSchema<T>
): T {
  const parsed: unknown = JSON.parse(jsonString);
  return schema.parse(parsed);
}

/**
 * Type guard genérico para objetos com campos específicos
 */
export function hasKey<K extends string>(
  obj: unknown,
  key: K
): obj is Record<K, unknown> {
  return typeof obj === 'object' && obj !== null && key in obj;
}

/**
 * Type utility para mock de classes em testes
 */
export type MockedClass<T> = {
  [K in keyof T]: T[K] extends (...args: any[]) => any
    ? jest.MockedFunction<T[K]>
    : T[K];
};
```

### 5. Casos legítimos que precisam de @ts-expect-error

**Arquivo:** `docs/TYPESCRIPT-EXCEPTIONS.md`

```markdown
# TypeScript Type-Safety Exceptions

## Quando usar @ts-expect-error (casos legítimos)

### 1. Bibliotecas Third-Party com Tipos Incompletos

```typescript
// @ts-expect-error - aws-sdk v2 has incomplete type definitions for this method
// TODO: Migrate to aws-sdk v3 which has complete types
const result = await s3.getSignedUrlPromise('getObject', params);
```

### 2. Testes que Verificam Comportamento de Erro

```typescript
describe('Validation', () => {
  it('should reject invalid input', () => {
    // @ts-expect-error - Intentionally passing wrong type to test validation
    expect(() => validateEmail(123)).toThrow();
  });
});
```

### 3. Mock de Dependências Complexas

```typescript
const mockService = {
  // @ts-expect-error - Partial mock for testing, other methods not needed
  sendEmail: jest.fn(),
} as EmailService;
```

### 4. Workarounds Temporários (DEVE ter ticket)

```typescript
// @ts-expect-error - TEMPORARY: Prisma generated types incorrect for JSON field
// TODO: Fix in TASK-XXX after Prisma 6.0 upgrade
const config = domain.warmupConfig as WarmupConfig;
```

## Proibido (usar alternativas)

❌ **@ts-ignore** - Nunca usar, sempre preferir @ts-expect-error

❌ **any explícito** - Usar unknown + type guards

❌ **as any** - Criar type assertions específicas
```

### 6. Script para auditoria automática

**Arquivo:** `scripts/audit-type-safety.ts`

```typescript
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

interface TypeSafetyIssue {
  file: string;
  line: number;
  type: 'ts-ignore' | 'ts-expect-error' | 'any';
  hasDescription: boolean;
  description?: string;
}

function findTypeSafetyIssues(): TypeSafetyIssue[] {
  const issues: TypeSafetyIssue[] = [];

  // Find all TypeScript files
  const tsFiles = execSync(
    'find apps packages -name "*.ts" -o -name "*.tsx"',
    { encoding: 'utf-8' }
  )
    .split('\n')
    .filter(Boolean);

  for (const file of tsFiles) {
    const content = fs.readFileSync(file, 'utf-8');
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Check for @ts-ignore
      if (line.includes('@ts-ignore')) {
        issues.push({
          file,
          line: i + 1,
          type: 'ts-ignore',
          hasDescription: line.includes('-') && line.split('-')[1]?.trim().length > 0,
          description: line.split('-')[1]?.trim(),
        });
      }

      // Check for @ts-expect-error
      if (line.includes('@ts-expect-error')) {
        const hasDesc = line.includes('-') && line.split('-')[1]?.trim().length >= 10;
        issues.push({
          file,
          line: i + 1,
          type: 'ts-expect-error',
          hasDescription: hasDesc,
          description: line.split('-')[1]?.trim(),
        });
      }
    }
  }

  return issues;
}

function generateReport(issues: TypeSafetyIssue[]) {
  console.log('=== Type Safety Audit Report ===\n');

  const tsIgnoreCount = issues.filter((i) => i.type === 'ts-ignore').length;
  const tsExpectErrorCount = issues.filter((i) => i.type === 'ts-expect-error').length;
  const noDescCount = issues.filter((i) => !i.hasDescription).length;

  console.log(`Total issues: ${issues.length}`);
  console.log(`  @ts-ignore: ${tsIgnoreCount} ❌`);
  console.log(`  @ts-expect-error: ${tsExpectErrorCount}`);
  console.log(`  Without description: ${noDescCount} ⚠️\n`);

  // Group by file
  const byFile = issues.reduce((acc, issue) => {
    if (!acc[issue.file]) acc[issue.file] = [];
    acc[issue.file].push(issue);
    return acc;
  }, {} as Record<string, TypeSafetyIssue[]>);

  console.log('=== Issues by File ===\n');
  for (const [file, fileIssues] of Object.entries(byFile)) {
    console.log(`${file}:`);
    for (const issue of fileIssues) {
      const icon = issue.type === 'ts-ignore' ? '❌' : issue.hasDescription ? '✅' : '⚠️';
      console.log(`  Line ${issue.line}: ${icon} ${issue.type}`);
      if (issue.description) {
        console.log(`    → ${issue.description}`);
      }
    }
    console.log();
  }

  // Exit with error if ts-ignore found
  if (tsIgnoreCount > 0) {
    console.error('❌ Found @ts-ignore directives. Please replace with @ts-expect-error.');
    process.exit(1);
  }

  // Exit with warning if missing descriptions
  if (noDescCount > 0) {
    console.warn('⚠️  Found @ts-expect-error without description. Please add explanations.');
    process.exit(1);
  }

  console.log('✅ All type safety checks passed!');
}

// Run audit
const issues = findTypeSafetyIssues();
generateReport(issues);
```

### 7. Adicionar ao CI/CD

**Arquivo:** `.github/workflows/type-safety.yml`

```yaml
name: Type Safety Audit

on:
  pull_request:
    branches: [main, develop]
  push:
    branches: [main]

jobs:
  audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '20'

      - name: Install dependencies
        run: npm ci

      - name: Run type safety audit
        run: npm run audit:type-safety

      - name: TypeScript strict check
        run: npm run typecheck
```

**Adicionar script ao package.json:**

```json
{
  "scripts": {
    "audit:type-safety": "ts-node scripts/audit-type-safety.ts",
    "typecheck": "tsc --noEmit --strict"
  }
}
```

### 8. Checklist de correção

Para cada `@ts-ignore` ou `@ts-expect-error` encontrado:

1. ✅ **Pode ser removido?**
   - Adicionar tipos corretos
   - Usar type guards
   - Usar Zod para validação runtime

2. ❌ **Não pode ser removido?**
   - Substituir `@ts-ignore` por `@ts-expect-error`
   - Adicionar comentário explicativo (>10 caracteres)
   - Criar ticket para resolver no futuro
   - Documentar em TYPESCRIPT-EXCEPTIONS.md

3. ✅ **Verificar testes**
   - Garantir que remoção não quebra testes
   - Adicionar testes se necessário

## Categoria
**Code Quality - Type Safety**

## Bloqueador para Produção?
**NÃO - Mas alta prioridade**

Manter `@ts-ignore`:
- ⚠️ Mascara bugs potenciais
- ⚠️ Reduz confiança no TypeScript
- ⚠️ Dificulta refactoring seguro
- ⚠️ Code review menos efetivo

**Recomendação:** Implementar antes de deploy em produção para garantir code quality.

**Benefícios da correção:**
- ✅ TypeScript pode detectar bugs em compile-time
- ✅ IDE autocomplete e refactoring funcionam melhor
- ✅ Code review mais efetivo
- ✅ Reduz runtime errors em produção
