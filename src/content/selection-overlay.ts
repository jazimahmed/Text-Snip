import { ViewportRect } from '../types/crop';

export interface SelectionOverlayOptions {
  onConfirm: (rect: ViewportRect) => void;
  onCancel: () => void;
}

type InteractionState = 'idle' | 'drawing' | 'selected' | 'resizing' | 'moving';
type ResizeHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

export class SelectionOverlay {
  private hostElement: HTMLElement | null = null;
  private shadowRoot: ShadowRoot | null = null;
  private options: SelectionOverlayOptions;

  // State
  private state: InteractionState = 'idle';
  private activeHandle: ResizeHandle | null = null;
  private startX = 0;
  private startY = 0;
  private currentRect: ViewportRect = { left: 0, top: 0, width: 0, height: 0 };
  private initialRectForTransform: ViewportRect = { left: 0, top: 0, width: 0, height: 0 };

  // DOM elements inside shadow
  private overlayContainer: HTMLElement | null = null;
  private selectionBox: HTMLElement | null = null;
  private dimensionBadge: HTMLElement | null = null;
  private actionToolbar: HTMLElement | null = null;
  private instructionBar: HTMLElement | null = null;

  constructor(options: SelectionOverlayOptions) {
    this.options = options;
  }

  public mount(): void {
    if (this.hostElement) {
      this.unmount();
    }

    // Create host element
    this.hostElement = document.createElement('textsnip-overlay');
    this.hostElement.id = 'textsnip-overlay-root';
    this.hostElement.style.position = 'fixed';
    this.hostElement.style.top = '0';
    this.hostElement.style.left = '0';
    this.hostElement.style.width = '100vw';
    this.hostElement.style.height = '100vh';
    this.hostElement.style.zIndex = '2147483647'; // Max z-index
    this.hostElement.style.pointerEvents = 'auto';

    this.shadowRoot = this.hostElement.attachShadow({ mode: 'open' });
    this.shadowRoot.innerHTML = this.getTemplate();

    // Cache elements
    this.overlayContainer = this.shadowRoot.getElementById('overlay-container');
    this.selectionBox = this.shadowRoot.getElementById('selection-box');
    this.dimensionBadge = this.shadowRoot.getElementById('dimension-badge');
    this.actionToolbar = this.shadowRoot.getElementById('action-toolbar');
    this.instructionBar = this.shadowRoot.getElementById('instruction-bar');

    document.documentElement.appendChild(this.hostElement);

    this.bindEvents();
  }

  public unmount(): void {
    this.unbindEvents();
    if (this.hostElement && this.hostElement.parentNode) {
      this.hostElement.parentNode.removeChild(this.hostElement);
    }
    this.hostElement = null;
    this.shadowRoot = null;
    this.state = 'idle';
  }

