import { ExtensionMessage } from '../types/messages';
import { SelectionOverlay } from './selection-overlay';
import { ViewportRect, CropResult, SelectionPayload } from '../types/crop';
import { ScreenshotCropper } from '../screenshot/cropper';
import { InPageToast } from './toast';
import { SettingsService } from '../storage/settings-service';
import { ResultModal } from './result-modal';
import { ClipboardService } from '../clipboard/clipboard-service';

chrome.runtime.sendMessage({ type: 'WARMUP_OCR' }).catch(() => {});

let activeOverlay: SelectionOverlay | null = null;
let activeModal: ResultModal | null = null;
let lastCroppedResult: CropResult | null = null;
let ocrTimeoutHandle: ReturnType<typeof setTimeout> | undefined;

const OCR_UI_TIMEOUT_MS = 60000;

function clearOcrTimeout(): void {
  if (ocrTimeoutHandle) {
    clearTimeout(ocrTimeoutHandle);
    ocrTimeoutHandle = undefined;
  }
}

function isVisibleElement(element: Element): boolean {
  const computedStyle = window.getComputedStyle(element);
  return computedStyle.display !== 'none' && computedStyle.visibility !== 'hidden' && computedStyle.opacity !== '0';
}

function isImageLikeElement(element: HTMLElement): boolean {
  const tagName = element.tagName.toLowerCase();
  if (tagName === 'img' || tagName === 'canvas' || tagName === 'svg' || tagName === 'video' || tagName === 'picture') {
    return true;
  }

  const computedStyle = window.getComputedStyle(element);
  return computedStyle.backgroundImage !== 'none' && computedStyle.backgroundImage !== '';
}

function selectionContainsImageLikeContent(rect: ViewportRect): boolean {
  const samplePoints = [
    [0.25, 0.25], [0.5, 0.25], [0.75, 0.25],
    [0.25, 0.5], [0.5, 0.5], [0.75, 0.5],
    [0.25, 0.75], [0.5, 0.75], [0.75, 0.75]
  ];

  for (const [xFactor, yFactor] of samplePoints) {
    const x = rect.left + rect.width * xFactor;
    const y = rect.top + rect.height * yFactor;
    const elements = document.elementsFromPoint(x, y);

    const topElement = elements.find((element): element is HTMLElement => element instanceof HTMLElement && isVisibleElement(element));
    if (topElement && isImageLikeElement(topElement)) {
      return true;
    }
  }

  return false;
}

function collectDomTextFromSelection(rect: ViewportRect): string {
  const samplePoints = [
    [0.2, 0.2], [0.5, 0.2], [0.8, 0.2],
    [0.2, 0.5], [0.5, 0.5], [0.8, 0.5],
    [0.2, 0.8], [0.5, 0.8], [0.8, 0.8]
  ];

  const candidates = new Set<string>();

  for (const [xFactor, yFactor] of samplePoints) {
    const x = rect.left + rect.width * xFactor;
    const y = rect.top + rect.height * yFactor;
    const elements = document.elementsFromPoint(x, y);

    for (const element of elements) {
      if (!(element instanceof HTMLElement)) continue;
      if (!isVisibleElement(element)) continue;

      const text = element.innerText?.replace(/\s+/g, ' ').trim();
      if (!text || text.length < 3) continue;

      if (element.matches('button, input, textarea, select')) continue;
      if (text.length > 500) continue;

      candidates.add(text);
    }
  }

  const sorted = Array.from(candidates).sort((a, b) => b.length - a.length);
  return sorted.slice(0, 6).join('\n');
}

export function getLastCroppedResult(): CropResult | null {
  return lastCroppedResult;
}

