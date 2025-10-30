import crypto from 'crypto';

export class ReturnPathGenerator {
  static generate(recipientEmail: string, domain: string): string {
    const hash = crypto
      .createHash('sha256')
      .update(`${recipientEmail}:${Date.now()}`)
      .digest('hex')
      .slice(0, 16);

    return `bounce+${hash}@${domain}`;
  }
}

