"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EMAIL_SYSTEM_CLEANUP_CONFIGS = exports.DEFAULT_RETENTION_CONFIG = void 0;
exports.calculateExpirationDate = calculateExpirationDate;
exports.shouldExpireRecord = shouldExpireRecord;
exports.generateCleanupQuery = generateCleanupQuery;
exports.generatePseudonymizationQuery = generatePseudonymizationQuery;
exports.generateCleanupQueries = generateCleanupQueries;
exports.generateEmailSystemCleanupQueries = generateEmailSystemCleanupQueries;
exports.calculateCleanupStats = calculateCleanupStats;
exports.validateRetentionConfig = validateRetentionConfig;
exports.DEFAULT_RETENTION_CONFIG = {
    emailLogsMonths: 12,
    emailEventsMonths: 18,
    emailOutboxMonths: 12,
    recipientsMonths: -1,
};
function calculateExpirationDate(months) {
    if (months === -1) {
        return null;
    }
    const now = new Date();
    const expirationDate = new Date(now);
    expirationDate.setMonth(expirationDate.getMonth() + months);
    return expirationDate;
}
function shouldExpireRecord(createdAt, retentionMonths) {
    if (retentionMonths === -1) {
        return false;
    }
    const expirationDate = calculateExpirationDate(retentionMonths);
    if (!expirationDate) {
        return false;
    }
    return createdAt < expirationDate;
}
function generateCleanupQuery(tableName, retentionMonths, createdAtColumn = 'created_at') {
    if (retentionMonths === -1) {
        return '';
    }
    const expirationDate = calculateExpirationDate(retentionMonths);
    if (!expirationDate) {
        return '';
    }
    return `
    DELETE FROM ${tableName} 
    WHERE ${createdAtColumn} < '${expirationDate.toISOString()}'
  `;
}
function generatePseudonymizationQuery(tableName, retentionMonths, createdAtColumn = 'created_at') {
    if (retentionMonths === -1) {
        return '';
    }
    const expirationDate = calculateExpirationDate(retentionMonths);
    if (!expirationDate) {
        return '';
    }
    return `
    UPDATE ${tableName} 
    SET 
      cpf_cnpj_enc = '***PSEUDONYMIZED***',
      cpf_cnpj_hash = '***PSEUDONYMIZED***',
      email = '***PSEUDONYMIZED***',
      nome = '***PSEUDONYMIZED***',
      razao_social = '***PSEUDONYMIZED***'
    WHERE ${createdAtColumn} < '${expirationDate.toISOString()}'
  `;
}
function generateCleanupQueries(configs) {
    const queries = [];
    for (const config of configs) {
        const { tableName, retentionMonths, createdAtColumn = 'created_at', pseudonymizeBeforeDelete = false } = config;
        if (retentionMonths === -1) {
            continue;
        }
        if (pseudonymizeBeforeDelete) {
            const pseudonymizationQuery = generatePseudonymizationQuery(tableName, retentionMonths, createdAtColumn);
            if (pseudonymizationQuery) {
                queries.push(pseudonymizationQuery);
            }
        }
        const cleanupQuery = generateCleanupQuery(tableName, retentionMonths, createdAtColumn);
        if (cleanupQuery) {
            queries.push(cleanupQuery);
        }
    }
    return queries;
}
exports.EMAIL_SYSTEM_CLEANUP_CONFIGS = [
    {
        tableName: 'email_logs',
        retentionMonths: exports.DEFAULT_RETENTION_CONFIG.emailLogsMonths,
        createdAtColumn: 'created_at',
        pseudonymizeBeforeDelete: true,
    },
    {
        tableName: 'email_events',
        retentionMonths: exports.DEFAULT_RETENTION_CONFIG.emailEventsMonths,
        createdAtColumn: 'created_at',
        pseudonymizeBeforeDelete: true,
    },
    {
        tableName: 'email_outbox',
        retentionMonths: exports.DEFAULT_RETENTION_CONFIG.emailOutboxMonths,
        createdAtColumn: 'created_at',
        pseudonymizeBeforeDelete: true,
    },
    {
        tableName: 'recipients',
        retentionMonths: exports.DEFAULT_RETENTION_CONFIG.recipientsMonths,
        createdAtColumn: 'created_at',
        pseudonymizeBeforeDelete: false,
    },
];
function generateEmailSystemCleanupQueries(config = exports.DEFAULT_RETENTION_CONFIG) {
    const configs = exports.EMAIL_SYSTEM_CLEANUP_CONFIGS.map(tableConfig => ({
        ...tableConfig,
        retentionMonths: config[`${tableConfig.tableName.replace('email_', '').replace('s', '')}Months`] || tableConfig.retentionMonths,
    }));
    return generateCleanupQueries(configs);
}
function calculateCleanupStats(tableName, _retentionMonths, _createdAtColumn = 'created_at') {
    return {
        tableName,
        recordsToDelete: 0,
        recordsToPseudonymize: 0,
        estimatedSizeMB: 0,
    };
}
function validateRetentionConfig(config) {
    const values = Object.values(config);
    for (const value of values) {
        if (typeof value !== 'number' || value < -1) {
            return false;
        }
    }
    if (config.emailEventsMonths < config.emailLogsMonths) {
        return false;
    }
    return true;
}
//# sourceMappingURL=retention.util.js.map