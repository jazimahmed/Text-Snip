import { ExtensionMessage } from '../types/messages';

const OFFSCREEN_DOCUMENT_PATH = 'offscreen/offscreen.html';

async function hasOffscreenDocument(): Promise<boolean> {
  if ('getContexts' in chrome.runtime) {
    const contexts = await (chrome.runtime as any).getContexts({
      contextTypes: ['OFFSCREEN_DOCUMENT'],
      documentUrls: [chrome.runtime.getURL(OFFSCREEN_DOCUMENT_PATH)]
    });
    return Boolean(contexts.length);
  }
  return false;
}

async function ensureOffscreenDocument(): Promise<void> {
  try {
    if (await hasOffscreenDocument()) return;
    await chrome.offscreen.createDocument({
      url: OFFSCREEN_DOCUMENT_PATH,
      reasons: [chrome.offscreen.Reason.WORKERS],
      justification: 'Execute Tesseract.js OCR in extension origin'
    });
  } catch (err: any) {
    if (!err?.message?.includes('Only a single offscreen document may be created')) {
      console.warn('Error creating offscreen document:', err);
    }
  }
}

function isInjectableUrl(url?: string): boolean {
  if (!url) return false;
  return !(
    url.startsWith('chrome://') ||
    url.startsWith('chrome-extension://') ||
    url.startsWith('https://chrome.google.com/webstore') ||
    url.startsWith('https://chromewebstore.google.com') ||
    url.startsWith('edge://') ||
    url.startsWith('about:') ||
    url.startsWith('view-source:')
  );
}

async function ensureContentScriptInjected(tabId: number): Promise<boolean> {
  try {
    await chrome.tabs.sendMessage(tabId, { type: 'GET_SETTINGS' });
    return true;
  } catch {
    try {
      await chrome.scripting.executeScript({ target: { tabId }, files: ['content/index.js'] });
      return true;
    } catch (err) {
      console.error('Failed to inject content script:', err);
      return false;
    }
  }
}

async function startSnipInActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id) return;

  if (!isInjectableUrl(tab.url)) {
    console.warn('Cannot capture restricted page:', tab.url);
    try {
      await chrome.action.setBadgeBackgroundColor({ color: '#ef4444', tabId: tab.id });
      await chrome.action.setBadgeText({ text: '!', tabId: tab.id });
      setTimeout(() => {
        chrome.action.setBadgeText({ text: '', tabId: tab.id }).catch(() => {});
      }, 3000);
    } catch { /* ignore */ }
    return;
  }

  await ensureOffscreenDocument();

  const ready = await ensureContentScriptInjected(tab.id);
  if (ready) {
    chrome.tabs.sendMessage(tab.id, { type: 'START_SELECTION' }).catch((err) => {
      console.error('Error sending START_SELECTION:', err);
    });
  }
}

async function warmupOcrRuntime(): Promise<void> {
  await ensureOffscreenDocument();
}

// Handle keyboard shortcut (Alt+2)
chrome.commands.onCommand.addListener((command) => {
  if (command === 'start_capture') {
    startSnipInActiveTab();
  }
});

// ── Message Router ──────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((message: ExtensionMessage, sender, sendResponse) => {

  if (message.type === 'WARMUP_OCR') {
    warmupOcrRuntime().catch((err) => {
      console.warn('[TextSnip BG] OCR warmup failed:', err);
    });
    sendResponse({ received: true });
    return false;
  }

  // Popup: start capture
  if (message.type === 'START_SELECTION') {
    ensureOffscreenDocument()
      .then(() => startSnipInActiveTab())
      .catch(() => {});
    sendResponse({ success: true });
    return false;
  }

  // Content script: take screenshot
  if (message.type === 'CAPTURE_TAB') {
    const windowId = sender.tab?.windowId;
    const senderTabId = sender.tab?.id;
    chrome.tabs.captureVisibleTab(windowId ?? chrome.windows.WINDOW_ID_CURRENT, { format: 'png' })
      .then((dataUrl) => sendResponse({ success: true, screenshotDataUrl: dataUrl, tabId: senderTabId }))
      .catch((err) => sendResponse({ success: false, error: err.message || 'Capture failed' }));
    return true; // async — keep channel open
  }

  // Content script → offscreen: fire-and-forget OCR kick-off
  // We do NOT await the OCR here. The offscreen sends OCR_COMPLETE when done.
  if (message.type === 'RUN_OCR') {
    const senderTabId = sender.tab?.id ?? message.tabId;
    ensureOffscreenDocument()
      .then(() => {
        chrome.runtime.sendMessage({
          type: 'EXECUTE_OCR',
          payload: message.payload,
          tabId: senderTabId
        }).catch((err) => {
          // OCR failed to start — tell the tab
          if (senderTabId) {
            chrome.tabs.sendMessage(senderTabId, {
              type: 'OCR_COMPLETE',
              success: false,
              error: err?.message || 'OCR start failed'
            }).catch(() => {});
          }
        });
      })
      .catch((err) => {
        console.error('[TextSnip BG] Could not create offscreen document:', err);
        if (senderTabId) {
          chrome.tabs.sendMessage(senderTabId, {
            type: 'OCR_COMPLETE',
            success: false,
            error: 'Could not initialize OCR engine'
          }).catch(() => {});
        }
      });
    sendResponse({ received: true }); // immediate ack — no long wait
    return false;
  }

  // Offscreen → content script: forward progress update
  if (message.type === 'OCR_PROGRESS') {
    const tabId = (message as any).tabId;
    if (tabId) {
      chrome.tabs.sendMessage(tabId, {
        type: 'OCR_PROGRESS',
        progress: message.progress,
        status: message.status
      }).catch(() => {});
    }
    return false;
  }

  // Offscreen → content script: forward final OCR result
  if (message.type === 'OCR_COMPLETE') {
    const tabId = (message as any).tabId;
    if (tabId) {
      chrome.tabs.sendMessage(tabId, message).catch(() => {});
    }
    return false;
  }

  return false;
});

chrome.runtime.onStartup.addListener(() => {
  warmupOcrRuntime().catch(() => {});
});

chrome.runtime.onInstalled.addListener(() => {
  warmupOcrRuntime().catch(() => {});
});
