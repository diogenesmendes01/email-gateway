/**
 * TASK-021: Slack Alert Service
 *
 * Sends DLQ alerts to Slack via webhook
 */

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

export interface DLQAlertPayload {
  dlqSize: number;
  oldJobsCount: number;
  oldestJobAge?: number;
  recentFailures?: number;
  alertType: 'critical' | 'warning' | 'info';
}

@Injectable()
export class SlackAlertService {
  private readonly logger = new Logger(SlackAlertService.name);
  private readonly webhookUrl: string | undefined;
  private readonly enabled: boolean;

  constructor(private readonly configService: ConfigService) {
    this.webhookUrl = this.configService.get('SLACK_WEBHOOK_URL');
    this.enabled = !!this.webhookUrl;

    if (!this.enabled) {
      this.logger.warn('Slack webhook URL not configured. Alerts will be logged only.');
    }
  }

  /**
   * Send DLQ alert to Slack
   */
  async sendDLQAlert(payload: DLQAlertPayload): Promise<void> {
    const { dlqSize, oldJobsCount, oldestJobAge, recentFailures, alertType } = payload;

    // Log alert regardless of Slack configuration
    this.logger.warn({
      message: 'DLQ Alert triggered',
      ...payload,
    });

    if (!this.enabled || !this.webhookUrl) {
      return;
    }

    try {
      const blocks = this.buildAlertBlocks(payload);

      await axios.post(
        this.webhookUrl,
        {
          text: this.getAlertEmoji(alertType) + ' *DLQ Alert*',
          blocks,
        },
        {
          headers: {
            'Content-Type': 'application/json',
          },
          timeout: 5000, // 5 second timeout
        }
      );

      this.logger.log({
        message: 'Slack alert sent successfully',
        alertType,
        dlqSize,
      });
    } catch (error) {
      this.logger.error({
        message: 'Failed to send Slack alert',
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
  }

  /**
   * Send high failure rate alert
   */
  async sendHighFailureRateAlert(recentFailures: number): Promise<void> {
    await this.sendDLQAlert({
      dlqSize: 0,
      oldJobsCount: 0,
      recentFailures,
      alertType: 'critical',
    });
  }

  /**
   * Send critical alert (old jobs)
   */
  async sendCriticalAlert(oldJobsCount: number, oldestJobAge: number): Promise<void> {
    await this.sendDLQAlert({
      dlqSize: oldJobsCount,
      oldJobsCount,
      oldestJobAge,
      alertType: 'critical',
    });
  }

  /**
   * Build Slack message blocks
   */
  private buildAlertBlocks(payload: DLQAlertPayload): any[] {
    const { dlqSize, oldJobsCount, oldestJobAge, recentFailures, alertType } = payload;

    const blocks: any[] = [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: this.getAlertEmoji(alertType) + ' Dead Letter Queue Alert',
        },
      },
      {
        type: 'section',
        fields: [
          {
            type: 'mrkdwn',
            text: `*Alert Type:*\n${this.getAlertTypeText(alertType)}`,
          },
          {
            type: 'mrkdwn',
            text: `*DLQ Size:*\n${dlqSize} jobs`,
          },
        ],
      },
    ];

    // Add old jobs information if present
    if (oldJobsCount > 0) {
      blocks.push({
        type: 'section',
        fields: [
          {
            type: 'mrkdwn',
            text: `*Old Jobs (>24h):*\n${oldJobsCount}`,
          },
          {
            type: 'mrkdwn',
            text: `*Oldest Job Age:*\n${oldestJobAge}h`,
          },
        ],
      });
    }

    // Add recent failures if present
    if (recentFailures) {
      blocks.push({
        type: 'section',
        fields: [
          {
            type: 'mrkdwn',
            text: `*Recent Failures (10min):*\n${recentFailures}`,
          },
          {
            type: 'mrkdwn',
            text: `*Status:*\nPotential systemic issue`,
          },
        ],
      });
    }

    // Add action section
    blocks.push(
      {
        type: 'divider',
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: this.getActionText(payload),
        },
      },
      {
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: {
              type: 'plain_text',
              text: 'View DLQ',
            },
            url: this.getAdminUrl('/admin/dlq'),
            style: 'primary',
          },
          {
            type: 'button',
            text: {
              type: 'plain_text',
              text: 'View Stats',
            },
            url: this.getAdminUrl('/admin/dlq/stats'),
          },
          {
            type: 'button',
            text: {
              type: 'plain_text',
              text: 'Grafana Dashboard',
            },
            url: this.getGrafanaUrl(),
          },
        ],
      }
    );

    // Add context with timestamp
    blocks.push({
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: `🕐 ${new Date().toISOString()} | Environment: ${this.configService.get('NODE_ENV', 'development')}`,
        },
      ],
    });

    return blocks;
  }

  /**
   * Get action text based on alert payload
   */
  private getActionText(payload: DLQAlertPayload): string {
    const { oldJobsCount, recentFailures, alertType } = payload;

    if (alertType === 'critical') {
      if (oldJobsCount > 0) {
        return '*⚠️ Action Required:*\n' +
          '• Investigate failed jobs immediately\n' +
          '• Check for systemic issues (SES, Database, Redis)\n' +
          '• Review and retry or remove stale jobs\n' +
          '• Monitor failure patterns';
      }
      if (recentFailures) {
        return '*🚨 IMMEDIATE Action Required:*\n' +
          '• Check AWS SES status and quotas\n' +
          '• Verify database connectivity\n' +
          '• Check Redis connection\n' +
          '• Review recent deployments\n' +
          '• Scale worker instances if needed';
      }
    }

    return '*📋 Action Items:*\n' +
      '• Review failed jobs at /admin/dlq\n' +
      '• Identify failure patterns\n' +
      '• Retry recoverable failures\n' +
      '• Monitor DLQ trends';
  }

  /**
   * Get alert emoji based on type
   */
  private getAlertEmoji(alertType: 'critical' | 'warning' | 'info'): string {
    const emojis = {
      critical: '🚨',
      warning: '⚠️',
      info: 'ℹ️',
    };
    return emojis[alertType];
  }

  /**
   * Get alert type text
   */
  private getAlertTypeText(alertType: 'critical' | 'warning' | 'info'): string {
    const texts = {
      critical: 'CRITICAL - Immediate attention required',
      warning: 'WARNING - Review recommended',
      info: 'INFO - For awareness',
    };
    return texts[alertType];
  }

  /**
   * Get admin panel URL
   */
  private getAdminUrl(path: string): string {
    const baseUrl = this.configService.get('API_BASE_URL', 'http://localhost:3000');
    return `${baseUrl}${path}`;
  }

  /**
   * Get Grafana dashboard URL
   */
  private getGrafanaUrl(): string {
    const grafanaUrl = this.configService.get('GRAFANA_URL', 'http://localhost:3001');
    return `${grafanaUrl}/d/dlq-monitoring`;
  }
}
