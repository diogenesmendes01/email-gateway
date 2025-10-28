# TypeScript Type-Safety Exceptions

**TASK-022: Documentation for legitimate @ts-expect-error usage**

This document describes when and how to use `@ts-expect-error` in our codebase. The goal is to maintain strict type safety while documenting legitimate exceptions.

## Policy

- **NEVER use `@ts-ignore`** - It silently ignores all TypeScript errors
- **Always use `@ts-expect-error`** - It fails if the error is fixed, preventing stale suppressions
- **Always add a description** - Minimum 10 characters explaining WHY it's needed
- **Create a ticket for workarounds** - Temporary fixes must have a plan to be properly resolved

## Legitimate Use Cases

### 1. Third-Party Libraries with Incomplete Types

When external libraries have missing or incorrect type definitions:

```typescript
// @ts-expect-error - aws-sdk v2 has incomplete type definitions for getSignedUrlPromise
// TODO: Migrate to aws-sdk v3 which has complete types (TASK-XXX)
const signedUrl = await s3.getSignedUrlPromise('getObject', params);
```

**Alternative (Better):** Create a type definition file:

```typescript
// types/aws-sdk.d.ts
declare module 'aws-sdk' {
  interface S3 {
    getSignedUrlPromise(operation: string, params: any): Promise<string>;
  }
}
```

### 2. Tests Verifying Error Behavior

When intentionally passing invalid types to test validation logic:

```typescript
describe('Email validation', () => {
  it('should reject non-string emails', () => {
    // @ts-expect-error - Intentionally passing invalid type to test runtime validation
    expect(() => validateEmail(123)).toThrow('Email must be a string');
  });

  it('should reject null values', () => {
    // @ts-expect-error - Testing null handling at runtime
    expect(() => processEmail(null)).toThrow();
  });
});
```

### 3. Partial Mocks in Tests

When creating simplified mocks that don't need all methods:

```typescript
// Prefer using MockedClass utility from @email-gateway/shared
import { MockedClass } from '@email-gateway/shared';

// ✅ Better: Use utility type
const mockService: MockedClass<EmailService> = {
  sendEmail: jest.fn(),
  validateRecipient: jest.fn(),
} as any;

// ⚠️ Only if MockedClass doesn't work:
const mockQueue = {
  // @ts-expect-error - Partial mock for testing; only testing add() method
  add: jest.fn(),
} as Queue;
```

### 4. Temporary Workarounds (MUST have ticket)

When there's a known issue that requires time to fix properly:

```typescript
// @ts-expect-error - TEMPORARY: Prisma generated types incorrect for JSON field with nested objects
// TODO: Fix in TASK-026 after upgrading to Prisma 6.0 with better JSON type inference
const warmupConfig = domain.warmupConfig as WarmupConfig;
```

**Requirements:**
- Must reference a specific TASK number
- Must have a plan to remove it
- Review these regularly (monthly)

### 5. Complex Type Narrowing

When TypeScript's type narrowing doesn't understand complex logic:

```typescript
// ❌ Bad: Using @ts-expect-error as a crutch
function processData(data: unknown) {
  // @ts-expect-error - TypeScript doesn't understand this narrowing
  return data.field;
}

// ✅ Better: Use type guards
function hasField(obj: unknown): obj is { field: string } {
  return typeof obj === 'object' && obj !== null && 'field' in obj;
}

function processData(data: unknown) {
  if (hasField(data)) {
    return data.field; // Type-safe!
  }
  throw new Error('Invalid data structure');
}
```

**Use type utilities from `@email-gateway/shared/types/test-utils.types`:**
- `hasKey(obj, 'field')` - Type guard for object keys
- `isNotNull(value)` - Filter nulls/undefined
- `isError(error)` - Check if value is Error

## Prohibited Patterns

### ❌ Never Use @ts-ignore

```typescript
// ❌ WRONG: @ts-ignore silently ignores all errors
// @ts-ignore
const result = dangerousOperation();

// ✅ CORRECT: @ts-expect-error with description
// @ts-expect-error - Known issue with third-party library types (TASK-XXX)
const result = dangerousOperation();
```

### ❌ Never Use Explicit `any` Without Type Guards

```typescript
// ❌ WRONG: any disables all type checking
function process(data: any) {
  return data.field;
}

// ✅ CORRECT: Use unknown + type guards
function process(data: unknown) {
  if (hasKey(data, 'field')) {
    return data.field; // Type-safe
  }
  throw new Error('Invalid data');
}
```

### ❌ Never Use `as any` as a Shortcut

```typescript
// ❌ WRONG: as any defeats type system
const service = (mockObject as any) as EmailService;

// ✅ CORRECT: Use proper type utilities
import { MockedClass } from '@email-gateway/shared';
const service: MockedClass<EmailService> = {
  sendEmail: jest.fn(),
  // ... other methods
};
```

