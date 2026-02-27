import { Test, TestingModule } from '@nestjs/testing';
import { DSNParserService } from '../dsn-parser.service';

describe('DSNParserService', () => {
  let service: DSNParserService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [DSNParserService],
    }).compile();

    service = module.get<DSNParserService>(DSNParserService);
  });

  describe('parseDSN', () => {
    it('should parse a valid DSN message with hard bounce', () => {
      const dsnMessage = `
Reporting-MTA: dns; example.com
X-Original-Message-ID: <123@example.com>
Arrival-Date: Mon, 30 Oct 2025 10:00:00 +0000

Final-Recipient: rfc822; invalid@gmail.com
Action: failed
Status: 5.1.1
Remote-MTA: dns; gmail-smtp-in.l.google.com
Diagnostic-Code: smtp; 550 user not found
`;

      const result = service.parseDSN(dsnMessage);

      expect(result).toBeDefined();
      expect(result.reportingMTA).toBeDefined();
      expect(result.perRecipientFields).toHaveLength(1);
      expect(result.perRecipientFields[0].status).toBe('5.1.1');
      expect(result.perRecipientFields[0].finalRecipient).toBe('invalid@gmail.com');
    });

    it('should parse DSN with multiple bounced recipients', () => {
      const dsnMessage = `
Reporting-MTA: dns; example.com

Final-Recipient: rfc822; user1@gmail.com
Action: failed
Status: 5.1.1

Final-Recipient: rfc822; user2@yahoo.com
Action: failed
Status: 5.2.1
`;

      const result = service.parseDSN(dsnMessage);

      expect(result.perRecipientFields).toHaveLength(2);
      expect(result.perRecipientFields[0].finalRecipient).toBe('user1@gmail.com');
      expect(result.perRecipientFields[1].finalRecipient).toBe('user2@yahoo.com');
    });

    it('should classify hard bounce correctly', () => {
      const dsnMessage = `
Final-Recipient: rfc822; invalid@gmail.com
Action: failed
Status: 5.1.1
Diagnostic-Code: smtp; 550 user not found
`;

      const dsn = service.parseDSN(dsnMessage);
      const classification = service.classifyBounce(dsn);

      expect(classification.type).toBe('hard');
      expect(classification.shouldSuppress).toBe(true);
      expect(classification.reason).toBeDefined();
    });

    it('should classify soft bounce correctly', () => {
      const dsnMessage = `
Final-Recipient: rfc822; test@gmail.com
Action: delayed
Status: 4.4.2
Diagnostic-Code: smtp; 421 Service unavailable
`;

      const dsn = service.parseDSN(dsnMessage);
      const classification = service.classifyBounce(dsn);

      expect(classification.type).toBe('soft');
      expect(classification.shouldSuppress).toBe(false);
    });
  });

  describe('Extracting bounced emails from parsed DSN', () => {
    it('should contain all bounced emails in perRecipientFields', () => {
      const dsnMessage = `
Final-Recipient: rfc822; user1@gmail.com
Action: failed
Status: 5.1.1

Final-Recipient: rfc822; user2@yahoo.com
Action: failed
Status: 5.2.1
`;

      const dsn = service.parseDSN(dsnMessage);

      expect(dsn.perRecipientFields).toHaveLength(2);
      expect(dsn.perRecipientFields[0].finalRecipient).toBe('user1@gmail.com');
      expect(dsn.perRecipientFields[1].finalRecipient).toBe('user2@yahoo.com');
    });
  });

  describe('Real-world DSN examples', () => {
    it('should parse Gmail DSN hard bounce', () => {
      const gmailDSN = `
Reporting-MTA: dsn; gmail-smtp-in.l.google.com
Received-From-MTA: dsn; gmail-smtp-in.l.google.com (2607:f8b0:4004:c06::1a)
Arrival-Date: Mon, 30 Oct 2025 10:15:32 +0000

Final-Recipient: rfc822; nonexistent@gmail.com
Action: failed
Status: 5.1.1
Remote-MTA: dsn; gmail-smtp-in.l.google.com ([2607:f8b0:4004:c06::1a])
Diagnostic-Code: smtp; 550-5.1.1 The email account that you tried to reach does not exist
Last-Attempt-Date: Mon, 30 Oct 2025 10:15:31 +0000
`;

      const result = service.parseDSN(gmailDSN);

      expect(result.perRecipientFields[0].finalRecipient).toBe('nonexistent@gmail.com');
      expect(result.perRecipientFields[0].status).toBe('5.1.1');
      const classification = service.classifyBounce(result);
      expect(classification.type).toBe('hard');
    });

    it('should parse Outlook DSN mailbox full', () => {
      const outlookDSN = `
Reporting-MTA: dsn; mx.outlook.com
Arrival-Date: Mon, 30 Oct 2025 11:20:00 +0000

Final-Recipient: rfc822; fullbox@outlook.com
Action: failed
Status: 5.2.2
Remote-MTA: dsn; mx.outlook.com
Diagnostic-Code: smtp; 552 Mailbox full
Last-Attempt-Date: Mon, 30 Oct 2025 11:19:59 +0000
`;

      const result = service.parseDSN(outlookDSN);
      const classification = service.classifyBounce(result);

      expect(classification.type).toBe('hard');
      expect(result.perRecipientFields[0].status).toBe('5.2.2');
    });

    it('should parse transient error DSN', () => {
      const transientDSN = `
Reporting-MTA: dsn; mail.example.com
Arrival-Date: Mon, 30 Oct 2025 12:00:00 +0000

Final-Recipient: rfc822; user@test.com
Action: delayed
Status: 4.4.2
Remote-MTA: dsn; mail.test.com
Diagnostic-Code: smtp; 421 Service temporarily unavailable
Will-Retry-Until: Mon, 31 Oct 2025 12:00:00 +0000
`;

      const result = service.parseDSN(transientDSN);
      const classification = service.classifyBounce(result);

      expect(classification.type).toBe('soft');
      // will-retry-until is stored in the diagnosticCode field
      expect(result.perRecipientFields[0].diagnosticCode).toContain('will-retry-until');
    });
  });

  describe('Edge cases', () => {
    it('should handle DSN with no recipients', () => {
      const dsnMessage = `
Reporting-MTA: dns; example.com
`;

      const result = service.parseDSN(dsnMessage);

      expect(result.perRecipientFields).toHaveLength(0);
    });

    it('should handle malformed DSN gracefully', () => {
      const malformedDSN = `
This is not a valid DSN message
just some random text
`;

      const result = service.parseDSN(malformedDSN);

      expect(result).toBeDefined();
      expect(result.perRecipientFields).toHaveLength(0);
    });
  });
});
