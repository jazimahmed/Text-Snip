export class ClipboardService {
  /**
   * Copy plain text to clipboard using the Async Clipboard API with execCommand fallback.
   */
  public static async copyText(text: string): Promise<boolean> {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch (err) {
      console.warn('Async Clipboard API failed, attempting fallback:', err);
    }

    // Fallback using temporary textarea
    try {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.left = '-9999px';
      textarea.style.top = '-9999px';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      const successful = document.execCommand('copy');
      document.body.removeChild(textarea);
      return successful;
    } catch (fallbackErr) {
      console.error('Fallback clipboard copy failed:', fallbackErr);
      return false;
    }
  }

  /**
   * Copy image Blob to clipboard as PNG using ClipboardItem.
   */
  public static async copyImage(blob: Blob): Promise<boolean> {
    try {
      if (!navigator.clipboard || !window.ClipboardItem) {
        throw new Error('Async ClipboardItem API not supported in this browser context');
      }

      const item = new ClipboardItem({ 'image/png': blob });
      await navigator.clipboard.write([item]);
      return true;
    } catch (err) {
      console.error('Failed to copy image to clipboard:', err);
      return false;
    }
  }

  /**
   * Download image Blob as a PNG file with formatted timestamp.
   */
  public static downloadImage(blob: Blob, customFilename?: string): void {
    const today = new Date().toISOString().slice(0, 10);
    const filename = customFilename || `ocr-screenshot-${today}.png`;

    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    // Revoke object URL after brief delay
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

