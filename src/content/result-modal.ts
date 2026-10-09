import { CropResult } from '../types/crop';
import { ClipboardService } from '../clipboard/clipboard-service';
import { ThemeMode } from '../types/settings';

export interface ResultModalOptions {
  cropResult: CropResult;
  showPreview: boolean;
  theme: ThemeMode;
  onClose: () => void;
  onCaptureAgain: () => void;
}

export class ResultModal {
  private hostElement: HTMLElement | null = null;
  private shadowRoot: ShadowRoot | null = null;
  private options: ResultModalOptions;

  // Cached DOM elements inside shadow
  private loadingSection: HTMLElement | null = null;
  private resultSection: HTMLElement | null = null;
  private progressBar: HTMLElement | null = null;
  private progressStatus: HTMLElement | null = null;
  private progressPercent: HTMLElement | null = null;
  private textarea: HTMLTextAreaElement | null = null;
  private previewContainer: HTMLElement | null = null;
  private toastNotification: HTMLElement | null = null;
  private toastTimeout: number | undefined;

  constructor(options: ResultModalOptions) {
    this.options = options;
  }

  public mount(): void {
    if (this.hostElement) {
      this.unmount();
    }

    this.hostElement = document.createElement('textsnip-result-dialog');
    this.hostElement.id = 'textsnip-result-root';
    this.hostElement.style.position = 'fixed';
    this.hostElement.style.top = '0';
    this.hostElement.style.left = '0';
    this.hostElement.style.width = '100vw';
    this.hostElement.style.height = '100vh';
    this.hostElement.style.zIndex = '2147483647';
    this.hostElement.style.pointerEvents = 'auto';

    this.shadowRoot = this.hostElement.attachShadow({ mode: 'open' });
    this.shadowRoot.innerHTML = this.getTemplate();

    // Cache elements
    this.loadingSection = this.shadowRoot.getElementById('loading-section');
    this.resultSection = this.shadowRoot.getElementById('result-section');
    this.progressBar = this.shadowRoot.getElementById('progress-bar-fill');
    this.progressStatus = this.shadowRoot.getElementById('progress-status');
    this.progressPercent = this.shadowRoot.getElementById('progress-percent');
    this.textarea = this.shadowRoot.getElementById('extracted-textarea') as HTMLTextAreaElement;
    this.previewContainer = this.shadowRoot.getElementById('preview-container');
    this.toastNotification = this.shadowRoot.getElementById('modal-toast');

    document.documentElement.appendChild(this.hostElement);

    this.bindEvents();
    this.setupDraggable();
  }

  public unmount(): void {
    if (this.toastTimeout) {
      clearTimeout(this.toastTimeout);
    }
    if (this.hostElement && this.hostElement.parentNode) {
      this.hostElement.parentNode.removeChild(this.hostElement);
    }
    this.hostElement = null;
    this.shadowRoot = null;
  }

  public updateProgress(progress: number, status: string): void {
    if (this.progressBar) {
      this.progressBar.style.width = `${Math.min(100, Math.max(0, progress))}%`;
    }
    if (this.progressPercent) {
      this.progressPercent.textContent = `${Math.min(100, Math.max(0, progress))}%`;
    }
    if (this.progressStatus) {
      this.progressStatus.textContent = status;
    }
  }

  public showResult(text: string): void {
    if (this.loadingSection) this.loadingSection.style.display = 'none';
    if (this.resultSection) this.resultSection.style.display = 'flex';

    if (this.textarea) {
      this.textarea.value = text;
      if (!text.trim()) {
        this.textarea.placeholder = 'No text was detected in the selected area.';
      }
      this.textarea.focus();
    }

    // Set preview image if enabled
    if (this.options.showPreview && this.previewContainer) {
      this.previewContainer.innerHTML = `
        <img class="preview-img" src="${this.options.cropResult.dataUrl}" alt="Cropped Screenshot" />
      `;
      this.previewContainer.style.display = 'block';
    }
  }

