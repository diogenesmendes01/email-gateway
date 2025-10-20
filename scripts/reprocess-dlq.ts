#!/usr/bin/env tsx
/**
 * reprocess-dlq.ts
 *
 * Script para reprocessar jobs da Dead Letter Queue (DLQ)
 *
 * TASK 4.3 — Falhas específicas e troubleshooting
 * Runbook de DLQ/reprocessamento
 *
 * Uso:
 *   tsx scripts/reprocess-dlq.ts [options]
 *
 * Opções:
 *   --dry-run              Simula o reprocessamento sem executar
 *   --job-id <id>          Reprocessa apenas um job específico
 *   --filter <error-code>  Filtra jobs por código de erro (ex: SES_THROTTLING)
 *   --limit <number>       Limita número de jobs a reprocessar
 *   --delay <ms>           Delay entre reprocessamentos (padrão: 1000ms)
 *
 * Exemplos:
 *   # Listar jobs em DLQ (dry-run)
 *   tsx scripts/reprocess-dlq.ts --dry-run
 *
 *   # Reprocessar job específico
 *   tsx scripts/reprocess-dlq.ts --job-id abc-123
 *
 *   # Reprocessar todos os jobs com SES_THROTTLING
 *   tsx scripts/reprocess-dlq.ts --filter SES_THROTTLING
 *
 *   # Reprocessar até 10 jobs com delay de 2s
 *   tsx scripts/reprocess-dlq.ts --limit 10 --delay 2000
 */

import { Queue, Job } from 'bullmq';
import { Redis } from 'ioredis';
import { EmailSendJobData } from '@email-gateway/shared';

// Configuração
const REDIS_HOST = process.env.REDIS_HOST || 'localhost';
const REDIS_PORT = parseInt(process.env.REDIS_PORT || '6379', 10);
const QUEUE_NAME = 'email:send';

// Cores para output
const COLORS = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

interface Options {
  dryRun: boolean;
  jobId?: string;
  filter?: string;
  limit?: number;
  delay: number;
}

/**
 * Parse argumentos da linha de comando
 */
function parseArgs(): Options {
  const args = process.argv.slice(2);
  const options: Options = {
    dryRun: false,
    delay: 1000,
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--dry-run':
        options.dryRun = true;
        break;
      case '--job-id':
        options.jobId = args[++i];
        break;
      case '--filter':
        options.filter = args[++i];
        break;
      case '--limit':
        const limit = parseInt(args[++i], 10);
        if (isNaN(limit) || limit <= 0) {
          console.error(`${COLORS.red}Erro: --limit deve ser um número positivo${COLORS.reset}`);
          process.exit(1);
        }
        options.limit = limit;
        break;
      case '--delay':
        const delay = parseInt(args[++i], 10);
        if (isNaN(delay) || delay < 0) {
          console.error(`${COLORS.red}Erro: --delay deve ser um número não negativo${COLORS.reset}`);
          process.exit(1);
        }
        options.delay = delay;
        break;
      case '--help':
        console.log(`
Uso: tsx scripts/reprocess-dlq.ts [options]

Opções:
  --dry-run              Simula o reprocessamento sem executar
  --job-id <id>          Reprocessa apenas um job específico
  --filter <error-code>  Filtra jobs por código de erro
  --limit <number>       Limita número de jobs a reprocessar
  --delay <ms>           Delay entre reprocessamentos (padrão: 1000ms)
  --help                 Mostra esta ajuda
        `);
        process.exit(0);
      default:
        console.error(`${COLORS.red}Argumento desconhecido: ${args[i]}${COLORS.reset}`);
        process.exit(1);
    }
  }

  return options;
}

/**
 * Verifica se um job deve ser reprocessado
 */
function shouldReprocessJob(
  job: Job<EmailSendJobData>,
  filter?: string,
): boolean {
  if (!filter) return true;

  const failedReason = job.failedReason || '';

  // Busca o código de erro na mensagem de falha
  return failedReason.includes(filter);
}

/**
 * Determina categoria do erro
 */
