export interface RetentionConfig {
    emailLogsMonths: number;
    emailEventsMonths: number;
    emailOutboxMonths: number;
    recipientsMonths: number;
}
export declare const DEFAULT_RETENTION_CONFIG: RetentionConfig;
export declare function calculateExpirationDate(months: number): Date | null;
export declare function shouldExpireRecord(createdAt: Date, retentionMonths: number): boolean;
export declare function generateCleanupQuery(tableName: string, retentionMonths: number, createdAtColumn?: string): string;
export declare function generatePseudonymizationQuery(tableName: string, retentionMonths: number, createdAtColumn?: string): string;
export interface TableCleanupConfig {
    tableName: string;
    retentionMonths: number;
    createdAtColumn?: string;
    pseudonymizeBeforeDelete?: boolean;
}
export declare function generateCleanupQueries(configs: TableCleanupConfig[]): string[];
export declare const EMAIL_SYSTEM_CLEANUP_CONFIGS: TableCleanupConfig[];
export declare function generateEmailSystemCleanupQueries(config?: RetentionConfig): string[];
export interface CleanupStats {
    tableName: string;
    recordsToDelete: number;
    recordsToPseudonymize: number;
    estimatedSizeMB: number;
}
export declare function calculateCleanupStats(tableName: string, _retentionMonths: number, _createdAtColumn?: string): CleanupStats;
export declare function validateRetentionConfig(config: RetentionConfig): boolean;
