/**
 * @email-gateway/shared - Data Retention Utilities
 *
 * Utilitários para retenção e limpeza de dados conforme LGPD
 *
 * TASK 5.2 — PII, masking, criptografia, retenção e acesso
 * Implementação de políticas de retenção de dados
 */

/**
 * Configurações de retenção de dados
 */
export interface RetentionConfig {
  emailLogsMonths: number;
  emailEventsMonths: number;
  emailOutboxMonths: number;
  recipientsMonths: number;
}

/**
 * Configuração padrão de retenção
 */
export const DEFAULT_RETENTION_CONFIG: RetentionConfig = {
  emailLogsMonths: 12,    // email_logs: 12 meses
  emailEventsMonths: 18,  // email_events: 18 meses
  emailOutboxMonths: 12,  // email_outbox: 12 meses
  recipientsMonths: -1,   // recipients: indefinido (enquanto ativo)
};

/**
 * Calcula data de expiração baseada na configuração de retenção
 *
 * @param months - Número de meses para retenção (-1 = indefinido)
 * @returns Data de expiração ou null se indefinido
 */
export function calculateExpirationDate(months: number): Date | null {
  if (months === -1) {
    return null; // Retenção indefinida
  }

  const now = new Date();
  const expirationDate = new Date(now);
  expirationDate.setMonth(expirationDate.getMonth() + months);
  
  return expirationDate;
}

/**
 * Verifica se um registro deve ser removido baseado na data de criação
 *
 * @param createdAt - Data de criação do registro
 * @param retentionMonths - Meses de retenção
 * @returns True se deve ser removido
 */
export function shouldExpireRecord(createdAt: Date, retentionMonths: number): boolean {
  if (retentionMonths === -1) {
    return false; // Retenção indefinida
  }

  const expirationDate = calculateExpirationDate(retentionMonths);
  if (!expirationDate) {
    return false;
  }

  return createdAt < expirationDate;
}

/**
 * Gera query SQL para limpeza de registros expirados
 *
 * @param tableName - Nome da tabela
 * @param retentionMonths - Meses de retenção
 * @param createdAtColumn - Nome da coluna de data de criação
 * @returns Query SQL para DELETE
 */
export function generateCleanupQuery(
  tableName: string,
  retentionMonths: number,
  createdAtColumn: string = 'created_at'
): string {
  if (retentionMonths === -1) {
    return ''; // Não limpar se retenção indefinida
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

/**
 * Gera query SQL para pseudonimização de dados sensíveis
 *
 * @param tableName - Nome da tabela
 * @param retentionMonths - Meses de retenção
 * @param createdAtColumn - Nome da coluna de data de criação
 * @returns Query SQL para UPDATE com pseudonimização
 */
export function generatePseudonymizationQuery(
  tableName: string,
  retentionMonths: number,
  createdAtColumn: string = 'created_at'
): string {
  if (retentionMonths === -1) {
    return ''; // Não pseudonimizar se retenção indefinida
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

/**
 * Configuração de limpeza por tabela
 */
export interface TableCleanupConfig {
  tableName: string;
  retentionMonths: number;
  createdAtColumn?: string;
  pseudonymizeBeforeDelete?: boolean;
}

/**
 * Gera queries de limpeza para múltiplas tabelas
 *
 * @param configs - Configurações de limpeza por tabela
 * @returns Array de queries SQL
 */
export function generateCleanupQueries(configs: TableCleanupConfig[]): string[] {
  const queries: string[] = [];

  for (const config of configs) {
    const { tableName, retentionMonths, createdAtColumn = 'created_at', pseudonymizeBeforeDelete = false } = config;

    if (retentionMonths === -1) {
      continue; // Pular se retenção indefinida
    }

    // Pseudonimizar antes de deletar (se configurado)
    if (pseudonymizeBeforeDelete) {
      const pseudonymizationQuery = generatePseudonymizationQuery(tableName, retentionMonths, createdAtColumn);
      if (pseudonymizationQuery) {
        queries.push(pseudonymizationQuery);
      }
    }

    // Deletar registros expirados
    const cleanupQuery = generateCleanupQuery(tableName, retentionMonths, createdAtColumn);
    if (cleanupQuery) {
      queries.push(cleanupQuery);
    }
  }

  return queries;
}

/**
 * Configuração padrão de limpeza para o sistema de email
 */
export const EMAIL_SYSTEM_CLEANUP_CONFIGS: TableCleanupConfig[] = [
  {
    tableName: 'email_logs',
    retentionMonths: DEFAULT_RETENTION_CONFIG.emailLogsMonths,
    createdAtColumn: 'created_at',
    pseudonymizeBeforeDelete: true,
  },
  {
    tableName: 'email_events',
    retentionMonths: DEFAULT_RETENTION_CONFIG.emailEventsMonths,
    createdAtColumn: 'created_at',
    pseudonymizeBeforeDelete: true,
  },
  {
    tableName: 'email_outbox',
    retentionMonths: DEFAULT_RETENTION_CONFIG.emailOutboxMonths,
    createdAtColumn: 'created_at',
    pseudonymizeBeforeDelete: true,
  },
  {
    tableName: 'recipients',
    retentionMonths: DEFAULT_RETENTION_CONFIG.recipientsMonths,
    createdAtColumn: 'created_at',
    pseudonymizeBeforeDelete: false, // Recipients são soft-deleted
  },
];

/**
 * Gera queries de limpeza para o sistema de email
 *
 * @param config - Configuração de retenção personalizada
 * @returns Array de queries SQL
 */
export function generateEmailSystemCleanupQueries(config: RetentionConfig = DEFAULT_RETENTION_CONFIG): string[] {
  const configs: TableCleanupConfig[] = EMAIL_SYSTEM_CLEANUP_CONFIGS.map(tableConfig => ({
    ...tableConfig,
    retentionMonths: config[`${tableConfig.tableName.replace('email_', '').replace('s', '')}Months` as keyof RetentionConfig] || tableConfig.retentionMonths,
  }));

  return generateCleanupQueries(configs);
}

/**
 * Estatísticas de limpeza
 */
export interface CleanupStats {
  tableName: string;
  recordsToDelete: number;
  recordsToPseudonymize: number;
  estimatedSizeMB: number;
}

/**
 * Calcula estatísticas de limpeza para uma tabela
 *
 * @param tableName - Nome da tabela
 * @param retentionMonths - Meses de retenção
 * @param createdAtColumn - Nome da coluna de data de criação
 * @returns Estatísticas estimadas
 */
export function calculateCleanupStats(
  tableName: string,
  _retentionMonths: number,
  _createdAtColumn: string = 'created_at'
): CleanupStats {
  // const expirationDate = calculateExpirationDate(retentionMonths);
  
  return {
    tableName,
    recordsToDelete: 0, // Seria calculado via query COUNT
    recordsToPseudonymize: 0, // Seria calculado via query COUNT
    estimatedSizeMB: 0, // Seria calculado via query de tamanho
  };
}

/**
 * Valida configuração de retenção
 *
 * @param config - Configuração para validar
 * @returns True se válida
 */
export function validateRetentionConfig(config: RetentionConfig): boolean {
  // Verificar se todos os valores são números válidos
  const values = Object.values(config);
  
  for (const value of values) {
    if (typeof value !== 'number' || value < -1) {
      return false;
    }
  }

  // Verificar se email_events tem retenção maior ou igual a email_logs
  if (config.emailEventsMonths < config.emailLogsMonths) {
    return false;
  }

  return true;
}