  private showToast(message: string, isError = false): void {
    if (!this.toastNotification) return;

    this.toastNotification.textContent = message;
    this.toastNotification.className = `modal-toast ${isError ? 'toast-error' : 'toast-success'}`;
    this.toastNotification.style.display = 'block';

    if (this.toastTimeout) clearTimeout(this.toastTimeout);
    this.toastTimeout = window.setTimeout(() => {
      if (this.toastNotification) {
        this.toastNotification.style.display = 'none';
      }
    }, 2500);
  }

  private bindEvents(): void {
    if (!this.shadowRoot) return;

    // Close button
    const btnClose = this.shadowRoot.getElementById('btn-close-modal');
    btnClose?.addEventListener('click', () => {
      this.unmount();
      this.options.onClose();
    });

    // Copy Text button
    const btnCopyText = this.shadowRoot.getElementById('btn-copy-text');
    btnCopyText?.addEventListener('click', async () => {
      const textToCopy = this.textarea?.value || '';
      const success = await ClipboardService.copyText(textToCopy);
      if (success) {
        this.showToast('✓ Text copied to clipboard');
      } else {
        this.showToast('Failed to copy text', true);
      }
    });

    // Copy Image button
    const btnCopyImage = this.shadowRoot.getElementById('btn-copy-image');
    btnCopyImage?.addEventListener('click', async () => {
      const success = await ClipboardService.copyImage(this.options.cropResult.blob);
      if (success) {
        this.showToast('✓ Image copied to clipboard');
      } else {
        this.showToast('Unable to copy image to clipboard', true);
      }
    });

    // Save Image button
    const btnSaveImage = this.shadowRoot.getElementById('btn-save-image');
    btnSaveImage?.addEventListener('click', () => {
      try {
        ClipboardService.downloadImage(this.options.cropResult.blob);
        this.showToast('✓ Image downloaded');
      } catch (err) {
        console.error('Failed to download image:', err);
        this.showToast('Failed to save image', true);
      }
    });

    // Capture Again button
    const btnCaptureAgain = this.shadowRoot.getElementById('btn-capture-again');
    btnCaptureAgain?.addEventListener('click', () => {
      this.unmount();
      this.options.onCaptureAgain();
    });

    // Escape key listener
    window.addEventListener('keydown', this.handleKeyDown);
  }

