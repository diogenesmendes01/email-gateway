export declare function maskCPF(cpf: string | null | undefined): string;
export declare function maskCNPJ(cnpj: string | null | undefined): string;
export declare function maskCPFOrCNPJ(cpfCnpj: string | null | undefined): string;
export declare function maskEmail(email: string | null | undefined): string;
export declare function maskName(name: string | null | undefined): string;
export declare function maskObject<T extends Record<string, any>>(obj: T, options?: {
    maskNames?: boolean;
    keysToMask?: string[];
}): T;
export declare function normalizeCPFOrCNPJ(cpfCnpj: string | null | undefined): string;
export declare function isValidCPFFormat(cpf: string | null | undefined): boolean;
export declare function isValidCNPJFormat(cnpj: string | null | undefined): boolean;
export declare function hashCPFOrCNPJ(cpfCnpj: string | null | undefined): Promise<string>;
export declare function maskLogString(logString: string): string;
