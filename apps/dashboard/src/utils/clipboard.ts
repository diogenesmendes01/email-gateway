/**
 * Clipboard Utility
 *
 * Helper functions for copying text to clipboard with feedback
 * TASK 9.2: Integração com logs/eventos e runbooks
 */

/**
 * Copy text to clipboard
 *
 * @param text - Text to copy
 * @returns Promise that resolves to true if successful, false otherwise
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    // Modern Clipboard API
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }

    // Fallback for older browsers
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.left = '-999999px';
    textArea.style.top = '-999999px';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();

    try {
      const successful = document.execCommand('copy');
      document.body.removeChild(textArea);
      return successful;
    } catch (err) {
      document.body.removeChild(textArea);
      return false;
    }
  } catch (err) {
    console.error('Failed to copy text:', err);
    return false;
  }
}

/**
 * Copy text with toast notification
 *
 * @param text - Text to copy
 * @param label - Label for the copied text (e.g., "ID", "Request ID")
 * @param onSuccess - Callback for successful copy
 * @param onError - Callback for failed copy
 */
export async function copyWithFeedback(
  text: string,
  label: string = 'Text',
  onSuccess?: () => void,
  onError?: () => void,
): Promise<void> {
  const success = await copyToClipboard(text);

  if (success) {
    console.log(`${label} copied to clipboard`);
    onSuccess?.();
  } else {
    console.error(`Failed to copy ${label}`);
    onError?.();
  }
}
