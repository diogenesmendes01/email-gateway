/**
 * XSS Protection utilities
 * 
 * Provides functions to sanitize user input and prevent XSS attacks
 */

/**
 * Sanitizes user input by removing potentially dangerous characters
 * 
 * @param input - Input to sanitize (string, number, or undefined)
 * @returns Sanitized string safe for display
 */
export const sanitizeInput = (input: string | number | undefined): string => {
  if (input === undefined || input === null) return '';
  if (typeof input === 'number') return input.toString();
  return input.replace(/[<>]/g, '');
};

/**
 * Sanitizes HTML content by removing script tags and dangerous attributes
 * 
 * @param html - HTML content to sanitize
 * @returns Sanitized HTML content
 */
export const sanitizeHtml = (html: string): string => {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/on\w+="[^"]*"/gi, '')
    .replace(/javascript:/gi, '');
};

/**
 * Sanitizes URL by removing javascript: and data: protocols
 * 
 * @param url - URL to sanitize
 * @returns Sanitized URL
 */
export const sanitizeUrl = (url: string): string => {
  return url.replace(/^(javascript:|data:)/gi, '');
};
