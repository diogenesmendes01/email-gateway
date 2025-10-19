/**
 * @email-gateway/worker - AWS SES Service
 *
 * Service responsável pela integração com AWS SES
 *
 * TASK 4.1 — Pipeline de estados, validações e envio SES
 * Integração com AWS SES para envio de emails
 */

import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import { EmailSendJobData, PIPELINE_CONSTANTS } from '@email-gateway/shared';
import { ErrorMappingService, type MappedError } from './error-mapping.service';

/**
 * Configuração do SES
 */
export interface SESConfig {
  region: string;
  fromAddress: string;
  replyToAddress?: string;
  configurationSetName?: string;
}

/**
 * Resultado do envio via SES
 */
export interface SESSendResult {
  success: boolean;
  messageId?: string;
  error?: MappedError;
}

/**
 * Service de integração com AWS SES
 */
export class SESService {
  private client: SESClient;
  private config: SESConfig;

  constructor(config: SESConfig) {
    this.config = config;
    this.client = new SESClient({
      region: config.region,
    });
  }

  /**
   * Envia email via AWS SES
   *
   * @param jobData - Dados do job
   * @param htmlContent - Conteúdo HTML do email
   * @returns Resultado do envio
   */
  async sendEmail(
    jobData: EmailSendJobData,
    htmlContent: string,
  ): Promise<SESSendResult> {
    try {
      // Prepara os parâmetros do comando
      const command = new SendEmailCommand({
        Source: this.config.fromAddress,
        Destination: {
          ToAddresses: [jobData.to],
          CcAddresses: jobData.cc || [],
          BccAddresses: jobData.bcc || [],
        },
        Message: {
          Subject: {
            Data: jobData.subject,
            Charset: 'UTF-8',
          },
          Body: {
            Html: {
              Data: htmlContent,
              Charset: 'UTF-8',
            },
          },
        },
        ReplyToAddresses: jobData.replyTo
          ? [jobData.replyTo]
          : this.config.replyToAddress
            ? [this.config.replyToAddress]
            : undefined,
        ConfigurationSetName: this.config.configurationSetName,
        Tags: this.buildTags(jobData),
      });

      // Envia com timeout
      const response = await Promise.race([
        this.client.send(command),
        this.createTimeoutPromise(PIPELINE_CONSTANTS.SES_SEND_TIMEOUT_MS),
      ]);

      // Verifica se deu timeout
      if (!response || !('MessageId' in response)) {
        throw new Error('SES request timeout');
      }

      return {
        success: true,
        messageId: response.MessageId,
      };
    } catch (error) {
      // Mapeia o erro para nossa taxonomia
      const mappedError = ErrorMappingService.mapSESError(error);

      return {
        success: false,
        error: mappedError,
      };
    }
  }

  /**
   * Constrói tags para o SES baseadas no job data
   *
   * @param jobData - Dados do job
   * @returns Array de tags SES
   */
  private buildTags(jobData: EmailSendJobData) {
    const tags: Array<{ Name: string; Value: string }> = [
      {
        Name: 'companyId',
        Value: jobData.companyId,
      },
      {
        Name: 'outboxId',
        Value: jobData.outboxId,
      },
      {
        Name: 'requestId',
        Value: jobData.requestId,
      },
    ];

    // Adiciona tags customizadas (limitado a 50 tags totais no SES)
    if (jobData.tags && jobData.tags.length > 0) {
      // Limita para não exceder o máximo de tags do SES
      const customTagsLimit = Math.min(jobData.tags.length, 47); // 50 - 3 tags fixas

      for (let i = 0; i < customTagsLimit; i++) {
        tags.push({
          Name: `custom_${i}`,
          Value: jobData.tags[i],
        });
      }
    }

    return tags;
  }

  /**
   * Cria uma promise que rejeita após timeout
   */
  private createTimeoutPromise(timeoutMs: number): Promise<never> {
    return new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error('Request timeout'));
      }, timeoutMs);
    });
  }

  /**
   * Valida a configuração do SES
   *
   * Faz um teste de "verificação" para garantir que as credenciais
   * e configuração estão corretas
   */
  async validateConfiguration(): Promise<boolean> {
    try {
      // Tenta obter informações da conta SES
      // Isso não envia email, apenas valida as credenciais
      const { GetAccountSendingEnabledCommand } = await import(
        '@aws-sdk/client-ses'
      );

      const command = new GetAccountSendingEnabledCommand({});
      await this.client.send(command);

      return true;
    } catch (error) {
      console.error('SES configuration validation failed:', error);
      return false;
    }
  }

  /**
   * Obtém estatísticas de envio da conta SES
   *
   * Útil para monitoramento de quota
   */
  async getSendQuota(): Promise<{
    max24HourSend: number;
    maxSendRate: number;
    sentLast24Hours: number;
  } | null> {
    try {
      const { GetSendQuotaCommand } = await import('@aws-sdk/client-ses');

      const command = new GetSendQuotaCommand({});
      const response = await this.client.send(command);

      return {
        max24HourSend: response.Max24HourSend || 0,
        maxSendRate: response.MaxSendRate || 0,
        sentLast24Hours: response.SentLast24Hours || 0,
      };
    } catch (error) {
      console.error('Failed to get SES send quota:', error);
      return null;
    }
  }
}