  private getTemplate(): string {
    return `
      <style>
        :host {
          all: initial;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
          user-select: none;
        }

        #overlay-container {
          position: fixed;
          top: 0;
          left: 0;
          width: 100vw;
          height: 100vh;
          cursor: crosshair;
          overflow: hidden;
          background: rgba(0, 0, 0, 0.4);
          transition: background 0.15s ease;
        }

        #overlay-container.has-selection {
          background: transparent;
        }

        #instruction-bar {
          position: fixed;
          top: 24px;
          left: 50%;
          transform: translateX(-50%);
          background: rgba(17, 24, 39, 0.88);
          backdrop-filter: blur(8px);
          color: #ffffff;
          padding: 8px 18px;
          border-radius: 9999px;
          font-size: 13px;
          font-weight: 500;
          letter-spacing: 0.2px;
          display: flex;
          align-items: center;
          gap: 10px;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);
          pointer-events: none;
          z-index: 100;
          transition: opacity 0.2s ease;
        }

        .kbd-pill {
          background: rgba(255, 255, 255, 0.2);
          padding: 2px 6px;
          border-radius: 4px;
          font-size: 11px;
        }

        #selection-box {
          position: fixed;
          display: none;
          box-sizing: border-box;
          border: 2px solid #6366f1;
          background: transparent;
          box-shadow: 0 0 0 99999px rgba(0, 0, 0, 0.55);
          cursor: move;
          z-index: 50;
        }

        #dimension-badge {
          position: absolute;
          bottom: -28px;
          left: 0;
          background: #4f46e5;
          color: #ffffff;
          font-size: 11px;
          font-weight: 600;
          padding: 3px 8px;
          border-radius: 4px;
          white-space: nowrap;
          pointer-events: none;
          box-shadow: 0 2px 6px rgba(0, 0, 0, 0.2);
        }

        #action-toolbar {
          position: absolute;
          bottom: -46px;
          right: 0;
          display: none;
          gap: 6px;
          background: rgba(17, 24, 39, 0.95);
          padding: 4px 6px;
          border-radius: 8px;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
          pointer-events: auto;
        }

        .btn-action {
          border: none;
          cursor: pointer;
          font-size: 12px;
          font-weight: 600;
          padding: 6px 12px;
          border-radius: 6px;
          display: flex;
          align-items: center;
          gap: 6px;
          transition: all 0.15s ease;
        }

        .btn-confirm {
          background: #4f46e5;
          color: #ffffff;
        }

        .btn-confirm:hover {
          background: #4338ca;
        }

        .btn-cancel {
          background: rgba(255, 255, 255, 0.15);
          color: #f3f4f6;
        }

        .btn-cancel:hover {
          background: rgba(255, 255, 255, 0.25);
        }

        /* 8-point resize handles */
        .handle {
          position: absolute;
          width: 8px;
          height: 8px;
          background: #ffffff;
          border: 1px solid #4f46e5;
          border-radius: 2px;
          box-sizing: border-box;
        }

        .handle-nw { top: -4px; left: -4px; cursor: nwse-resize; }
        .handle-n  { top: -4px; left: calc(50% - 4px); cursor: ns-resize; }
        .handle-ne { top: -4px; right: -4px; cursor: nesw-resize; }
        .handle-e  { top: calc(50% - 4px); right: -4px; cursor: ew-resize; }
        .handle-se { bottom: -4px; right: -4px; cursor: nwse-resize; }
        .handle-s  { bottom: -4px; left: calc(50% - 4px); cursor: ns-resize; }
        .handle-sw { bottom: -4px; left: -4px; cursor: nesw-resize; }
        .handle-w  { top: calc(50% - 4px); left: -4px; cursor: ew-resize; }
      </style>

      <div id="overlay-container">
        <div id="instruction-bar">
          <span>✂ Drag to select area</span>
          <span class="kbd-pill">Enter</span> to extract
          <span class="kbd-pill">Esc</span> to cancel
        </div>

        <div id="selection-box">
          <div id="dimension-badge">0 × 0</div>
          
          <div class="handle handle-nw" data-handle="nw"></div>
          <div class="handle handle-n"  data-handle="n"></div>
          <div class="handle handle-ne" data-handle="ne"></div>
          <div class="handle handle-e"  data-handle="e"></div>
          <div class="handle handle-se" data-handle="se"></div>
          <div class="handle handle-s"  data-handle="s"></div>
          <div class="handle handle-sw" data-handle="sw"></div>
          <div class="handle handle-w"  data-handle="w"></div>

          <div id="action-toolbar">
            <button id="btn-confirm-snip" class="btn-action btn-confirm">
              Extract Text ↵
            </button>
            <button id="btn-cancel-snip" class="btn-action btn-cancel">
              Cancel Esc
            </button>
          </div>
        </div>
      </div>
    `;
  }

