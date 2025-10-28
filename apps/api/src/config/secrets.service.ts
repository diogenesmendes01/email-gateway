/**
 * AWS Secrets Manager Service
 *
 * TASK-026: Production Readiness - AWS Secrets Manager Integration
 *
 * WHY: Storing encryption keys in environment variables is insecure for production
 * WHY: AWS Secrets Manager provides:
 *   - Encryption at rest (KMS)
 *   - Automatic rotation support
 *   - IAM-based access control
 *   - Audit logging (CloudTrail)
 *   - Secret versioning
 *
 * Architecture:
 * - Fetches secrets from AWS Secrets Manager at startup
 * - Caches secrets in memory to avoid repeated API calls
 * - Falls back to environment variables in development
 * - Supports automatic key rotation with graceful updates
 */

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import {
  SecretsManagerClient,
  GetSecretValueCommand,
  GetSecretValueCommandOutput,
  ResourceNotFoundException,
} from '@aws-sdk/client-secrets-manager';

/**
 * Secret names in AWS Secrets Manager
 */
export const SECRET_NAMES = {
  ENCRYPTION_KEY: 'email-gateway/encryption-key',
  ENCRYPTION_SALT: 'email-gateway/encryption-salt',
  DATABASE_URL: 'email-gateway/database-url',
  ADMIN_API_KEY: 'email-gateway/admin-api-key',
} as const;

/**
 * Cached secret values
 */
interface SecretCache {
  value: string;
  fetchedAt: Date;
  versionId?: string;
}

@Injectable()
export class SecretsService implements OnModuleInit {
  private readonly logger = new Logger(SecretsService.name);
  private readonly client: SecretsManagerClient | null;
  private readonly cache = new Map<string, SecretCache>();
  private readonly cacheTTL = 5 * 60 * 1000; // 5 minutes
  private readonly useSecretsManager: boolean;

  constructor() {
    // WHY: Only use Secrets Manager in production/staging
    // WHY: Development can use .env for faster iteration
    this.useSecretsManager = process.env.NODE_ENV === 'production' ||
                              process.env.NODE_ENV === 'staging' ||
                              process.env.USE_SECRETS_MANAGER === 'true';

    if (this.useSecretsManager) {
      // WHY: Use IAM role credentials in production (EC2, ECS, Lambda)
      // WHY: Falls back to AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY if needed
      this.client = new SecretsManagerClient({
        region: process.env.AWS_REGION || 'us-east-1',
      });

      this.logger.log('AWS Secrets Manager integration enabled');
    } else {
      this.client = null;
      this.logger.warn(
        'AWS Secrets Manager integration disabled - using environment variables (development mode only!)'
      );
    }
  }

  /**
   * Initialize and validate secrets on startup
   * WHY: Fail fast if critical secrets are missing
   */
  async onModuleInit() {
    if (!this.useSecretsManager) {
      return;
    }

    try {
      // Pre-fetch critical secrets to validate access
      await this.getEncryptionKey();
      this.logger.log('Successfully validated AWS Secrets Manager access');
    } catch (error) {
      this.logger.error(
        'Failed to fetch secrets from AWS Secrets Manager. Check IAM permissions.',
        error
      );
      throw new Error(
        'AWS Secrets Manager initialization failed. Application cannot start without encryption keys.'
      );
    }
  }

  /**
   * Get encryption key for PII data (CPF/CNPJ)
   * WHY: Centralized access point for encryption key
   * WHY: Supports automatic rotation without code changes
   */
  async getEncryptionKey(): Promise<string> {
    if (!this.useSecretsManager) {
      const envKey = process.env.ENCRYPTION_KEY;
      if (!envKey) {
        throw new Error('ENCRYPTION_KEY environment variable is required');
      }
      return envKey;
    }

    return this.getSecret(SECRET_NAMES.ENCRYPTION_KEY);
  }

  /**
   * Get encryption salt secret
   * WHY: Additional entropy for salt generation
   */
  async getEncryptionSalt(): Promise<string | undefined> {
    if (!this.useSecretsManager) {
      return process.env.ENCRYPTION_SALT_SECRET;
    }

    try {
      return await this.getSecret(SECRET_NAMES.ENCRYPTION_SALT);
    } catch (error) {
      if (error instanceof ResourceNotFoundException) {
        // Salt is optional - will fall back to encryption key
        return undefined;
      }
      throw error;
    }
  }

