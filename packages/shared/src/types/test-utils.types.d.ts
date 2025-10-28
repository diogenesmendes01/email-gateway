import { z } from 'zod';
export declare function getPrivate<T, K extends keyof T>(obj: T, key: K): T[K];
export declare function parseJSON<T>(jsonString: string, schema: z.ZodSchema<T>): T;
export declare function hasKey<K extends string>(obj: unknown, key: K): obj is Record<K, unknown>;
export declare function isNotNull<T>(value: T | null | undefined): value is T;
export declare function isError(error: unknown): error is Error;
export type MockedClass<T> = {
    [K in keyof T]: T[K] extends (...args: infer Args) => infer Return ? jest.MockedFunction<(...args: Args) => Return> : T[K];
};
export type DeepPartial<T> = T extends object ? {
    [P in keyof T]?: DeepPartial<T[P]>;
} : T;
export type KeysOfType<T, U> = {
    [K in keyof T]: T[K] extends U ? K : never;
}[keyof T];
export type RequireFields<T, K extends keyof T> = T & Required<Pick<T, K>>;
