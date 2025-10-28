/**
 * TASK-022: Type Utilities for Test Safety
 *
 * Type-safe utilities for common TypeScript patterns in tests
 */

import { z } from 'zod';

/**
 * Type utility to access private properties in tests
 *
 * @example
 * ```typescript
 * const queue = getPrivate(service, 'queue') as Queue;
 * ```
 */
export function getPrivate<T, K extends keyof T>(
  obj: T,
  key: K
): T[K] {
  return (obj as any)[key];
}

/**
 * Type-safe JSON.parse with Zod validation
 *
 * @example
 * ```typescript
 * const schema = z.object({ id: z.string() });
 * const parsed = parseJSON(jsonString, schema);
 * ```
 */
export function parseJSON<T>(
  jsonString: string,
  schema: z.ZodSchema<T>
): T {
  const parsed: unknown = JSON.parse(jsonString);
  return schema.parse(parsed);
}

/**
 * Type guard for objects with specific keys
 *
 * @example
 * ```typescript
 * if (hasKey(obj, 'field')) {
 *   console.log(obj.field); // Type-safe
 * }
 * ```
 */
export function hasKey<K extends string>(
  obj: unknown,
  key: K
): obj is Record<K, unknown> {
  return typeof obj === 'object' && obj !== null && key in obj;
}

/**
 * Type guard for non-null values
 *
 * @example
 * ```typescript
 * const items = [1, null, 3].filter(isNotNull); // Type: number[]
 * ```
 */
export function isNotNull<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}

/**
 * Type guard for error objects
 *
 * @example
 * ```typescript
 * try {
 *   // code
 * } catch (error) {
 *   if (isError(error)) {
 *     console.log(error.message); // Type-safe
 *   }
 * }
 * ```
 */
export function isError(error: unknown): error is Error {
  return error instanceof Error;
}

/**
 * Type utility for mocking classes in tests
 *
 * @example
 * ```typescript
 * type MockedService = MockedClass<EmailService>;
 * const mockService: MockedService = {
 *   sendEmail: jest.fn(),
 *   // ... other mocked methods
 * };
 * ```
 */
export type MockedClass<T> = {
  [K in keyof T]: T[K] extends (...args: infer Args) => infer Return
    ? jest.MockedFunction<(...args: Args) => Return>
    : T[K];
};

/**
 * Type-safe Partial for deep nested objects
 *
 * @example
 * ```typescript
 * type Config = { db: { host: string; port: number } };
 * const partial: DeepPartial<Config> = { db: { host: 'localhost' } };
 * ```
 */
export type DeepPartial<T> = T extends object
  ? {
      [P in keyof T]?: DeepPartial<T[P]>;
    }
  : T;

/**
 * Extract keys from object that match a specific type
 *
 * @example
 * ```typescript
 * type User = { name: string; age: number; active: boolean };
 * type StringKeys = KeysOfType<User, string>; // 'name'
 * ```
 */
export type KeysOfType<T, U> = {
  [K in keyof T]: T[K] extends U ? K : never;
}[keyof T];

/**
 * Make specific properties required
 *
 * @example
 * ```typescript
 * type User = { name?: string; email?: string };
 * type UserWithName = RequireFields<User, 'name'>; // { name: string; email?: string }
 * ```
 */
export type RequireFields<T, K extends keyof T> = T & Required<Pick<T, K>>;
