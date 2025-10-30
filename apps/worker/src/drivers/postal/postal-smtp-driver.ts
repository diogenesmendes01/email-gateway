import nodemailer, { Transporter } from 'nodemailer';

import { EmailProvider, EmailSendJobData } from '@email-gateway/shared';

import type { DriverConfig, DriverSendOptions } from '../base/driver-config.types';
import type { IEmailDriver } from '../base/email-driver.interface';
import type { SendResult } from '../base/email-driver-result';
import { ErrorMappingService } from '../../services/error-mapping.service';
import { ReturnPathGenerator } from './return-path-generator';
import type { PostalSMTPConfig } from './postal-config';

export class PostalSMTPDriver implements IEmailDriver {
  private readonly transporter: Transporter;
  private readonly config: PostalSMTPConfig;

  constructor(config: DriverConfig) {
    this.config = this.normalizeConfig(config);
    this.transporter = nodemailer.createTransport({
      host: this.config.host,
      port: this.config.port,
      secure: this.config.secure,
      pool: true,
      auth: this.config.auth,
      tls: this.config.tls,
    });
  }

  async sendEmail(job: EmailSendJobData, config: DriverConfig, options: DriverSendOptions): Promise<SendResult> {
    const effectiveConfig = this.normalizeConfig({ ...this.config, ...config });

    try {
      const message = this.buildMessage(job, options, effectiveConfig);
      const info = await this.transporter.sendMail(message);

      return {
        success: true,
        provider: EmailProvider.POSTAL_SMTP,
        messageId: info.messageId,
      };
    } catch (error) {
      const mappedError = ErrorMappingService.mapGenericError(error);

      return {
        success: false,
        provider: EmailProvider.POSTAL_SMTP,
        error: mappedError,
      };
    }
  }

  async validateConfig(config?: DriverConfig): Promise<boolean> {
    try {
      const transporter = config ? this.createTransientTransporter(config) : this.transporter;
      await transporter.verify();
      return true;
    } catch (error) {
      console.error('[PostalSMTPDriver] Configuration validation failed:', error);
      return false;
    }
  }

  private buildMessage(job: EmailSendJobData, options: DriverSendOptions, config: PostalSMTPConfig) {
    const { htmlContent } = options;
    const headers = this.composeHeaders(job);
    const envelope = {
      from: this.generateReturnPath(job, config),
      to: job.to,
    };

    return {
      from: config.fromAddress,
      to: job.to,
      cc: job.cc,
      bcc: job.bcc,
      subject: job.subject,
      html: htmlContent,
      headers,
      replyTo: job.replyTo || config.replyToAddress,
      envelope,
    };
  }

  private composeHeaders(job: EmailSendJobData): Record<string, string> {
    const headers: Record<string, string> = {
      'X-Request-Id': job.requestId,
      'X-Outbox-Id': job.outboxId,
    };

    if (job.headers) {
      Object.assign(headers, job.headers);
    }

    const unsubscribeUrl = (job as any).unsubscribeUrl;
    if (!headers['List-Unsubscribe'] && typeof unsubscribeUrl === 'string') {
      headers['List-Unsubscribe'] = `<${unsubscribeUrl}>`;
    }

    return headers;
  }

  private generateReturnPath(job: EmailSendJobData, config: PostalSMTPConfig): string {
    const domain = config.returnPathDomain || this.extractDomain(config.fromAddress);
    return ReturnPathGenerator.generate(job.to, domain);
  }

  private extractDomain(address: string): string {
    const [, domain] = address.split('@');
    return `bounce.${domain}`;
  }

  private createTransientTransporter(config: DriverConfig): Transporter {
    const normalized = this.normalizeConfig(config);
    return nodemailer.createTransport({
      host: normalized.host,
      port: normalized.port,
      secure: normalized.secure,
      pool: true,
      auth: normalized.auth,
      tls: normalized.tls,
    });
  }

  private normalizeConfig(config: DriverConfig): PostalSMTPConfig {
    if (config.provider !== EmailProvider.POSTAL_SMTP) {
      throw new Error(`PostalSMTPDriver requires provider POSTAL_SMTP, received ${config.provider}`);
    }

    if (!config.host) {
      throw new Error('PostalSMTPDriver requires SMTP host');
    }

    if (!config.port) {
      throw new Error('PostalSMTPDriver requires SMTP port');
    }

    if (!config.auth || !config.auth.user || !config.auth.pass) {
      throw new Error('PostalSMTPDriver requires SMTP credentials');
    }

    if (!config.fromAddress) {
      throw new Error('PostalSMTPDriver requires fromAddress');
    }

    return {
      ...config,
      provider: EmailProvider.POSTAL_SMTP,
      host: config.host,
      port: config.port,
      secure: config.secure ?? false,
      auth: config.auth,
      fromAddress: config.fromAddress,
      returnPathDomain: config.returnPathDomain as string | undefined,
    };
  }
}

