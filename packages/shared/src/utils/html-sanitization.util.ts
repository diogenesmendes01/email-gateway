/**
 * HTML Sanitization Utility
 *
 * Provides functions to sanitize HTML content to prevent XSS attacks.
 * Uses sanitize-html library with a secure configuration.
 *
 * @see https://www.npmjs.com/package/sanitize-html
 */

import sanitizeHtml from 'sanitize-html';

/**
 * Allowed HTML tags for email content
 *
 * This allowlist includes tags commonly used in email templates
 * while excluding dangerous tags like <script>, <iframe>, <object>
 */
const ALLOWED_TAGS = [
  // Text formatting
  'p', 'br', 'hr', 'span', 'div',
  'strong', 'em', 'u', 'b', 'i', 's', 'strike', 'small', 'sub', 'sup',

  // Headings
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',

  // Lists
  'ul', 'ol', 'li',

  // Links and images
  'a', 'img',

  // Tables
  'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption', 'colgroup', 'col',

  // Blocks
  'blockquote', 'pre', 'code',

  // Semantic HTML5
  'section', 'article', 'header', 'footer', 'main', 'aside', 'nav',
];

/**
 * Allowed HTML attributes per tag
 *
 * Restricts attributes to safe ones, preventing event handlers
 * and other potentially dangerous attributes
 */
const ALLOWED_ATTRIBUTES: Record<string, string[]> = {
  // Links
  'a': ['href', 'title', 'target', 'rel'],

  // Images
  'img': ['src', 'alt', 'title', 'width', 'height', 'style'],

  // Tables
  'table': ['border', 'cellpadding', 'cellspacing', 'width', 'style'],
  'td': ['colspan', 'rowspan', 'align', 'valign', 'width', 'style'],
  'th': ['colspan', 'rowspan', 'align', 'valign', 'width', 'style'],

  // Global attributes (allowed on all tags)
  '*': ['class', 'id', 'style', 'dir', 'lang'],
};

/**
 * Allowed URL schemes
 *
 * Only http, https, and mailto are allowed to prevent
 * javascript:, data:, and other potentially dangerous schemes
 */
const ALLOWED_SCHEMES = ['http', 'https', 'mailto'];

/**
 * Allowed CSS properties in style attributes
 *
 * Restricts style attributes to safe properties only,
 * preventing expressions, behaviors, and other dangerous CSS
 */
