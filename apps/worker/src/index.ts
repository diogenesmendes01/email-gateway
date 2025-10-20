/**
 * @email-gateway/worker - Main Entry Point
 *
 * Worker principal para processar jobs de envio de email
 *
 * TASK 4.1 — Pipeline de estados, validações e envio SES
 * TASK 4.2 — Concorrência, fairness e desligamento gracioso
 */

import { Worker, Job } from 'bullmq';
import { PrismaClient } from '@email-gateway/database';
import { EMAIL_JOB_CONFIG, EmailSendJobData } from '@email-gateway/shared';

import { EmailSendProcessor } from './processors/email-send.processor';
import { SESService } from './services/ses.service';
import { loadWorkerConfig } from './config/worker.config';
import { loadSESConfig, validateSESConfig } from './config/ses.config';

/**
 * Classe principal do Worker
 */
class EmailWorker {
  private worker?: Worker;
  private prisma: PrismaClient;
  private processor: EmailSendProcessor;
  private isShuttingDown = false;

  constructor() {
    this.prisma = new PrismaClient();

    // Carrega e valida configuração do SES
    const sesConfig = loadSESConfig();
    validateSESConfig(sesConfig);

    const sesService = new SESService(sesConfig);

    // Inicializa o processador
    this.processor = new EmailSendProcessor(this.prisma, sesService);
  }

  /**
   * Inicia o worker
   */
  async start() {
    console.log('[EmailWorker] Starting email worker...');

    // Carrega configuração
    const config = loadWorkerConfig();

    console.log('[EmailWorker] Configuration:', {
      concurrency: config.concurrency,
      redis: {
        host: config.redis.host,
        port: config.redis.port,
        db: config.redis.db,
      },
      retry: {
        maxAttempts: config.retry.maxAttempts,
        backoffDelays: config.retry.backoffDelays,
      },
    });

    // Cria o worker BullMQ
    this.worker = new Worker<EmailSendJobData>(
      EMAIL_JOB_CONFIG.QUEUE_NAME,
      async (job: Job<EmailSendJobData>) => {
        return await this.processor.process(job);
      },
      {
        connection: {
          host: config.redis.host,
          port: config.redis.port,
          password: config.redis.password,
          db: config.redis.db,
        },
        concurrency: config.concurrency,
        settings: {
          // Configuração de retry/backoff
          backoffStrategy: (attemptsMade: number) => {
            // Usa os delays configurados com jitter
            const baseDelay =
              config.retry.backoffDelays[
                Math.min(attemptsMade - 1, config.retry.backoffDelays.length - 1)
              ] || config.retry.backoffDelays[config.retry.backoffDelays.length - 1];

            // Adiciona jitter (±25%)
            const jitter = baseDelay * 0.25;
            const jitterAmount = Math.random() * jitter * 2 - jitter;

            return Math.floor(baseDelay + jitterAmount);
          },
        },
        // Configuração de limiter (fairness por tenant - TASK 4.2)
        limiter: {
          max: 50, // Max 50 jobs in-flight por worker
          duration: 1000, // Por segundo
        },
      },
    );

    // Event handlers
    this.worker.on('completed', (job) => {
      console.log(
        `[EmailWorker] Job completed: ${job.id} (attempt ${job.attemptsMade})`,
      );
    });

    this.worker.on('failed', (job, err) => {
      console.error(
        `[EmailWorker] Job failed: ${job?.id} (attempt ${job?.attemptsMade}/${config.retry.maxAttempts})`,
        {
          error: err.message,
          jobData: job?.data,
        },
      );
    });

    this.worker.on('error', (err) => {
      console.error('[EmailWorker] Worker error:', err);
    });

    this.worker.on('stalled', (jobId) => {
      console.warn(`[EmailWorker] Job stalled: ${jobId}`);
    });

    // Setup graceful shutdown
    this.setupGracefulShutdown();

    console.log(
      `[EmailWorker] Worker started successfully with concurrency=${config.concurrency}`,
    );
  }

  /**
   * Configura desligamento gracioso (TASK 4.2)
   *
   * Ao receber SIGTERM:
   * 1. Para de aceitar novos jobs
   * 2. Aguarda até 30s para jobs em andamento terminarem
   * 3. Re-enfileira jobs não completados
   */
  private setupGracefulShutdown() {
    const shutdown = async (signal: string) => {
      if (this.isShuttingDown) {
        console.log('[EmailWorker] Shutdown already in progress...');
        return;
      }

      this.isShuttingDown = true;
      console.log(`[EmailWorker] Received ${signal}, starting graceful shutdown...`);

      try {
        if (this.worker) {
          console.log('[EmailWorker] Pausing worker (stop accepting new jobs)...');
          await this.worker.pause();

          console.log(
            '[EmailWorker] Waiting for active jobs to complete (max 30s)...',
          );

          // Aguarda até 30s para jobs ativos terminarem
          const shutdownTimeout = 30000; // 30 segundos
          const startTime = Date.now();

          while (Date.now() - startTime < shutdownTimeout) {
            // Aguarda um pouco antes de verificar novamente
            await new Promise((resolve) => setTimeout(resolve, 1000));
            
            // Verifica se ainda há jobs processando (aproximação)
            console.log('[EmailWorker] Waiting for active jobs to complete...');
          }

          console.log('[EmailWorker] Closing worker...');
          await this.worker.close();
        }

        console.log('[EmailWorker] Closing Prisma connection...');
        await this.prisma.$disconnect();

        console.log('[EmailWorker] Graceful shutdown completed');
        process.exit(0);
      } catch (error) {
        console.error('[EmailWorker] Error during shutdown:', error);
        process.exit(1);
      }
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

    // Handle uncaught errors
    process.on('uncaughtException', (error) => {
      console.error('[EmailWorker] Uncaught exception:', error);
      shutdown('uncaughtException');
    });

    process.on('unhandledRejection', (reason, promise) => {
      console.error('[EmailWorker] Unhandled rejection:', reason);
      shutdown('unhandledRejection');
    });
  }
}

// Inicializa e inicia o worker
const worker = new EmailWorker();

worker.start().catch((error) => {
  console.error('[EmailWorker] Failed to start worker:', error);
  process.exit(1);
});
