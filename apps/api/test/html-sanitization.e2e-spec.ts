/**
 * HTML Sanitization E2E Tests
 *
 * TASK-001: Validação end-to-end da sanitização HTML
 *
 * Testa o fluxo completo:
 * 1. API recebe HTML malicioso
 * 2. HTML é sanitizado automaticamente
 * 3. HTML seguro é salvo no banco
 * 4. Worker processa email com HTML seguro
 */

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaClient } from '@email-gateway/database';
import { sanitizeEmailHtml } from '@email-gateway/shared';

describe('HTML Sanitization (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  const testApiKey = 'test-api-key-' + Date.now();
  let companyId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ transform: true }));
    await app.init();

    prisma = new PrismaClient();

    // Create test company
    const company = await prisma.company.create({
      data: {
        name: 'Test Company HTML Sanitization',
        apiKey: testApiKey,
        apiKeyHash: testApiKey, // Simplified for testing
        isActive: true,
        dailyEmailLimit: 1000,
      },
    });
    companyId = company.id;
  });

  afterAll(async () => {
    // Cleanup test data
    await prisma.emailOutbox.deleteMany({
      where: { companyId },
    });
    await prisma.company.delete({
      where: { id: companyId },
    });
    await prisma.$disconnect();
    await app.close();
  });

  describe('XSS Prevention', () => {
    it('should remove <script> tags', async () => {
      const maliciousHtml = '<p>Hello</p><script>alert("XSS")</script><p>World</p>';

      const response = await request(app.getHttpServer())
        .post('/v1/email/send')
        .set('x-api-key', testApiKey)
        .send({
          to: 'victim@example.com',
          subject: 'Test XSS Prevention',
          html: maliciousHtml,
        })
        .expect(202);

      expect(response.body).toHaveProperty('id');

      // Verify HTML was sanitized in database
      const outbox = await prisma.emailOutbox.findUnique({
        where: { id: response.body.id },
      });

      expect(outbox).toBeDefined();
      expect(outbox!.html).not.toContain('<script>');
      expect(outbox!.html).not.toContain('alert');
      expect(outbox!.html).toContain('<p>Hello</p>');
      expect(outbox!.html).toContain('<p>World</p>');
    });

    it('should remove event handlers (onclick, onerror, etc)', async () => {
      const maliciousHtml = `
        <p>Normal text</p>
        <img src="x" onerror="alert('XSS')" />
        <a href="#" onclick="alert('XSS')">Click me</a>
        <div onmouseover="alert('XSS')">Hover me</div>
      `;

      const response = await request(app.getHttpServer())
        .post('/v1/email/send')
        .set('x-api-key', testApiKey)
        .send({
          to: 'victim@example.com',
          subject: 'Test Event Handler Removal',
          html: maliciousHtml,
        })
        .expect(202);

      const outbox = await prisma.emailOutbox.findUnique({
        where: { id: response.body.id },
      });

      expect(outbox!.html).not.toContain('onerror');
      expect(outbox!.html).not.toContain('onclick');
      expect(outbox!.html).not.toContain('onmouseover');
      expect(outbox!.html).not.toContain("alert('XSS')");
    });

    it('should remove <iframe> tags', async () => {
      const maliciousHtml = `
        <p>Text before</p>
        <iframe src="https://evil.com/steal-cookies"></iframe>
        <p>Text after</p>
      `;

      const response = await request(app.getHttpServer())
        .post('/v1/email/send')
        .set('x-api-key', testApiKey)
        .send({
          to: 'victim@example.com',
          subject: 'Test iframe Removal',
          html: maliciousHtml,
        })
        .expect(202);

      const outbox = await prisma.emailOutbox.findUnique({
        where: { id: response.body.id },
      });

      expect(outbox!.html).not.toContain('<iframe');
      expect(outbox!.html).not.toContain('evil.com');
      expect(outbox!.html).toContain('Text before');
      expect(outbox!.html).toContain('Text after');
    });

    it('should sanitize dangerous URL schemes', async () => {
      const maliciousHtml = `
        <a href="javascript:alert('XSS')">Click me</a>
        <a href="data:text/html,<script>alert('XSS')</script>">Data URL</a>
        <a href="vbscript:msgbox('XSS')">VBScript</a>
        <a href="https://safe.com">Safe link</a>
      `;

      const response = await request(app.getHttpServer())
        .post('/v1/email/send')
        .set('x-api-key', testApiKey)
        .send({
          to: 'victim@example.com',
          subject: 'Test URL Scheme Sanitization',
          html: maliciousHtml,
        })
        .expect(202);

      const outbox = await prisma.emailOutbox.findUnique({
        where: { id: response.body.id },
      });

      expect(outbox!.html).not.toContain('javascript:');
      expect(outbox!.html).not.toContain('data:');
      expect(outbox!.html).not.toContain('vbscript:');
      expect(outbox!.html).toContain('https://safe.com');
    });

    it('should remove <object> and <embed> tags', async () => {
      const maliciousHtml = `
        <p>Text</p>
        <object data="malicious.swf"></object>
        <embed src="malicious.swf">
        <p>More text</p>
      `;

      const response = await request(app.getHttpServer())
        .post('/v1/email/send')
        .set('x-api-key', testApiKey)
        .send({
          to: 'victim@example.com',
          subject: 'Test object/embed Removal',
          html: maliciousHtml,
        })
        .expect(202);

      const outbox = await prisma.emailOutbox.findUnique({
        where: { id: response.body.id },
      });

      expect(outbox!.html).not.toContain('<object');
      expect(outbox!.html).not.toContain('<embed');
      expect(outbox!.html).not.toContain('malicious.swf');
    });
  });

  describe('Safe HTML Preservation', () => {
    it('should preserve safe HTML tags', async () => {
      const safeHtml = `
        <h1>Title</h1>
        <p>Paragraph with <strong>bold</strong> and <em>italic</em></p>
        <ul>
          <li>Item 1</li>
          <li>Item 2</li>
        </ul>
        <a href="https://example.com">Link</a>
        <img src="https://example.com/image.png" alt="Image" />
      `;

      const response = await request(app.getHttpServer())
        .post('/v1/email/send')
        .set('x-api-key', testApiKey)
        .send({
          to: 'user@example.com',
          subject: 'Test Safe HTML',
          html: safeHtml,
        })
        .expect(202);

      const outbox = await prisma.emailOutbox.findUnique({
        where: { id: response.body.id },
      });

      expect(outbox!.html).toContain('<h1>');
      expect(outbox!.html).toContain('<p>');
      expect(outbox!.html).toContain('<strong>');
      expect(outbox!.html).toContain('<em>');
      expect(outbox!.html).toContain('<ul>');
      expect(outbox!.html).toContain('<li>');
      expect(outbox!.html).toContain('<a href');
      expect(outbox!.html).toContain('<img');
    });

    it('should preserve safe inline CSS', async () => {
      const htmlWithCSS = `
        <p style="color: #ff0000; font-size: 16px;">Red text</p>
        <div style="background-color: #00ff00; padding: 10px;">Green background</div>
      `;

      const response = await request(app.getHttpServer())
        .post('/v1/email/send')
        .set('x-api-key', testApiKey)
        .send({
          to: 'user@example.com',
          subject: 'Test CSS Preservation',
          html: htmlWithCSS,
        })
        .expect(202);

      const outbox = await prisma.emailOutbox.findUnique({
        where: { id: response.body.id },
      });

      expect(outbox!.html).toContain('style=');
      expect(outbox!.html).toContain('color');
      expect(outbox!.html).toContain('background-color');
    });
  });

  describe('Complex Attack Vectors', () => {
    it('should handle nested and obfuscated XSS attempts', async () => {
      const complexXSS = `
        <p>Text</p>
        <div>
          <span>
            <script>alert('XSS')</script>
          </span>
        </div>
        <a href="javascript:void(0)" onclick="window.location='https://evil.com'">Click</a>
      `;

      const response = await request(app.getHttpServer())
        .post('/v1/email/send')
        .set('x-api-key', testApiKey)
        .send({
          to: 'user@example.com',
          subject: 'Complex XSS Test',
          html: complexXSS,
        })
        .expect(202);

      const outbox = await prisma.emailOutbox.findUnique({
        where: { id: response.body.id },
      });

      expect(outbox!.html).not.toContain('<script>');
      expect(outbox!.html).not.toContain('javascript:');
      expect(outbox!.html).not.toContain('onclick');
      expect(outbox!.html).not.toContain('evil.com');
    });

    it('should sanitize email templates with variables', async () => {
      const templateWithXSS = `
        <p>Hello {{name}}</p>
        <script>alert('XSS')</script>
        <p>Your order {{orderId}} is ready</p>
      `;

      const response = await request(app.getHttpServer())
        .post('/v1/email/send')
        .set('x-api-key', testApiKey)
        .send({
          to: 'user@example.com',
          subject: 'Template Test',
          html: templateWithXSS,
        })
        .expect(202);

      const outbox = await prisma.emailOutbox.findUnique({
        where: { id: response.body.id },
      });

      // Variables should be preserved
      expect(outbox!.html).toContain('{{name}}');
      expect(outbox!.html).toContain('{{orderId}}');
      // Script should be removed
      expect(outbox!.html).not.toContain('<script>');
    });
  });

  describe('Unit: Direct sanitizeEmailHtml function', () => {
    it('should match expected behavior', () => {
      const tests = [
        {
          input: '<p>Hello</p><script>alert("xss")</script>',
          shouldNotContain: ['<script>', 'alert'],
          shouldContain: ['<p>Hello</p>'],
        },
        {
          input: '<img src="x" onerror="alert(1)">',
          shouldNotContain: ['onerror', 'alert'],
          shouldContain: ['<img'],
        },
        {
          input: '<a href="javascript:void(0)">Link</a>',
          shouldNotContain: ['javascript:'],
          shouldContain: ['<a', 'Link'],
        },
      ];

      tests.forEach(({ input, shouldNotContain, shouldContain }) => {
        const result = sanitizeEmailHtml(input);

        shouldNotContain.forEach(bad => {
          expect(result).not.toContain(bad);
        });

        shouldContain.forEach(good => {
          expect(result).toContain(good);
        });
      });
    });
  });
});