  /**
   * Get database URL
   * WHY: Credentials should never be in environment variables in production
   */
  async getDatabaseUrl(): Promise<string | undefined> {
    if (!this.useSecretsManager) {
      return process.env.DATABASE_URL;
    }

    try {
      return await this.getSecret(SECRET_NAMES.DATABASE_URL);
    } catch (error) {
      if (error instanceof ResourceNotFoundException) {
        // Fall back to environment variable if secret doesn't exist
        this.logger.warn('DATABASE_URL secret not found, using environment variable');
        return process.env.DATABASE_URL;
      }
      throw error;
    }
  }

  /**
   * Get admin API key
   * WHY: Admin endpoints should use rotatable secrets
   */
  async getAdminApiKey(): Promise<string | undefined> {
    if (!this.useSecretsManager) {
      return process.env.ADMIN_API_KEY;
    }

    try {
      return await this.getSecret(SECRET_NAMES.ADMIN_API_KEY);
    } catch (error) {
      if (error instanceof ResourceNotFoundException) {
        this.logger.warn('ADMIN_API_KEY secret not found, using environment variable');
        return process.env.ADMIN_API_KEY;
      }
      throw error;
    }
  }

  /**
   * Get secret from AWS Secrets Manager with caching
   * WHY: Reduce API calls and cost
   * WHY: Improve performance (avoid network call on every encryption)
   *
   * @param secretName - Name of the secret in AWS Secrets Manager
   * @returns Secret value as string
   */
  private async getSecret(secretName: string): Promise<string> {
    if (!this.client) {
      throw new Error('Secrets Manager client not initialized. Set USE_SECRETS_MANAGER=true or NODE_ENV=production.');
    }

    // Check cache first
    const cached = this.cache.get(secretName);
    if (cached && Date.now() - cached.fetchedAt.getTime() < this.cacheTTL) {
      return cached.value;
    }

    try {
      const command = new GetSecretValueCommand({
        SecretId: secretName,
      });

      const response: GetSecretValueCommandOutput = await this.client.send(command);

      if (!response.SecretString) {
        throw new Error(`Secret ${secretName} has no SecretString value`);
      }

      // Parse secret value
      let secretValue: string;
      try {
        // Try to parse as JSON first (Secrets Manager format)
        const parsed = JSON.parse(response.SecretString);
        // If it's a JSON object with a 'value' field, use that
        secretValue = parsed.value || response.SecretString;
      } catch {
        // If not JSON, use raw string
        secretValue = response.SecretString;
      }

      // Cache the secret
      this.cache.set(secretName, {
        value: secretValue,
        fetchedAt: new Date(),
        versionId: response.VersionId,
      });

      this.logger.debug({
        message: 'Secret fetched from AWS Secrets Manager',
        secretName,
        versionId: response.VersionId,
      });

      return secretValue;
    } catch (error) {
      if (error instanceof ResourceNotFoundException) {
        throw new Error(
          `Secret '${secretName}' not found in AWS Secrets Manager. ` +
          `Please create it or set USE_SECRETS_MANAGER=false for development.`
        );
      }

      this.logger.error({
        message: 'Failed to fetch secret from AWS Secrets Manager',
        secretName,
        error: (error as Error).message,
      });

      throw error;
    }
  }

  /**
   * Manually refresh a secret (useful for rotation)
   * WHY: Support zero-downtime key rotation
   *
   * @param secretName - Name of the secret to refresh
   */
  async refreshSecret(secretName: string): Promise<void> {
    this.cache.delete(secretName);
    await this.getSecret(secretName);
    this.logger.log({
      message: 'Secret refreshed',
      secretName,
    });
  }

  /**
   * Refresh all cached secrets
   * WHY: Support rotation of all secrets at once
   */
  async refreshAllSecrets(): Promise<void> {
    this.cache.clear();
    this.logger.log('All secrets cleared from cache');
  }

  /**
   * Health check for Secrets Manager connectivity
   * WHY: Expose in /health endpoint to detect IAM permission issues
   */
  async healthCheck(): Promise<boolean> {
    if (!this.useSecretsManager) {
      return true; // Always healthy in dev mode
    }

    try {
      await this.getEncryptionKey();
      return true;
    } catch (error) {
      this.logger.error('Secrets Manager health check failed', error);
      return false;
    }
  }
}
