import { SelectionPayload, CropResult } from '../types/crop';

export class ScreenshotCropper {
  /**
   * Crops a full tab screenshot data URL to the user's selected viewport rectangle.
   * Handles device pixel ratio, browser zoom, and Retina/high-DPI resolutions.
   */
  public static async crop(
    screenshotDataUrl: string,
    payload: SelectionPayload
  ): Promise<CropResult> {
    return new Promise((resolve, reject) => {
      const img = new Image();

      img.onload = () => {
        try {
          const naturalWidth = img.naturalWidth;
          const naturalHeight = img.naturalHeight;

          // Compute exact scale ratios between captured physical bitmap and CSS viewport
          const winW = payload.windowWidth > 0 ? payload.windowWidth : (window.innerWidth || 1);
          const winH = payload.windowHeight > 0 ? payload.windowHeight : (window.innerHeight || 1);
          const scaleX = naturalWidth / winW;
          const scaleY = naturalHeight / winH;

          // Calculate source rectangle in physical image coordinates
          let sx = Math.round(payload.rect.left * scaleX);
          let sy = Math.round(payload.rect.top * scaleY);
          let sWidth = Math.round(payload.rect.width * scaleX);
          let sHeight = Math.round(payload.rect.height * scaleY);

          // Boundary clamping to ensure within image limits
          sx = Math.max(0, Math.min(sx, naturalWidth - 1));
          sy = Math.max(0, Math.min(sy, naturalHeight - 1));
          sWidth = Math.max(1, Math.min(sWidth, naturalWidth - sx));
          sHeight = Math.max(1, Math.min(sHeight, naturalHeight - sy));

          const canvas = document.createElement('canvas');
          canvas.width = Math.max(1, sWidth);
          canvas.height = Math.max(1, sHeight);

          const ctx = canvas.getContext('2d', { willReadFrequently: true });
          if (!ctx) {
            reject(new Error('Failed to get 2D canvas rendering context'));
            return;
          }

          // Draw the cropped portion onto the canvas
          ctx.drawImage(img, sx, sy, sWidth, sHeight, 0, 0, sWidth, sHeight);

          const dataUrl = canvas.toDataURL('image/png');

          canvas.toBlob((blob) => {
            if (!blob) {
              reject(new Error('Failed to create PNG blob from canvas'));
              return;
            }

            resolve({
              dataUrl,
              blob,
              width: sWidth,
              height: sHeight
            });
          }, 'image/png');
        } catch (err) {
          reject(err);
        }
      };

      img.onerror = () => {
        reject(new Error('Failed to load screenshot into memory'));
      };

      img.src = screenshotDataUrl;
    });
  }
}

