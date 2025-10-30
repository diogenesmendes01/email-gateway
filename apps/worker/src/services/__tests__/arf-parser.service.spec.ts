import { Test, TestingModule } from '@nestjs/testing';
import { ARFParserService } from '../arf-parser.service';

describe('ARFParserService', () => {
  let service: ARFParserService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ARFParserService],
    }).compile();

    service = module.get<ARFParserService>(ARFParserService);
  });

  describe('parseARF', () => {
    it('should parse a valid spam complaint ARF', () => {
      const arfMessage = `
Version: 1.0
User-Agent: Gmail/1.0
Feedback-Type: abuse
Reporting-MUA: mail.gmail.com
Source-IP: 203.0.113.42
Arrival-Date: Mon, 30 Oct 2025 10:00:00 +0000

From: sender@example.com <sender@example.com>
To: recipient@gmail.com
Subject: Test Email
Message-ID: <test123@example.com>

This is the original message body that was reported as spam.
`;

      const result = service.parseARF(arfMessage);

      expect(result).toBeDefined();
      expect(result.version).toBe('1.0');
      expect(result.feedbackType).toBe('abuse');
      expect(result.sourceIP).toBe('203.0.113.42');
      expect(result.reportingMUA).toBe('mail.gmail.com');
    });

    it('should extract complaint info from ARF', () => {
      const arfMessage = `
Version: 1.0
Feedback-Type: abuse

From: sender@example.com
To: victim@gmail.com
Subject: Spam Report
Message-ID: <msg123@example.com>
`;

      const arf = service.parseARF(arfMessage);
      const complaint = service.extractComplaint(arf);

      expect(complaint).toBeDefined();
      expect(complaint.feedbackType).toBe('abuse');
      expect(complaint.timestamp).toBeDefined();
    });

    it('should parse auth failure ARF', () => {
      const arfMessage = `
Version: 1.0
Feedback-Type: auth-failure
Auth-Failure: dkim
Reporting-MUA: mail.example.com

From: sender@example.com
Subject: Auth Failed Email
Message-ID: <auth-test@example.com>
`;

      const arf = service.parseARF(arfMessage);
      const authFailure = service.extractAuthFailure(arf);

      expect(authFailure).toBeDefined();
      expect(authFailure?.authMethod).toBe('dkim');
    });

    it('should handle different feedback types', () => {
      const feedbackTypes = ['abuse', 'fraud', 'auth-failure', 'not-spam', 'opt-out', 'complaint'];

      for (const feedbackType of feedbackTypes) {
        const arfMessage = `
Version: 1.0
Feedback-Type: ${feedbackType}

From: sender@example.com
Message-ID: <test@example.com>
`;

        const arf = service.parseARF(arfMessage);
        expect(arf.feedbackType).toMatch(/abuse|fraud|auth-failure|not-spam|opt-out|complaint|other/);
      }
    });
  });

  describe('extractComplaint', () => {
    it('should extract email from To field', () => {
      const arfMessage = `
Version: 1.0
Feedback-Type: abuse

From: sender@example.com
To: victim@gmail.com
Message-ID: <test@example.com>
`;

      const arf = service.parseARF(arfMessage);
      const complaint = service.extractComplaint(arf);

      expect(complaint.email).toBe('victim@gmail.com');
    });

    it('should handle email with display name', () => {
      const arfMessage = `
Version: 1.0
Feedback-Type: abuse

From: "Sender Name" <sender@example.com>
To: "Victim Name" <victim@gmail.com>
Message-ID: <test@example.com>
`;

      const arf = service.parseARF(arfMessage);
      const complaint = service.extractComplaint(arf);

      expect(complaint.email).toBe('victim@gmail.com');
    });
  });

  describe('Real-world ARF examples', () => {
    it('should parse Gmail abuse report', () => {
      const gmailARF = `
Version: 1.0
User-Agent: Gmail/1.0
Feedback-Type: abuse
Reporting-MUA: dsn; mail-oi1-f175.google.com
Arrival-Date: Mon, 30 Oct 2025 10:15:32 +0000
Source-IP: 203.0.113.42

From: marketing@company.com <marketing@company.com>
To: user@gmail.com
Subject: Newsletter - 30 Oct 2025
Message-ID: <campaign-123@company.com>
Date: Mon, 30 Oct 2025 09:00:00 +0000

This is a marketing email that was reported as spam by the recipient.
`;

      const arf = service.parseARF(gmailARF);

      expect(arf.feedbackType).toBe('abuse');
      expect(arf.sourceIP).toBe('203.0.113.42');
      expect(arf.userAgent).toBe('Gmail/1.0');

      const complaint = service.extractComplaint(arf);
      expect(complaint.email).toBe('user@gmail.com');
      expect(complaint.feedbackType).toBe('abuse');
    });

    it('should parse Outlook complaint report', () => {
      const outlookARF = `
Version: 1.0
User-Agent: Outlook/1.0
Feedback-Type: complaint
Reporting-MUA: dsn; pod51010.outlook.com
Source-IP: 198.51.100.5
Arrival-Date: Mon, 30 Oct 2025 11:20:00 +0000

From: noreply@service.com
To: user@outlook.com
Subject: Service Notification
Message-ID: <notify-456@service.com>

Service notification that was reported as unwanted.
`;

      const arf = service.parseARF(outlookARF);

      expect(arf.feedbackType).toBe('complaint');
      expect(arf.sourceIP).toBe('198.51.100.5');
    });

    it('should parse DKIM auth failure report', () => {
      const dkimFailureARF = `
Version: 1.0
Feedback-Type: auth-failure
Auth-Failure: dkim
Reporting-MUA: dsn; authenticator.mx.example.com
Source-IP: 192.0.2.1
Arrival-Date: Mon, 30 Oct 2025 12:00:00 +0000

From: sender@unsigned-domain.com
To: admin@example.com
Subject: Email with DKIM failure
Message-ID: <unsigned-msg@unsigned-domain.com>

This email failed DKIM signature verification.
`;

      const arf = service.parseARF(dkimFailureARF);
      const authFailure = service.extractAuthFailure(arf);

      expect(authFailure).toBeDefined();
      expect(authFailure?.authMethod).toBe('dkim');
      expect(authFailure?.domain).toBe('unsigned-domain.com');
    });

    it('should parse SPF auth failure report', () => {
      const spfFailureARF = `
Version: 1.0
Feedback-Type: auth-failure
Auth-Failure: spf
Reporting-MUA: dsn; authenticator.mx.example.com
Source-IP: 192.0.2.2

From: sender@non-spf-domain.com
Message-ID: <spf-fail@non-spf-domain.com>
`;

      const arf = service.parseARF(spfFailureARF);
      const authFailure = service.extractAuthFailure(arf);

      expect(authFailure?.authMethod).toBe('spf');
    });

    it('should parse not-spam (whitelist) report', () => {
      const notSpamARF = `
Version: 1.0
Feedback-Type: not-spam
Reporting-MUA: dsn; mail.example.com

From: trusted@company.com
To: user@example.com
Subject: Whitelisting Test
Message-ID: <whitelist-789@company.com>

This was marked as not spam (whitelisted) by the user.
`;

      const arf = service.parseARF(notSpamARF);

      expect(arf.feedbackType).toBe('not-spam');
    });
  });

  describe('validateARF', () => {
    it('should validate correct ARF', () => {
      const arfMessage = `
Version: 1.0
Feedback-Type: abuse

From: sender@example.com
Message-ID: <test@example.com>
`;

      const arf = service.parseARF(arfMessage);
      const validation = service.validateARF(arf);

      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    it('should detect missing feedback-type', () => {
      const arfMessage = `
Version: 1.0

From: sender@example.com
Message-ID: <test@example.com>
`;

      const arf = service.parseARF(arfMessage);
      const validation = service.validateARF(arf);

      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain('Missing feedback-type');
    });
  });

  describe('Edge cases', () => {
    it('should handle empty ARF gracefully', () => {
      const emptyARF = '';

      const arf = service.parseARF(emptyARF);

      expect(arf).toBeDefined();
      expect(arf.version).toBe('1.0');
    });

    it('should handle ARF with minimal headers', () => {
      const minimalARF = `
Version: 1.0
Feedback-Type: abuse
`;

      const arf = service.parseARF(minimalARF);

      expect(arf.feedbackType).toBe('abuse');
      expect(arf.originalHeaders).toBeDefined();
    });

    it('should truncate long messages', () => {
      let longMessage = `
Version: 1.0
Feedback-Type: abuse

From: sender@example.com
Message-ID: <test@example.com>

`;
      longMessage += 'a'.repeat(2000);

      const arf = service.parseARF(longMessage);

      expect(arf.originalMessage).toBeDefined();
      expect(arf.originalMessage!.length).toBeLessThanOrEqual(1000 + 3); // +3 for '...'
    });
  });
});
