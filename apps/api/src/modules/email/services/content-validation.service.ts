/**
 * @email-gateway/api - Content Validation Service
 *
 * Service para validar conteúdo de emails antes do envio
 *
 * TASK-031: Content Validation Service
 * Detecta spam words, links suspeitos, emails descartáveis, tags proibidas
 */

import { Injectable, Logger } from '@nestjs/common';

/**
 * Resultado da validação de conteúdo
 */
export interface ContentValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  score: number;
}

/**
 * Dados de email para validação
 */
export interface EmailContent {
  to: string;
  subject: string;
  html: string;
}

/**
 * Service de validação de conteúdo de emails
 */
@Injectable()
export class ContentValidationService {
  private readonly logger = new Logger(ContentValidationService.name);

  // Lista de palavras suspeitas de spam
  private readonly SPAM_WORDS = [
    'click here',
    'buy now',
    'limited time',
    'free money',
    'viagra',
    'casino',
    'lottery',
    'nigerian prince',
    'urgent action',
    'congratulations',
    'you have won',
    'claim now',
    'act now',
    'free trial',
    'risk free',
    'guarantee',
    'no obligation',
    'while supplies last',
    'order now',
    'double your income',
  ];

  // Domínios de email descartável conhecidos
  private readonly DISPOSABLE_DOMAINS = [
    'temp-mail.com',
    'guerrillamail.com',
    '10minutemail.com',
    'mailinator.com',
    'throwaway.email',
    'tempmail.com',
    'yopmail.com',
    'maildrop.cc',
    'trashmail.com',
    'getnada.com',
  ];

  // Serviços de URL shortener suspeitos
  private readonly URL_SHORTENERS = [
    'bit.ly',
    'tinyurl.com',
    'goo.gl',
    't.co',
    'ow.ly',
    'is.gd',
    'buff.ly',
    'adf.ly',
  ];

  // Threshold de spam score (0-100)
  private readonly SPAM_SCORE_THRESHOLD = 50;

  /**
   * Valida o conteúdo de um email
   * TASK-031: Main validation method
   */
  async validateEmail(email: EmailContent): Promise<ContentValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];
    let score = 0;

    try {
      // 1. Validar email descartável (ERRO - 50 pontos)
      if (this.isDisposableEmail(email.to)) {
        errors.push('Disposable email domain not allowed');
        score += 50;
        this.logger.warn({
          message: 'Disposable email detected',
          to: email.to,
        });
      }

      // 2. Detectar spam words (WARNING - 5 pontos cada)
      const spamWords = this.detectSpamWords(email.subject + ' ' + email.html);
      if (spamWords.length > 0) {
        warnings.push(`Spam words detected: ${spamWords.join(', ')}`);
        score += spamWords.length * 5;
        this.logger.warn({
          message: 'Spam words detected',
          count: spamWords.length,
          words: spamWords,
        });
      }

      // 3. Detectar links suspeitos (WARNING - 10 pontos cada)
      const suspiciousLinks = this.detectSuspiciousLinks(email.html);
      if (suspiciousLinks.length > 0) {
        warnings.push(`Suspicious links detected: ${suspiciousLinks.length} link(s)`);
        score += suspiciousLinks.length * 10;
        this.logger.warn({
          message: 'Suspicious links detected',
          count: suspiciousLinks.length,
          links: suspiciousLinks,
        });
      }

      // 4. Validar tags HTML proibidas (ERRO - 50 pontos)
      const forbiddenTags = this.detectForbiddenTags(email.html);
      if (forbiddenTags.length > 0) {
        errors.push(`Forbidden HTML tags not allowed: ${forbiddenTags.join(', ')}`);
        score += 50;
        this.logger.warn({
          message: 'Forbidden HTML tags detected',
          tags: forbiddenTags,
        });
      }

      // 5. Validar proporção texto/HTML (WARNING - 15 pontos)
      const textRatio = this.calculateTextRatio(email.html);
      if (textRatio < 0.1) {
        warnings.push(`Low text-to-HTML ratio: ${(textRatio * 100).toFixed(1)}%`);
        score += 15;
        this.logger.warn({
          message: 'Low text-to-HTML ratio',
          ratio: textRatio,
        });
      }

      // Determina se é válido
      const valid = errors.length === 0 && score < this.SPAM_SCORE_THRESHOLD;

      this.logger.debug({
        message: 'Content validation completed',
        valid,
        score,
        errorCount: errors.length,
        warningCount: warnings.length,
      });

      return {
        valid,
        errors,
        warnings,
        score,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      this.logger.error({
        message: 'Failed to validate email content',
        error: errorMessage,
      });

      // Em caso de erro, permite o envio (fail-open)
      return {
        valid: true,
        errors: [],
        warnings: [`Validation service error: ${errorMessage}`],
        score: 0,
      };
    }
  }

  /**
   * Verifica se o email é de um domínio descartável
   * TASK-031: Disposable email check
   */
  private isDisposableEmail(email: string): boolean {
    const domain = email.split('@')[1]?.toLowerCase();
    if (!domain) return false;

    return this.DISPOSABLE_DOMAINS.some((disposable) => domain === disposable);
  }

  /**
   * Detecta spam words no conteúdo
   * TASK-031: Spam word detection
   */
  private detectSpamWords(content: string): string[] {
    const lowerContent = content.toLowerCase();
    const found: string[] = [];

    for (const word of this.SPAM_WORDS) {
      if (lowerContent.includes(word)) {
        found.push(word);
      }
    }

    return found;
  }

  /**
   * Detecta links suspeitos no HTML
   * TASK-031: Suspicious link detection
   */
  private detectSuspiciousLinks(html: string): string[] {
    const suspicious: string[] = [];

    // Regex para extrair URLs de href e src
    const urlRegex = /(?:href|src)=["']([^"']+)["']/gi;
    let match;

    while ((match = urlRegex.exec(html)) !== null) {
      const url = match[1];

      // 1. Verifica se é URL shortener
      const isShortener = this.URL_SHORTENERS.some((shortener) =>
        url.toLowerCase().includes(shortener),
      );

      // 2. Verifica se usa IP em vez de domínio
      const ipPattern = /https?:\/\/\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/;
      const isIpAddress = ipPattern.test(url);

      if (isShortener || isIpAddress) {
        suspicious.push(url);
      }
    }

    return suspicious;
  }

  /**
   * Detecta tags HTML proibidas
   * TASK-031: Forbidden tag detection
   */
  private detectForbiddenTags(html: string): string[] {
    const forbidden: string[] = [];

    // Tags proibidas por segurança
    const forbiddenPatterns = [
      { pattern: /<script[\s>]/i, tag: 'script' },
      { pattern: /<iframe[\s>]/i, tag: 'iframe' },
      { pattern: /<object[\s>]/i, tag: 'object' },
      { pattern: /<embed[\s>]/i, tag: 'embed' },
      { pattern: /<form[\s>]/i, tag: 'form' },
    ];

    for (const { pattern, tag } of forbiddenPatterns) {
      if (pattern.test(html)) {
        forbidden.push(tag);
      }
    }

    return forbidden;
  }

  /**
   * Calcula a proporção de texto em relação ao HTML total
   * TASK-031: Text-to-HTML ratio
   */
  private calculateTextRatio(html: string): number {
    if (!html || html.length === 0) return 0;

    // Remove tags HTML e conta apenas o texto
    const textOnly = html.replace(/<[^>]*>/g, '').trim();
    const textLength = textOnly.length;
    const htmlLength = html.length;

    if (htmlLength === 0) return 0;

    return textLength / htmlLength;
  }
}