  private handleKeyDown = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') {
      window.removeEventListener('keydown', this.handleKeyDown);
      this.unmount();
      this.options.onClose();
    }
  };

  private setupDraggable(): void {
    const dialog = this.shadowRoot?.getElementById('dialog-card');
    const header = this.shadowRoot?.getElementById('dialog-header');
    if (!dialog || !header) return;

    let isDragging = false;
    let startX = 0;
    let startY = 0;
    let initialLeft = 0;
    let initialTop = 0;

    header.addEventListener('mousedown', (e) => {
      // Don't drag if clicking close button
      if ((e.target as HTMLElement).closest('#btn-close-modal')) return;

      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;
      const rect = dialog.getBoundingClientRect();
      initialLeft = rect.left;
      initialTop = rect.top;

      dialog.style.margin = '0';
      dialog.style.left = `${initialLeft}px`;
      dialog.style.top = `${initialTop}px`;
    });

    window.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;

      const newLeft = Math.max(10, Math.min(window.innerWidth - dialog.offsetWidth - 10, initialLeft + dx));
      const newTop = Math.max(10, Math.min(window.innerHeight - dialog.offsetHeight - 10, initialTop + dy));

      dialog.style.left = `${newLeft}px`;
      dialog.style.top = `${newTop}px`;
    });

    window.addEventListener('mouseup', () => {
      isDragging = false;
    });
  }

  private getTemplate(): string {
    const isDarkTheme =
      this.options.theme === 'dark' ||
      (this.options.theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);

    return `
      <style>
        :host {
          all: initial;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
          user-select: none;
        }

        #dialog-backdrop {
          position: fixed;
          top: 0;
          left: 0;
          width: 100vw;
          height: 100vh;
          background: rgba(0, 0, 0, 0.45);
          backdrop-filter: blur(2px);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
          box-sizing: border-box;
        }

        #dialog-card {
          width: 520px;
          max-width: 95vw;
          max-height: 85vh;
          background: ${isDarkTheme ? '#1e293b' : '#ffffff'};
          color: ${isDarkTheme ? '#f8fafc' : '#0f172a'};
          border-radius: 12px;
          box-shadow: 0 20px 40px rgba(0, 0, 0, 0.35), 0 0 0 1px ${isDarkTheme ? '#334155' : '#e2e8f0'};
          display: flex;
          flex-direction: column;
          overflow: hidden;
          position: relative;
          animation: modalAppear 0.18s ease-out;
        }

        @keyframes modalAppear {
          from {
            opacity: 0;
            transform: scale(0.96) translateY(8px);
          }
          to {
            opacity: 1;
            transform: scale(1) translateY(0);
          }
        }

        #dialog-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 14px 18px;
          border-bottom: 1px solid ${isDarkTheme ? '#334155' : '#f1f5f9'};
          cursor: move;
          background: ${isDarkTheme ? '#1e293b' : '#ffffff'};
        }

        .header-title-group {
          display: flex;
          align-items: center;
          gap: 8px;
          font-weight: 600;
          font-size: 15px;
          color: ${isDarkTheme ? '#f1f5f9' : '#1e293b'};
        }

        .header-icon {
          width: 18px;
          height: 18px;
          color: #6366f1;
        }

        #btn-close-modal {
          background: none;
          border: none;
          cursor: pointer;
          color: ${isDarkTheme ? '#94a3b8' : '#64748b'};
          font-size: 20px;
          line-height: 1;
          padding: 4px;
          border-radius: 6px;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.15s;
        }

        #btn-close-modal:hover {
          color: ${isDarkTheme ? '#ffffff' : '#0f172a'};
          background: ${isDarkTheme ? '#334155' : '#f1f5f9'};
        }

        /* Loading View */
        #loading-section {
          padding: 36px 24px;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 16px;
          text-align: center;
        }

        .spinner {
          width: 32px;
          height: 32px;
          border: 3px solid ${isDarkTheme ? '#334155' : '#e2e8f0'};
          border-top-color: #6366f1;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        .progress-bar-track {
          width: 100%;
          max-width: 320px;
          height: 8px;
          background: ${isDarkTheme ? '#334155' : '#e2e8f0'};
          border-radius: 9999px;
          overflow: hidden;
        }

        #progress-bar-fill {
          height: 100%;
          width: 0%;
          background: #6366f1;
          border-radius: 9999px;
          transition: width 0.25s ease;
        }

        .progress-meta {
          display: flex;
          justify-content: space-between;
          width: 100%;
          max-width: 320px;
          font-size: 12px;
          color: ${isDarkTheme ? '#94a3b8' : '#64748b'};
        }

        /* Result View */
        #result-section {
          padding: 16px;
          display: none;
          flex-direction: column;
          gap: 12px;
          overflow-y: auto;
        }

        #preview-container {
          display: none;
          max-height: 120px;
          overflow: hidden;
          border-radius: 8px;
          border: 1px solid ${isDarkTheme ? '#334155' : '#e2e8f0'};
          background: ${isDarkTheme ? '#0f172a' : '#f8fafc'};
          text-align: center;
        }

        .preview-img {
          max-width: 100%;
          max-height: 120px;
          object-fit: contain;
          display: inline-block;
        }

        #extracted-textarea {
          width: 100%;
          height: 180px;
          box-sizing: border-box;
          padding: 12px;
          border-radius: 8px;
          border: 1px solid ${isDarkTheme ? '#334155' : '#cbd5e1'};
          background: ${isDarkTheme ? '#0f172a' : '#ffffff'};
          color: ${isDarkTheme ? '#f8fafc' : '#0f172a'};
          font-family: inherit;
          font-size: 13.5px;
          line-height: 1.5;
          resize: vertical;
          outline: none;
          user-select: text;
          white-space: pre-wrap;
        }

        #extracted-textarea:focus {
          border-color: #6366f1;
          box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.2);
        }

        .dialog-actions {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          justify-content: flex-end;
          padding-top: 4px;
        }

        .btn {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 8px 14px;
          font-size: 13px;
          font-weight: 600;
          border-radius: 6px;
          border: none;
          cursor: pointer;
          transition: all 0.15s ease;
        }

        .btn-primary {
          background: #4f46e5;
          color: #ffffff;
        }

        .btn-primary:hover {
          background: #4338ca;
        }

        .btn-secondary {
          background: ${isDarkTheme ? '#334155' : '#f1f5f9'};
          color: ${isDarkTheme ? '#f8fafc' : '#334155'};
        }

        .btn-secondary:hover {
          background: ${isDarkTheme ? '#475569' : '#e2e8f0'};
        }

        .btn-subtle {
          background: transparent;
          color: #6366f1;
          border: 1px solid rgba(99, 102, 241, 0.3);
        }

        .btn-subtle:hover {
          background: rgba(99, 102, 241, 0.1);
        }

        /* Toast feedback */
        .modal-toast {
          position: absolute;
          top: 14px;
          left: 50%;
          transform: translateX(-50%);
          padding: 6px 14px;
          border-radius: 9999px;
          font-size: 12px;
          font-weight: 500;
          display: none;
          animation: toastIn 0.2s ease-out;
          z-index: 100;
        }

        @keyframes toastIn {
          from { opacity: 0; transform: translate(-50%, -6px); }
          to { opacity: 1; transform: translate(-50%, 0); }
        }

        .toast-success {
          background: #10b981;
          color: #ffffff;
          box-shadow: 0 4px 12px rgba(16, 185, 129, 0.3);
        }

        .toast-error {
          background: #ef4444;
          color: #ffffff;
          box-shadow: 0 4px 12px rgba(239, 68, 68, 0.3);
        }
      </style>

      <div id="dialog-backdrop">
        <div id="dialog-card">
          <div id="modal-toast" class="modal-toast"></div>

          <div id="dialog-header">
            <div class="header-title-group">
              <svg class="header-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
                <line x1="16" y1="13" x2="8" y2="13"/>
                <line x1="16" y1="17" x2="8" y2="17"/>
                <polyline points="10 9 9 9 8 9"/>
              </svg>
              <span>Extracted Text</span>
            </div>
            <button id="btn-close-modal" title="Close (Esc)">×</button>
          </div>

          <!-- Loading Progress State -->
          <div id="loading-section">
            <div class="spinner"></div>
            <p style="font-size: 14px; font-weight: 500;">Processing image...</p>
            <div class="progress-bar-track">
              <div id="progress-bar-fill"></div>
            </div>
            <div class="progress-meta">
              <span id="progress-status">Initializing OCR...</span>
              <span id="progress-percent">0%</span>
            </div>
          </div>

          <!-- Final Extracted Result State -->
          <div id="result-section">
            <div id="preview-container"></div>
            <textarea id="extracted-textarea" spellcheck="false" placeholder="Extracted text will appear here..."></textarea>
            
            <div class="dialog-actions">
              <button id="btn-copy-text" class="btn btn-primary" title="Copy text to clipboard">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                </svg>
                Copy Text
              </button>
              <button id="btn-copy-image" class="btn btn-secondary" title="Copy screenshot to clipboard">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                  <circle cx="8.5" cy="8.5" r="1.5"/>
                  <polyline points="21 15 16 10 5 21"/>
                </svg>
                Copy Image
              </button>
              <button id="btn-save-image" class="btn btn-secondary" title="Download screenshot as PNG">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                  <polyline points="7 10 12 15 17 10"/>
                  <line x1="12" y1="15" x2="12" y2="3"/>
                </svg>
                Save Image
              </button>
              <button id="btn-capture-again" class="btn btn-subtle" title="Capture another area">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M23 4v6h-6"/>
                  <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
                </svg>
                Capture Again
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
  }
}

