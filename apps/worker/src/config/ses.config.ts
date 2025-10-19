/**
 * @email-gateway/worker - SES Configuration
 *
 * Configuração do AWS SES
 */

import type { SESConfig } from '../services/ses.service';

/**
 * Carrega configuração do SES a partir de variáveis de ambiente
 */
export function loadSESConfig(): SESConfig {
  const region = process.env.AWS_REGION || process.env.AWS_SES_REGION;
  const fromAddress = process.env.SES_FROM_ADDRESS;
  const replyToAddress = process.env.SES_REPLY_TO_ADDRESS;
  const configurationSetName = process.env.SES_CONFIGURATION_SET_NAME;

  if (!region) {
    throw new Error(
      'AWS_REGION or AWS_SES_REGION environment variable is required',
    );
  }

  if (!fromAddress) {
    throw new Error('SES_FROM_ADDRESS environment variable is required');
  }

  return {
    region,
    fromAddress,
    replyToAddress,
    configurationSetName,
  };
}

/**
 * Valida configuração do SES
 */
export function validateSESConfig(config: SESConfig): void {
  // Valida formato de email
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (!emailRegex.test(config.fromAddress)) {
    throw new Error(
      `Invalid SES_FROM_ADDRESS format: ${config.fromAddress}`,
    );
  }

  if (config.replyToAddress && !emailRegex.test(config.replyToAddress)) {
    throw new Error(
      `Invalid SES_REPLY_TO_ADDRESS format: ${config.replyToAddress}`,
    );
  }

  // Valida região AWS
  const validRegions = [
    'us-east-1',
    'us-east-2',
    'us-west-1',
    'us-west-2',
    'eu-west-1',
    'eu-central-1',
    'ap-southeast-1',
    'ap-southeast-2',
    'ap-northeast-1',
    'sa-east-1',
  ];

  if (!validRegions.includes(config.region)) {
    console.warn(
      `Warning: AWS region ${config.region} is not in the list of commonly used SES regions. ` +
        `Valid regions: ${validRegions.join(', ')}`,
    );
  }
}
