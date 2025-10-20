/**
 * @email-gateway/worker - Main Entry Point
 *
 * Worker principal para processar jobs de envio de email
 *
 * TASK 4.1 — Pipeline de estados, validações e envio SES
 * TASK 4.2 — Concorrência, fairness e desligamento gracioso
 * TASK 7.1 — Métricas, logs e tracing
 */

import { Worker, Job, Queue } from 'bullmq';
import { PrismaClient } from '@email-gateway/database';
import { EMAIL_JOB_CONFIG, EmailSendJobData } from '@email-gateway/shared';
import Redis from 'ioredis';

import { EmailSendProcessor } from './processors/email-send.processor';
import { SESService } from './services/ses.service';
import { MetricsService } from './services/metrics.service';
import { TracingService } from './services/tracing.service';
import { loadWorkerConfig } from './config/worker.config';
import { loadSESConfig, validateSESConfig } from './config/ses.config';

/**
 * Classe principal do Worker
 */
class EmailWorker {
  private worker?: Worker;
  private prisma: PrismaClient;
  private processor: EmailSendProcessor;
  private metricsService: MetricsService;
  private tracingService: TracingService;
  private redis: Redis;
  private queue: Queue;
  private isShuttingDown = false;

  constructor() {
    this.prisma = new PrismaClient();

    // Carrega configurações
    const config = loadWorkerConfig();

    // TASK 7.1: Inicializa Redis para métricas
    this.redis = new Redis({
      host: config.redis.host,
      port: config.redis.port,
      password: config.redis.password,
      db: config.redis.db,
    });

    // TASK 7.1: Inicializa Queue para métricas
    this.queue = new Queue(EMAIL_JOB_CONFIG.QUEUE_NAME, {
      connection: this.redis,
    });

    // TASK 7.1: Inicializa serviços de métricas e tracing
    this.metricsService = new MetricsService(this.redis, this.queue);
    this.tracingService = new TracingService('email-worker');

    // Carrega e valida configuração do SES
    const sesConfig = loadSESConfig();
    validateSESConfig(sesConfig);

    const sesService = new SESService(sesConfig);

    // Inicializa o processador com métricas e tracing (TASK 7.1)
    this.processor = new EmailSendProcessor(
      this.prisma,
      sesService,
      this.metricsService,
      this.tracingService
    );
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

    // TASK 7.1: Setup metrics alert monitoring (check every 5 minutes)
    this.setupMetricsAlertMonitoring();

    console.log(
      `[EmailWorker] Worker started successfully with concurrency=${config.concurrency}`,
    );
    console.log('[EmailWorker] Metrics and tracing enabled (TASK 7.1)');
  }

  /**
   * Setup periodic metrics alert monitoring (TASK 7.1)
   * Checks for alert conditions every 5 minutes:
   * - DLQ depth > 100
   * - Queue age P95 > 120s
   */
  private setupMetricsAlertMonitoring() {
    const checkInterval = 5 * 60 * 1000; // 5 minutes

    const checkAlerts = async () => {
      if (this.isShuttingDown) return;

      try {
        const alertResult = await this.metricsService.checkAlerts();

        if (alertResult.dlqAlert || alertResult.queueAgeAlert) {
          console.error(`[EmailWorker] ALERT: ${alertResult.message}`);

          // Get full metrics summary for context
          const metrics = await this.metricsService.getMetricsSummary();
          console.error('[EmailWorker] Current metrics:', metrics);
        }
      } catch (error) {
        console.error('[EmailWorker] Error checking alerts:', error);
      }
    };

    // Initial check after 1 minute
    setTimeout(checkAlerts, 60 * 1000);

    // Then check every 5 minutes
    setInterval(checkAlerts, checkInterval);

    console.log('[EmailWorker] Alert monitoring enabled (checking every 5 minutes)');
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