function categorizeError(failedReason: string): {
  retryable: boolean;
  category: string;
} {
  const retryableErrors = [
    'SES_THROTTLING',
    'SES_SERVICE_UNAVAILABLE',
    'SES_TIMEOUT',
    'NETWORK_ERROR',
    'SES_MAX_SEND_RATE_EXCEEDED',
    'SES_DAILY_QUOTA_EXCEEDED',
  ];

  const isRetryable = retryableErrors.some(err => failedReason.includes(err));

  let category = 'UNKNOWN';

  if (failedReason.includes('QUOTA')) category = 'QUOTA_ERROR';
  else if (failedReason.includes('THROTTLING')) category = 'QUOTA_ERROR';
  else if (failedReason.includes('TIMEOUT')) category = 'TIMEOUT_ERROR';
  else if (failedReason.includes('NETWORK')) category = 'TRANSIENT_ERROR';
  else if (failedReason.includes('SERVICE_UNAVAILABLE')) category = 'TRANSIENT_ERROR';
  else if (failedReason.includes('VALIDATION')) category = 'VALIDATION_ERROR';
  else if (failedReason.includes('REJECTED')) category = 'PERMANENT_ERROR';

  return { retryable: isRetryable, category };
}

/**
 * Principal
 */
async function main() {
  const options = parseArgs();

  console.log(`${COLORS.blue}=== Reprocessamento de DLQ ===${COLORS.reset}`);
  console.log(`Modo: ${options.dryRun ? COLORS.yellow + 'DRY-RUN' : COLORS.green + 'EXECUÇÃO'}${COLORS.reset}`);
  console.log(`Redis: ${COLORS.cyan}${REDIS_HOST}:${REDIS_PORT}${COLORS.reset}`);
  console.log('');

  // Conectar ao Redis e BullMQ
  const connection = new Redis({
    host: REDIS_HOST,
    port: REDIS_PORT,
    maxRetriesPerRequest: null,
  });

  const queue = new Queue<EmailSendJobData>(QUEUE_NAME, { connection });

  try {
    // Buscar jobs falhados
    console.log(`${COLORS.blue}Buscando jobs em DLQ...${COLORS.reset}`);

    let failedJobs: Job<EmailSendJobData>[];

    if (options.jobId) {
      // Job específico
      const job = await queue.getJob(options.jobId);
      failedJobs = job ? [job] : [];

      if (!job) {
        console.log(`${COLORS.red}Job ${options.jobId} não encontrado${COLORS.reset}`);
        process.exit(1);
      }
    } else {
      // Todos os jobs falhados
      failedJobs = await queue.getFailed();
    }

    console.log(`Total de jobs em DLQ: ${COLORS.cyan}${failedJobs.length}${COLORS.reset}`);
    console.log('');

    if (failedJobs.length === 0) {
      console.log(`${COLORS.green}✓ Nenhum job em DLQ${COLORS.reset}`);
      process.exit(0);
    }

    // Filtrar jobs
    const jobsToReprocess = failedJobs.filter(job =>
      shouldReprocessJob(job, options.filter)
    );

    if (options.limit && jobsToReprocess.length > options.limit) {
      jobsToReprocess.splice(options.limit);
    }

    console.log(`Jobs a reprocessar: ${COLORS.cyan}${jobsToReprocess.length}${COLORS.reset}`);

    if (options.filter) {
      console.log(`Filtro aplicado: ${COLORS.yellow}${options.filter}${COLORS.reset}`);
    }

    console.log('');

    // Listar jobs
    console.log(`${COLORS.blue}--- Jobs em DLQ ---${COLORS.reset}`);

    const stats = {
      retryable: 0,
      permanent: 0,
      unknown: 0,
    };

    for (const job of jobsToReprocess) {
      const jobData = job.data;
      const failedReason = job.failedReason || 'Unknown';
      const { retryable, category } = categorizeError(failedReason);

      if (retryable) stats.retryable++;
      else if (category === 'PERMANENT_ERROR' || category === 'VALIDATION_ERROR') stats.permanent++;
      else stats.unknown++;

      const statusColor = retryable ? COLORS.green : COLORS.red;
      const statusText = retryable ? 'RETRYABLE' : 'PERMANENT';

      console.log(`Job: ${COLORS.cyan}${job.id}${COLORS.reset}`);
      console.log(`  Empresa: ${jobData.companyId}`);
      console.log(`  Para: ${jobData.to}`);
      console.log(`  Tentativas: ${job.attemptsMade}`);
      console.log(`  Erro: ${statusColor}${failedReason}${COLORS.reset}`);
      console.log(`  Categoria: ${category}`);
      console.log(`  Status: ${statusColor}${statusText}${COLORS.reset}`);
      console.log('');
    }

    // Estatísticas
    console.log(`${COLORS.blue}--- Estatísticas ---${COLORS.reset}`);
    console.log(`Retentáveis:  ${COLORS.green}${stats.retryable}${COLORS.reset}`);
    console.log(`Permanentes:  ${COLORS.red}${stats.permanent}${COLORS.reset}`);
    console.log(`Desconhecidos: ${COLORS.yellow}${stats.unknown}${COLORS.reset}`);
    console.log('');

    // Perguntar confirmação se não for dry-run
    if (!options.dryRun) {
      if (stats.permanent > 0) {
        console.log(`${COLORS.yellow}⚠️  ATENÇÃO: ${stats.permanent} jobs têm erros permanentes${COLORS.reset}`);
        console.log(`${COLORS.yellow}Reprocessá-los provavelmente resultará em falha novamente${COLORS.reset}`);
        console.log('');
      }

      // Aviso sobre quota SES para lotes grandes
      if (jobsToReprocess.length > 100) {
        console.log(`${COLORS.yellow}⚠️  PROCESSAMENTO EM MASSA DETECTADO${COLORS.reset}`);
        console.log(`${COLORS.yellow}Você está prestes a reprocessar ${jobsToReprocess.length} jobs${COLORS.reset}`);
        console.log(`${COLORS.yellow}Considere verificar a quota SES antes de continuar:${COLORS.reset}`);
        console.log(`${COLORS.cyan}  ./scripts/monitor-ses-quota.sh${COLORS.reset}`);
        console.log('');
      }

      console.log(`${COLORS.yellow}Deseja continuar com o reprocessamento? (y/n)${COLORS.reset}`);

      // Aguardar input do usuário
      const readline = require('readline').createInterface({
        input: process.stdin,
        output: process.stdout,
      });

      const answer = await new Promise<string>((resolve) => {
        readline.question('> ', (ans: string) => {
          readline.close();
          resolve(ans.toLowerCase());
        });
      });

      if (answer !== 'y' && answer !== 'yes') {
        console.log(`${COLORS.yellow}Operação cancelada${COLORS.reset}`);
        process.exit(0);
      }

      console.log('');
    }

    // Reprocessar jobs
    if (options.dryRun) {
      console.log(`${COLORS.yellow}[DRY-RUN] Nenhuma ação executada${COLORS.reset}`);
    } else {
      console.log(`${COLORS.blue}Iniciando reprocessamento...${COLORS.reset}`);
      console.log('');

      let reprocessed = 0;
      let failed = 0;
      let consecutiveFailures = 0;
      const MAX_CONSECUTIVE_FAILURES = 5;

      for (const job of jobsToReprocess) {
        try {
          // Resetar tentativas
          await job.updateData({
            ...job.data,
            attempt: 1,
          });

          // Reprocessar
          await job.retry();

          console.log(`${COLORS.green}✓${COLORS.reset} Job ${job.id} reprocessado`);
          reprocessed++;
          consecutiveFailures = 0; // Reset on success

          // Delay entre reprocessamentos
          if (options.delay > 0) {
            await new Promise(resolve => setTimeout(resolve, options.delay));
          }
        } catch (error) {
          console.log(`${COLORS.red}✗${COLORS.reset} Job ${job.id} falhou: ${error}`);
          failed++;
          consecutiveFailures++;

          // Circuit breaker: abortar se muitas falhas consecutivas
          if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
            console.log('');
            console.log(`${COLORS.red}🚨 CIRCUIT BREAKER ATIVADO${COLORS.reset}`);
            console.log(`${COLORS.red}Detectadas ${consecutiveFailures} falhas consecutivas${COLORS.reset}`);
            console.log(`${COLORS.red}Abortando reprocessamento para evitar falhas sistêmicas${COLORS.reset}`);
            console.log('');
            break;
          }
        }
      }

      console.log('');
      console.log(`${COLORS.blue}--- Resultado ---${COLORS.reset}`);
      console.log(`Reprocessados: ${COLORS.green}${reprocessed}${COLORS.reset}`);
      console.log(`Falharam:      ${COLORS.red}${failed}${COLORS.reset}`);
      console.log('');
      console.log(`${COLORS.green}✓ Reprocessamento concluído${COLORS.reset}`);
    }
  } catch (error) {
    console.error(`${COLORS.red}Erro:${COLORS.reset}`, error);
    process.exit(1);
  } finally {
    await queue.close();
    await connection.quit();
  }
}

// Executar
main().catch(console.error);
