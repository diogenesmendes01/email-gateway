/**
 * @email-gateway/worker - Worker Configuration
 *
 * Configuração do BullMQ Worker
 */

import { EMAIL_JOB_CONFIG } from '@email-gateway/shared';

/**
 * Configuração do worker
 */
export interface WorkerConfig {
  /** Número de workers concorrentes */
  concurrency: number;

  /** Configuração de conexão com Redis */
  redis: {
    host: string;
    port: number;
    password?: string;
    db?: number;
  };

  /** Configuração de retry */
  retry: {
    maxAttempts: number;
    backoffDelays: number[];
  };
}

/**
 * Carrega configuração do worker a partir de variáveis de ambiente
 */
export function loadWorkerConfig(): WorkerConfig {
  const redisHost = process.env.REDIS_HOST || 'localhost';
  const redisPort = parseInt(process.env.REDIS_PORT || '6379', 10);
  const redisPassword = process.env.REDIS_PASSWORD;
  const redisDb = process.env.REDIS_DB ? parseInt(process.env.REDIS_DB, 10) : 0;

  // Concorrência: min(CPU*2, 16) conforme TASK 4.2
  const cpuCount = require('os').cpus().length;
  const concurrency = parseInt(
    process.env.WORKER_CONCURRENCY || String(Math.min(cpuCount * 2, 16)),
    10,
  );

  return {
    concurrency,
    redis: {
      host: redisHost,
      port: redisPort,
      password: redisPassword,
      db: redisDb,
    },
    retry: {
      maxAttempts: EMAIL_JOB_CONFIG.MAX_ATTEMPTS,
      backoffDelays: EMAIL_JOB_CONFIG.BACKOFF_DELAYS.map((s) => s * 1000), // converte para ms
    },
  };
}