export function startSelectionMode() {
  if (activeOverlay) { activeOverlay.unmount(); activeOverlay = null; }
  if (activeModal) { activeModal.unmount(); activeModal = null; }
  clearOcrTimeout();

  activeOverlay = new SelectionOverlay({
    onConfirm: async (rect: ViewportRect) => {
      activeOverlay = null;

      const payload: SelectionPayload = {
        rect,
        windowWidth: window.innerWidth,
        windowHeight: window.innerHeight,
        devicePixelRatio: window.devicePixelRatio || 1
      };

      try {
        // Step 1: Capture tab screenshot
        const response = await chrome.runtime.sendMessage({ type: 'CAPTURE_TAB', payload });
        if (!response || !response.success) {
          InPageToast.show(response?.error || 'Unable to capture tab screenshot.', 3500, true);
          return;
        }

        // Step 2: Crop to selection
        const cropped = await ScreenshotCropper.crop(response.screenshotDataUrl, payload);
        lastCroppedResult = cropped;

        // Step 3: Load settings
        const settings = await SettingsService.getSettings();

        // Step 4: Try DOM text extraction before OCR for normal webpages.
        // If the selection contains image-like content, prefer OCR so we do not
        // accidentally read text from elements underneath the selected image.
        const shouldPreferOcr = selectionContainsImageLikeContent(rect);
        const domText = shouldPreferOcr ? '' : collectDomTextFromSelection(rect);
        if (domText.trim()) {
          activeModal = new ResultModal({
            cropResult: cropped,
            showPreview: settings.showPreview,
            theme: settings.theme,
            onClose: () => { activeModal = null; clearOcrTimeout(); },
            onCaptureAgain: () => { activeModal = null; clearOcrTimeout(); startSelectionMode(); }
          });
          activeModal.mount();
          activeModal.showResult(domText.trim());

          if (settings.autoCopyText) {
            ClipboardService.copyText(domText.trim());
          }

          return;
        }

        // Step 4: Mount the result modal in loading state
        activeModal = new ResultModal({
          cropResult: cropped,
          showPreview: settings.showPreview,
          theme: settings.theme,
          onClose: () => { activeModal = null; clearOcrTimeout(); },
          onCaptureAgain: () => { activeModal = null; clearOcrTimeout(); startSelectionMode(); }
        });
        activeModal.mount();

        ocrTimeoutHandle = setTimeout(() => {
          if (!activeModal) return;
          activeModal.showResult('');
          InPageToast.show('OCR timed out while loading the local engine. Try again on a simpler page.', 5000, true);
          activeModal.updateProgress(0, 'OCR timed out');
          clearOcrTimeout();
        }, OCR_UI_TIMEOUT_MS);

        // Step 5: Fire-and-forget OCR — result arrives via OCR_COMPLETE push message
        // Use tabId returned from CAPTURE_TAB response (chrome.tabs is not available in content scripts)
        const tabId: number = response.tabId ?? 0;

        console.debug('[TextSnip] Sending OCR request', {
          tabId,
          cropWidth: cropped.width,
          cropHeight: cropped.height,
          blobSize: cropped.blob.size,
          dataUrlLength: cropped.dataUrl.length,
          language: settings.ocrLanguage || 'eng'
        });

        chrome.runtime.sendMessage({
          type: 'RUN_OCR',
          payload: { image: cropped.dataUrl, language: settings.ocrLanguage || 'eng' },
          tabId
        }).catch(() => {}); // fire-and-forget

      } catch (err: any) {
        console.error('[TextSnip] Extraction pipeline failed:', err);
        if (activeModal) { activeModal.unmount(); activeModal = null; }
        InPageToast.show(err?.message || 'Something went wrong while extracting the text.', 3500, true);
      }
    },
    onCancel: () => { activeOverlay = null; }
  });

  activeOverlay.mount();
}

// Listen for messages from background service worker
chrome.runtime.onMessage.addListener((message: ExtensionMessage, _sender, sendResponse) => {
  if (message.type === 'START_SELECTION') {
    startSelectionMode();
    sendResponse({ received: true });
    return false;
  }

  if (message.type === 'CANCEL_SELECTION') {
    if (activeOverlay) { activeOverlay.unmount(); activeOverlay = null; }
    if (activeModal) { activeModal.unmount(); activeModal = null; }
    sendResponse({ cancelled: true });
    return false;
  }

  // Live OCR progress bar update
  if (message.type === 'OCR_PROGRESS') {
    if (activeModal) {
      activeModal.updateProgress(message.progress, message.status);
    }
    return false;
  }

  // OCR finished — show result or error
  if (message.type === 'OCR_COMPLETE') {
    if (!activeModal) return false;
    clearOcrTimeout();

    if (message.success) {
      activeModal.showResult(message.text || '');
      // Auto-copy if enabled
      SettingsService.getSettings().then((settings) => {
        if (settings.autoCopyText && message.success && message.text?.trim()) {
          ClipboardService.copyText(message.text);
        }
      });
    } else {
      activeModal.showResult('');
      InPageToast.show(message.error || 'OCR failed. Please try again.', 3500, true);
    }
    return false;
  }

  return false;
});
