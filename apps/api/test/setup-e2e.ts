import { GenericContainer, StartedTestContainer } from 'testcontainers';
import { execSync } from 'child_process';
import { Logger } from '@nestjs/common';

export interface E2ETestEnvironment {
  redisContainer: StartedTestContainer;
  postgresContainer: StartedTestContainer;
  databaseUrl: string;
  redisUrl: string;
}

const logger = new Logger('E2ESetup');

export async function setupE2EEnvironment(): Promise<E2ETestEnvironment> {
  logger.log('Setting up E2E test environment...');

  // Start Redis container
  logger.log('Starting Redis container...');
  const redisContainer = await new GenericContainer('redis:7-alpine')
    .withExposedPorts(6379)
    .start();

  const redisHost = redisContainer.getHost();
  const redisPort = redisContainer.getMappedPort(6379);
  const redisUrl = `redis://${redisHost}:${redisPort}`;

  logger.log(`Redis container started at ${redisUrl}`);

  // Start Postgres container
  logger.log('Starting Postgres container...');
  const postgresContainer = await new GenericContainer('postgres:15-alpine')
    .withExposedPorts(5432)
    .withEnvironment({
      POSTGRES_USER: 'test',
      POSTGRES_PASSWORD: 'test',
      POSTGRES_DB: 'email_gateway_test',
    })
    .start();

  const postgresHost = postgresContainer.getHost();
  const postgresPort = postgresContainer.getMappedPort(5432);
  const databaseUrl = `postgresql://test:test@${postgresHost}:${postgresPort}/email_gateway_test`;

  logger.log(`Postgres container started at ${databaseUrl}`);

  // Wait for Postgres to be ready
  logger.log('Waiting for Postgres to be ready...');
  await new Promise((resolve) => setTimeout(resolve, 3000));

  // Run Prisma migrations
  try {
    logger.log('Running Prisma migrations...');
    execSync('npx prisma migrate deploy', {
      env: { ...process.env, DATABASE_URL: databaseUrl },
      stdio: 'inherit',
      cwd: process.cwd().includes('apps\\api')
        ? '../../packages/database'
        : './packages/database',
    });
    logger.log('Prisma migrations completed successfully');
  } catch (error) {
    logger.error('Failed to run Prisma migrations', error);
    throw error;
  }

  logger.log('E2E test environment setup completed');

  return {
    redisContainer,
    postgresContainer,
    databaseUrl,
    redisUrl,
  };
}

export async function teardownE2EEnvironment(env: E2ETestEnvironment) {
  logger.log('Tearing down E2E test environment...');

  try {
    await env.redisContainer?.stop();
    logger.log('Redis container stopped');
  } catch (error) {
    logger.error('Failed to stop Redis container', error);
  }

  try {
    await env.postgresContainer?.stop();
    logger.log('Postgres container stopped');
  } catch (error) {
    logger.error('Failed to stop Postgres container', error);
  }

  logger.log('E2E test environment teardown completed');
}

/**
 * Wait for a condition to be true with timeout
 */
export async function waitFor(
  condition: () => Promise<boolean>,
  options: { timeout?: number; interval?: number } = {}
): Promise<void> {
  const { timeout = 10000, interval = 500 } = options;
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    try {
      const result = await condition();
      if (result) {
        return;
      }
    } catch (error) {
      // Condition not met yet, continue waiting
    }

    await new Promise((resolve) => setTimeout(resolve, interval));
  }

  throw new Error(`Timeout waiting for condition after ${timeout}ms`);
}