## Type Utilities Reference

Located in `packages/shared/src/types/test-utils.types.ts`:

### `getPrivate<T, K>(obj: T, key: K): T[K]`
Access private properties in tests safely:
```typescript
const queue = getPrivate(service, 'queue') as Queue;
```

### `parseJSON<T>(jsonString: string, schema: z.ZodSchema<T>): T`
Type-safe JSON parsing with runtime validation:
```typescript
const schema = z.object({ id: z.string() });
const parsed = parseJSON(jsonString, schema);
```

### `hasKey<K>(obj: unknown, key: K): obj is Record<K, unknown>`
Type guard for object keys:
```typescript
if (hasKey(obj, 'field')) {
  console.log(obj.field); // Type-safe
}
```

### `isNotNull<T>(value: T | null | undefined): value is T`
Filter nulls and undefined:
```typescript
const items = [1, null, 3].filter(isNotNull); // Type: number[]
```

### `isError(error: unknown): error is Error`
Type guard for errors in catch blocks:
```typescript
try {
  await operation();
} catch (error) {
  if (isError(error)) {
    console.log(error.message); // Type-safe
  }
}
```

### `MockedClass<T>`
Type utility for Jest mocks:
```typescript
type MockService = MockedClass<EmailService>;
const mock: MockService = {
  sendEmail: jest.fn(),
  // TypeScript ensures all methods are mocked
};
```

### `DeepPartial<T>`
Create partial nested objects:
```typescript
type Config = { db: { host: string; port: number } };
const partial: DeepPartial<Config> = { db: { host: 'localhost' } };
```

### `KeysOfType<T, U>`
Extract keys of specific type:
```typescript
type User = { name: string; age: number; active: boolean };
type StringKeys = KeysOfType<User, string>; // 'name'
```

### `RequireFields<T, K>`
Make specific fields required:
```typescript
type User = { name?: string; email?: string };
type UserWithName = RequireFields<User, 'name'>; // name is required
```

## ESLint Configuration

Our ESLint rules enforce these policies:

```javascript
{
  '@typescript-eslint/ban-ts-comment': ['error', {
    'ts-expect-error': {
      descriptionFormat: '^\\s*\\S.*$',
    },
    'ts-ignore': true, // Always forbidden
    'ts-nocheck': true,
    'ts-check': false,
    minimumDescriptionLength: 10,
  }],
  '@typescript-eslint/prefer-ts-expect-error': 'error',
  '@typescript-eslint/no-explicit-any': ['error', {
    ignoreRestArgs: true,
  }],
}
```

## Audit Process

Run the type safety audit before committing:

```bash
npm run audit:type-safety
```

This script checks:
- ✅ No `@ts-ignore` directives
- ✅ All `@ts-expect-error` have descriptions (≥10 chars)
- ✅ Reports issues by file and line number

## Review Guidelines

### For Authors

Before submitting PR:
1. Run `npm run audit:type-safety`
2. For each `@ts-expect-error`:
   - Try to fix the underlying issue first
   - If impossible, document WHY in the comment
   - Create a TASK ticket for workarounds
3. Use type utilities from `@email-gateway/shared` when possible

### For Reviewers

When reviewing PRs with type exceptions:
1. Check if description explains WHY (not just WHAT)
2. Verify if workarounds have TASK references
3. Suggest using type utilities instead of exceptions
4. Question if exception is truly necessary

## Monthly Maintenance

Every month, review all `@ts-expect-error` instances:

```bash
npm run audit:type-safety
```

For each instance:
- Is it still necessary?
- Can it be removed now?
- Is the ticket still active?
- Is the description still accurate?

## Examples from Our Codebase

### ✅ Good Example (removed)

Previously in `email-send.service.ts`:
```typescript
// @ts-ignore - FIXME: TypeScript not recognizing enqueueEmailJob method
const enqueuedJobId = await this.queueService.enqueueEmailJob(jobData);
```

Fixed by verifying the method exists and removing the comment:
```typescript
// TypeScript correctly infers enqueueEmailJob method
const enqueuedJobId = await this.queueService.enqueueEmailJob(jobData);
```

**Lesson:** Always check if the suppression is actually needed before assuming it is.

## References

- [TypeScript @ts-expect-error vs @ts-ignore](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-3-9.html#-ts-expect-error-comments)
- [ESLint @typescript-eslint/ban-ts-comment](https://typescript-eslint.io/rules/ban-ts-comment/)
- [Zod for Runtime Validation](https://zod.dev/)

## Contact

Questions about type safety? Ask in #engineering Slack channel or review this doc.

---

**Last Updated:** 2025-10-28 (TASK-022)
**Maintained By:** Backend Team
**Review Frequency:** Monthly
