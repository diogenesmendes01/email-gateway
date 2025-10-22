/**
 * Runbooks Mapping Utility
 *
 * Maps error codes and statuses to troubleshooting documentation
 * TASK 9.2: Integração com logs/eventos e runbooks
 */

export interface RunbookLink {
  title: string;
  url: string;
  description: string;
}

/**
 * Map error codes to runbook documentation
 */
export function getRunbookForError(errorCode?: string): RunbookLink | null {
  if (!errorCode) return null;

  const code = errorCode.toUpperCase();

  // SES Errors
  if (code.includes('SES') || code.includes('AWS') || code.includes('MESSAGEREJECTED')) {
    return {
      title: 'SES Failures Troubleshooting',
      url: 'https://docs.aws.amazon.com/ses/latest/dg/sending-email-troubleshooting.html',
      description: 'Troubleshoot AWS SES email sending failures',
    };
  }

  // Rate Limit Errors
  if (code.includes('RATE_LIMIT') || code.includes('THROTTLE') || code.includes('TOOMANYREQUESTS')) {
    return {
      title: 'Rate Limiting Guide',
      url: '/docs/rate-limits',
      description: 'Understanding rate limits and how to handle them',
    };
  }

  // Timeout Errors
  if (code.includes('TIMEOUT') || code.includes('TIMEDOUT')) {
    return {
      title: 'Timeout Issues',
      url: '/docs/performance-tuning',
      description: 'Resolving timeout and performance issues',
    };
  }

  // Network Errors
  if (code.includes('NETWORK') || code.includes('CONNECTION') || code.includes('ECONNREFUSED')) {
    return {
      title: 'Network Connectivity',
      url: '/docs/network-issues',
      description: 'Diagnosing network and connectivity problems',
    };
  }

  // Validation Errors
  if (code.includes('VALIDATION') || code.includes('INVALID')) {
    return {
      title: 'Input Validation',
      url: '/docs/api-validation',
      description: 'Understanding API validation rules',
    };
  }

  // Authentication Errors
  if (code.includes('AUTH') || code.includes('UNAUTHORIZED') || code.includes('FORBIDDEN')) {
    return {
      title: 'Authentication Issues',
      url: '/docs/authentication',
      description: 'Resolving authentication and authorization problems',
    };
  }

  return null;
}

/**
 * Get runbook based on email status
 */
export function getRunbookForStatus(status: string): RunbookLink | null {
  switch (status.toUpperCase()) {
    case 'FAILED':
      return {
        title: 'Failed Emails Troubleshooting',
        url: '/docs/runbooks/failed-emails',
        description: 'Steps to diagnose and resolve failed email deliveries',
      };

    case 'RETRYING':
      return {
        title: 'Retry Strategy',
        url: '/docs/worker/retry-strategy',
        description: 'Understanding the email retry mechanism',
      };

    case 'PENDING':
    case 'ENQUEUED':
      return {
        title: 'Queue Processing',
        url: '/docs/queue-redis/queue-overview',
        description: 'How the email queue works and processing times',
      };

    default:
      return null;
  }
}

/**
 * Get all relevant runbooks for an email
 */
export function getRunbooksForEmail(email: {
  status: string;
  errorCode?: string;
}): RunbookLink[] {
  const runbooks: RunbookLink[] = [];

  // Add error-specific runbook
  if (email.errorCode) {
    const errorRunbook = getRunbookForError(email.errorCode);
    if (errorRunbook) {
      runbooks.push(errorRunbook);
    }
  }

  // Add status-specific runbook
  const statusRunbook = getRunbookForStatus(email.status);
  if (statusRunbook) {
    runbooks.push(statusRunbook);
  }

  // Add general operational runbook
  runbooks.push({
    title: 'Operational Runbook',
    url: '/docs/runbooks/operational-runbook',
    description: 'General operational procedures and troubleshooting',
  });

  return runbooks;
}