const ALLOWED_STYLES = {
  '*': {
    // Layout
    'width': [/^\d+(?:px|em|rem|%)?$/],
    'height': [/^\d+(?:px|em|rem|%)?$/],
    'max-width': [/^\d+(?:px|em|rem|%)?$/],
    'max-height': [/^\d+(?:px|em|rem|%)?$/],
    'margin': [/^[\d\s]+(?:px|em|rem|%)?$/],
    'padding': [/^[\d\s]+(?:px|em|rem|%)?$/],

    // Typography
    'color': [/^#[0-9a-fA-F]{3,6}$/, /^rgb\([\d\s,]+\)$/, /^rgba\([\d\s,]+\)$/],
    'background-color': [/^#[0-9a-fA-F]{3,6}$/, /^rgb\([\d\s,]+\)$/, /^rgba\([\d\s,]+\)$/],
    'font-size': [/^\d+(?:px|em|rem|%)?$/],
    'font-family': [/.*/],
    'font-weight': [/^(?:normal|bold|bolder|lighter|\d+)$/],
    'font-style': [/^(?:normal|italic|oblique)$/],
    'text-align': [/^(?:left|right|center|justify)$/],
    'text-decoration': [/^(?:none|underline|overline|line-through)$/],
    'line-height': [/^\d+(?:px|em|rem|%)?$/],

    // Border
    'border': [/^[\d\s]+(?:px)?\s+(?:solid|dashed|dotted)?\s*#?[0-9a-fA-F]*$/],
    'border-radius': [/^\d+(?:px|em|rem|%)?$/],

    // Display
    'display': [/^(?:block|inline|inline-block|flex|grid|none)$/],
  },
};

/**
 * Sanitizes HTML content to prevent XSS attacks
 *
 * This function uses sanitize-html with a strict configuration
 * that:
 * - Removes dangerous tags (<script>, <iframe>, <object>, etc.)
 * - Removes dangerous attributes (onclick, onerror, etc.)
 * - Restricts URL schemes to http/https/mailto only
 * - Validates CSS in style attributes
 *
 * @param html - Raw HTML content to sanitize
 * @returns Sanitized HTML content safe for rendering
 *
 * @example
 * ```typescript
 * const unsafe = '<p>Hello</p><script>alert("xss")</script>';
 * const safe = sanitizeEmailHtml(unsafe);
 * // Result: '<p>Hello</p>' (script tag removed)
 * ```
 */
export function sanitizeEmailHtml(html: string): string {
  if (!html || typeof html !== 'string') {
    return '';
  }

  return sanitizeHtml(html, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: ALLOWED_ATTRIBUTES,
    allowedSchemes: ALLOWED_SCHEMES,
    allowedStyles: ALLOWED_STYLES,

    // Remove tags not in allowlist (don't just escape them)
    disallowedTagsMode: 'discard',

    // Self-closing tags
    selfClosing: ['img', 'br', 'hr'],

    // Enforce external links to open in new tab with noopener
    transformTags: {
      'a': (_tagName, attribs) => {
        return {
          tagName: 'a',
          attribs: {
            ...attribs,
            target: '_blank',
            rel: 'noopener noreferrer',
          },
        };
      },
    },
  });
}

/**
 * Validates if HTML content is safe (no dangerous content detected)
 *
 * This function checks if sanitization would modify the HTML.
 * Useful for validation without modifying the original content.
 *
 * @param html - HTML content to validate
 * @returns true if HTML is safe, false if it contains dangerous content
 *
 * @example
 * ```typescript
 * isHtmlSafe('<p>Hello</p>'); // true
 * isHtmlSafe('<script>alert("xss")</script>'); // false
 * ```
 */
export function isHtmlSafe(html: string): boolean {
  if (!html) return true;

  const sanitized = sanitizeEmailHtml(html);

  // If sanitization removed/modified content, it wasn't safe
  // Note: We normalize whitespace before comparison
  const normalizedOriginal = html.replace(/\s+/g, ' ').trim();
  const normalizedSanitized = sanitized.replace(/\s+/g, ' ').trim();

  return normalizedOriginal === normalizedSanitized;
}

/**
 * Gets a list of dangerous patterns found in HTML
 *
 * Useful for debugging or providing detailed error messages
 *
 * @param html - HTML content to analyze
 * @returns Array of dangerous patterns found
 */
export function getDangerousPatterns(html: string): string[] {
  if (!html) return [];

  const patterns: string[] = [];

  // Check for dangerous tags
  const dangerousTags = [
    'script', 'iframe', 'object', 'embed', 'link', 'style',
    'form', 'input', 'button', 'textarea', 'select',
    'meta', 'base', 'frame', 'frameset',
  ];

  for (const tag of dangerousTags) {
    const regex = new RegExp(`<${tag}[\\s>]`, 'gi');
    if (regex.test(html)) {
      patterns.push(`<${tag}> tag`);
    }
  }

  // Check for event handlers
  const eventHandlers = [
    'onclick', 'onerror', 'onload', 'onmouseover', 'onmouseout',
    'onfocus', 'onblur', 'onchange', 'onsubmit',
  ];

  for (const handler of eventHandlers) {
    const regex = new RegExp(`${handler}\\s*=`, 'gi');
    if (regex.test(html)) {
      patterns.push(`${handler} event handler`);
    }
  }

  // Check for dangerous URL schemes
  const dangerousSchemes = ['javascript:', 'data:', 'vbscript:'];

  for (const scheme of dangerousSchemes) {
    if (html.toLowerCase().includes(scheme)) {
      patterns.push(`${scheme} URL scheme`);
    }
  }

  return patterns;
}