  private bindEvents(): void {
    if (!this.overlayContainer) return;

    this.overlayContainer.addEventListener('mousedown', this.handleMouseDown);
    window.addEventListener('mousemove', this.handleMouseMove);
    window.addEventListener('mouseup', this.handleMouseUp);
    window.addEventListener('keydown', this.handleKeyDown);

    // Toolbar buttons
    const btnConfirm = this.shadowRoot?.getElementById('btn-confirm-snip');
    btnConfirm?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.confirmCurrentSelection();
    });

    const btnCancel = this.shadowRoot?.getElementById('btn-cancel-snip');
    btnCancel?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.cancel();
    });
  }

  private unbindEvents(): void {
    if (this.overlayContainer) {
      this.overlayContainer.removeEventListener('mousedown', this.handleMouseDown);
    }
    window.removeEventListener('mousemove', this.handleMouseMove);
    window.removeEventListener('mouseup', this.handleMouseUp);
    window.removeEventListener('keydown', this.handleKeyDown);
  }

  private handleMouseDown = (e: MouseEvent): void => {
    // Only respond to left click
    if (e.button !== 0) return;

    const target = e.target as HTMLElement;

    // Check if clicked a resize handle
    if (target.dataset.handle && this.state === 'selected') {
      e.stopPropagation();
      this.state = 'resizing';
      this.activeHandle = target.dataset.handle as ResizeHandle;
      this.startX = e.clientX;
      this.startY = e.clientY;
      this.initialRectForTransform = { ...this.currentRect };
      return;
    }

    // Check if clicked inside selection box to move
    if (this.selectionBox && (target === this.selectionBox || this.selectionBox.contains(target))) {
      // Don't trigger if clicked toolbar
      if (this.actionToolbar && this.actionToolbar.contains(target)) return;

      e.stopPropagation();
      this.state = 'moving';
      this.startX = e.clientX;
      this.startY = e.clientY;
      this.initialRectForTransform = { ...this.currentRect };
      return;
    }

    // Otherwise, start a fresh drag selection
    this.state = 'drawing';
    this.startX = e.clientX;
    this.startY = e.clientY;
    this.currentRect = { left: e.clientX, top: e.clientY, width: 0, height: 0 };
    this.updateBoxDOM();

    if (this.selectionBox) {
      this.selectionBox.style.display = 'block';
    }
    if (this.actionToolbar) {
      this.actionToolbar.style.display = 'none';
    }
    if (this.instructionBar) {
      this.instructionBar.style.opacity = '0.3';
    }
    this.overlayContainer?.classList.add('has-selection');
  };

  private handleMouseMove = (e: MouseEvent): void => {
    if (this.state === 'idle') return;

    if (this.state === 'drawing') {
      const x = Math.min(e.clientX, this.startX);
      const y = Math.min(e.clientY, this.startY);
      const width = Math.abs(e.clientX - this.startX);
      const height = Math.abs(e.clientY - this.startY);

      // Clamp to viewport bounds
      const clampedX = Math.max(0, x);
      const clampedY = Math.max(0, y);
      const clampedWidth = Math.min(window.innerWidth - clampedX, width);
      const clampedHeight = Math.min(window.innerHeight - clampedY, height);

      this.currentRect = {
        left: clampedX,
        top: clampedY,
        width: clampedWidth,
        height: clampedHeight
      };
      this.updateBoxDOM();
    } else if (this.state === 'resizing' && this.activeHandle) {
      const dx = e.clientX - this.startX;
      const dy = e.clientY - this.startY;
      const init = this.initialRectForTransform;
      let { left, top, width, height } = init;

      switch (this.activeHandle) {
        case 'se':
          width = Math.max(10, init.width + dx);
          height = Math.max(10, init.height + dy);
          break;
        case 'e':
          width = Math.max(10, init.width + dx);
          break;
        case 's':
          height = Math.max(10, init.height + dy);
          break;
        case 'nw':
          width = Math.max(10, init.width - dx);
          height = Math.max(10, init.height - dy);
          left = init.left + (init.width - width);
          top = init.top + (init.height - height);
          break;
        case 'w':
          width = Math.max(10, init.width - dx);
          left = init.left + (init.width - width);
          break;
        case 'n':
          height = Math.max(10, init.height - dy);
          top = init.top + (init.height - height);
          break;
        case 'ne':
          width = Math.max(10, init.width + dx);
          height = Math.max(10, init.height - dy);
          top = init.top + (init.height - height);
          break;
        case 'sw':
          width = Math.max(10, init.width - dx);
          height = Math.max(10, init.height + dy);
          left = init.left + (init.width - width);
          break;
      }

      this.currentRect = {
        left: Math.max(0, left),
        top: Math.max(0, top),
        width: Math.min(window.innerWidth - left, width),
        height: Math.min(window.innerHeight - top, height)
      };
      this.updateBoxDOM();
    } else if (this.state === 'moving') {
      const dx = e.clientX - this.startX;
      const dy = e.clientY - this.startY;
      const init = this.initialRectForTransform;

      const newLeft = Math.max(0, Math.min(window.innerWidth - init.width, init.left + dx));
      const newTop = Math.max(0, Math.min(window.innerHeight - init.height, init.top + dy));

      this.currentRect = {
        ...init,
        left: newLeft,
        top: newTop
      };
      this.updateBoxDOM();
    }
  };

  private handleMouseUp = (): void => {
    if (this.instructionBar) {
      this.instructionBar.style.opacity = '1';
    }

    if (this.state === 'drawing') {
      // Small selection threshold (< 15x15 px resets)
      if (this.currentRect.width < 15 || this.currentRect.height < 15) {
        this.resetSelection();
        return;
      }

      this.state = 'selected';
      if (this.actionToolbar) {
        this.actionToolbar.style.display = 'flex';
      }
    } else if (this.state === 'resizing' || this.state === 'moving') {
      this.state = 'selected';
      this.activeHandle = null;
      if (this.actionToolbar) {
        this.actionToolbar.style.display = 'flex';
      }
    }
  };

  private handleKeyDown = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') {
      e.preventDefault();
      this.cancel();
    } else if (e.key === 'Enter') {
      if (this.state === 'selected' && this.currentRect.width >= 15 && this.currentRect.height >= 15) {
        e.preventDefault();
        this.confirmCurrentSelection();
      }
    }
  };

  private updateBoxDOM(): void {
    if (!this.selectionBox || !this.dimensionBadge) return;

    this.selectionBox.style.left = `${this.currentRect.left}px`;
    this.selectionBox.style.top = `${this.currentRect.top}px`;
    this.selectionBox.style.width = `${this.currentRect.width}px`;
    this.selectionBox.style.height = `${this.currentRect.height}px`;

    const w = Math.round(this.currentRect.width);
    const h = Math.round(this.currentRect.height);
    this.dimensionBadge.textContent = `${w} × ${h} px`;

    // Reposition badge if too close to bottom of screen
    if (this.currentRect.top + this.currentRect.height > window.innerHeight - 35) {
      this.dimensionBadge.style.bottom = 'auto';
      this.dimensionBadge.style.top = '-26px';
    } else {
      this.dimensionBadge.style.bottom = '-28px';
      this.dimensionBadge.style.top = 'auto';
    }

    // Reposition action toolbar if too close to bottom of screen
    if (this.actionToolbar) {
      if (this.currentRect.top + this.currentRect.height > window.innerHeight - 55) {
        this.actionToolbar.style.bottom = 'auto';
        this.actionToolbar.style.top = '-46px';
      } else {
        this.actionToolbar.style.bottom = '-46px';
        this.actionToolbar.style.top = 'auto';
      }
    }
  }

  private resetSelection(): void {
    this.state = 'idle';
    if (this.instructionBar) {
      this.instructionBar.style.opacity = '1';
    }
    if (this.selectionBox) {
      this.selectionBox.style.display = 'none';
    }
    if (this.actionToolbar) {
      this.actionToolbar.style.display = 'none';
    }
    this.overlayContainer?.classList.remove('has-selection');
  }

  private confirmCurrentSelection(): void {
    if (this.currentRect.width < 10 || this.currentRect.height < 10) return;
    const finalRect = { ...this.currentRect };
    this.unmount();
    this.options.onConfirm(finalRect);
  }

  private cancel(): void {
    this.unmount();
    this.options.onCancel();
  }
}
