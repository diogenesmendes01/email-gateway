#!/usr/bin/env node

/**
 * @email-gateway/database - Data Retention Cleanup Script
 *
 * Script para limpeza automática de dados conforme políticas de retenção
 *
 * TASK 5.2 — PII, masking, criptografia, retenção e acesso
 * Implementação de limpeza automática de dados
 */

import { PrismaClient } from '@prisma/client';
import {
  generateEmailSystemCleanupQueries,
  DEFAULT_RETENTION_CONFIG,
  validateRetentionConfig,
  RetentionConfig,
} from '@email-gateway/shared';

interface CleanupOptions {
  dryRun: boolean;
  config?: RetentionConfig;
  verbose: boolean;
}

class DataRetentionCleanup {
  private prisma: PrismaClient;
  private options: CleanupOptions;

  constructor(options: CleanupOptions) {
    this.prisma = new PrismaClient();
    this.options = options;
  }

  async run(): Promise<void> {
    try {
      console.log('🧹 Iniciando limpeza de dados conforme políticas de retenção...');
      
      const config = this.options.config || DEFAULT_RETENTION_CONFIG;
      
      if (!validateRetentionConfig(config)) {
        throw new Error('Configuração de retenção inválida');
      }

      console.log('📋 Configuração de retenção:');
      console.log(`  - email_logs: ${config.emailLogsMonths === -1 ? 'indefinido' : `${config.emailLogsMonths} meses`}`);
      console.log(`  - email_events: ${config.emailEventsMonths === -1 ? 'indefinido' : `${config.emailEventsMonths} meses`}`);
      console.log(`  - email_outbox: ${config.emailOutboxMonths === -1 ? 'indefinido' : `${config.emailOutboxMonths} meses`}`);
      console.log(`  - recipients: ${config.recipientsMonths === -1 ? 'indefinido' : `${config.recipientsMonths} meses`}`);

      if (this.options.dryRun) {
        console.log('🔍 Modo DRY RUN - apenas simulação');
        await this.simulateCleanup(config);
      } else {
        console.log('⚡ Executando limpeza real...');
        await this.executeCleanup(config);
      }

      console.log('✅ Limpeza concluída com sucesso!');
    } catch (error) {
      console.error('❌ Erro durante limpeza:', error);
      throw error;
    } finally {
      await this.prisma.$disconnect();
    }
  }

  private async simulateCleanup(config: RetentionConfig): Promise<void> {
    const queries = generateEmailSystemCleanupQueries(config);
    
    for (const query of queries) {
      if (query.trim()) {
        console.log(`📝 Query que seria executada:`);
        console.log(`   ${query.trim()}`);
        
        // Executar COUNT para simular impacto
        const countQuery = query.replace(/^(DELETE|UPDATE)/i, 'SELECT COUNT(*)');
        try {
          const result = await this.prisma.$queryRawUnsafe(countQuery);
          console.log(`   📊 Registros afetados: ${JSON.stringify(result)}`);
        } catch (error) {
          console.log(`   ⚠️  Erro ao contar registros: ${error}`);
        }
        console.log('');
      }
    }
  }

  private async executeCleanup(config: RetentionConfig): Promise<void> {
    const queries = generateEmailSystemCleanupQueries(config);
    let totalAffected = 0;
    
    for (const query of queries) {
      if (query.trim()) {
        try {
          console.log(`🔄 Executando: ${query.trim().substring(0, 50)}...`);
          
          const result = await this.prisma.$executeRawUnsafe(query);
          const affected = typeof result === 'number' ? result : 0;
          totalAffected += affected;
          
          console.log(`   ✅ ${affected} registros processados`);
          
          if (this.options.verbose) {
            console.log(`   📝 Query completa: ${query.trim()}`);
          }
        } catch (error) {
          console.error(`   ❌ Erro ao executar query: ${error}`);
          throw error;
        }
      }
    }
    
    console.log(`📊 Total de registros processados: ${totalAffected}`);
  }

  async getRetentionStats(): Promise<void> {
    try {
      console.log('📊 Estatísticas de retenção de dados:');
      
      const config = this.options.config || DEFAULT_RETENTION_CONFIG;
      
      // Estatísticas por tabela
      const tables = [
        { name: 'email_logs', months: config.emailLogsMonths },
        { name: 'email_events', months: config.emailEventsMonths },
        { name: 'email_outbox', months: config.emailOutboxMonths },
        { name: 'recipients', months: config.recipientsMonths },
      ];
      
      for (const table of tables) {
        const totalCount = await this.prisma.$queryRawUnsafe(`SELECT COUNT(*) as count FROM ${table.name}`);
        const total = (totalCount as any)[0]?.count || 0;
        
        console.log(`\n📋 ${table.name}:`);
        console.log(`   Total de registros: ${total}`);
        console.log(`   Retenção: ${table.months === -1 ? 'indefinida' : `${table.months} meses`}`);
        
        if (table.months !== -1) {
          const expirationDate = new Date();
          expirationDate.setMonth(expirationDate.getMonth() - table.months);
          
          const expiredCount = await this.prisma.$queryRawUnsafe(
            `SELECT COUNT(*) as count FROM ${table.name} WHERE created_at < '${expirationDate.toISOString()}'`
          );
          const expired = (expiredCount as any)[0]?.count || 0;
          
          console.log(`   Registros expirados: ${expired}`);
          console.log(`   Data de corte: ${expirationDate.toISOString()}`);
        }
      }
    } catch (error) {
      console.error('❌ Erro ao obter estatísticas:', error);
      throw error;
    }
  }
}

// CLI Interface
async function main() {
  const args = process.argv.slice(2);
  const options: CleanupOptions = {
    dryRun: false,
    verbose: false,
  };

  // Parse arguments
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--dry-run':
        options.dryRun = true;
        break;
      case '--verbose':
        options.verbose = true;
        break;
      case '--stats':
        const cleanup = new DataRetentionCleanup(options);
        await cleanup.getRetentionStats();
        return;
      case '--help':
        console.log(`
Uso: npm run cleanup:retention [opções]

Opções:
  --dry-run     Executa apenas simulação (não modifica dados)
  --verbose     Mostra queries completas durante execução
  --stats       Mostra apenas estatísticas de retenção
  --help        Mostra esta ajuda

Exemplos:
  npm run cleanup:retention --dry-run
  npm run cleanup:retention --verbose
  npm run cleanup:retention --stats
        `);
        return;
    }
  }

  const cleanup = new DataRetentionCleanup(options);
  await cleanup.run();
}

// Executar se chamado diretamente
if (require.main === module) {
  main().catch((error) => {
    console.error('❌ Erro fatal:', error);
    process.exit(1);
  });
}

export { DataRetentionCleanup };
