import { OcrService } from '../ocr/ocr-service';
import { ExtensionMessage } from '../types/messages';

console.log('[TextSnip Offscreen] OCR environment active');

void OcrService.warmup('eng')
  .then(() => {
    console.log('[TextSnip Offscreen] OCR worker warmed up');
  })
  .catch((err) => {
    console.warn('[TextSnip Offscreen] OCR warmup failed:', err);
  });

chrome.runtime.onMessage.addListener((message: ExtensionMessage, _sender, sendResponse) => {
  if (message.type === 'EXECUTE_OCR') {
    const { image, language } = message.payload;
    const tabId = (message as any).tabId;

    console.debug('[TextSnip Offscreen] Received OCR request', {
      tabId,
      language,
      imageLength: image.length,
      imagePrefix: image.slice(0, 32)
    });

    // Run OCR and send progress + result via service worker → content script tab
    OcrService.recognize(image, language, (update) => {
      chrome.runtime.sendMessage({
        type: 'OCR_PROGRESS',
        progress: update.progress,
        status: update.status,
        tabId
      }).catch(() => {});
    })
      .then((result) => {
        console.debug('[TextSnip Offscreen] OCR completed', {
          tabId,
          textLength: result.text.length,
          confidence: result.confidence,
          textPreview: result.text.slice(0, 120)
        });

        chrome.runtime.sendMessage({
          type: 'OCR_COMPLETE',
          success: true,
          text: result.text,
          confidence: result.confidence,
          tabId
        } as any).catch(() => {});
      })
      .catch((err) => {
        console.error('[TextSnip Offscreen] Recognition error:', err);
        chrome.runtime.sendMessage({
          type: 'OCR_COMPLETE',
          success: false,
          error: err?.message || 'Recognition failed',
          tabId
        } as any).catch(() => {});
      });

    // Acknowledge immediately — result arrives via OCR_COMPLETE push
    sendResponse({ received: true });
    return false;
  }

  return false;
});
