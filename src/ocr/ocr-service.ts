import { createWorker, PSM, Worker } from 'tesseract.js';

export interface OcrProgressUpdate {
  progress: number; // 0 - 100
  status: string;   // e.g. "Initializing...", "Recognizing text..."
}

export interface OcrResult {
  text: string;
  confidence: number;
}

export class OcrService {
  private static workerInstance: Worker | null = null;
  private static activeLanguage = '';
  private static currentRequestId = 0;
  private static readonly OCR_TIMEOUT_MS = 60000;
  private static warmupPromise: Promise<Worker> | null = null;

  private static isCurrentRequest(requestId: number): boolean {
    return requestId === this.currentRequestId;
  }

  private static debug(message: string, data?: unknown): void {
    console.debug(`[TextSnip OCR] ${message}`, data ?? '');
  }

  private static async toBlob(image: string | Blob): Promise<Blob> {
    return typeof image === 'string'
      ? await (await fetch(image)).blob()
      : image;
  }

  private static async preprocessImage(image: string | Blob): Promise<Blob> {
    const inputBlob = await this.toBlob(image);
    this.debug('preprocessImage input', { size: inputBlob.size, type: inputBlob.type });

    const bitmap = await createImageBitmap(inputBlob);
    const sourceArea = bitmap.width * bitmap.height;

    let scale = 2;
    if (sourceArea < 250000 || bitmap.width < 900 || bitmap.height < 900) {
      scale = 3;
    }

    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));

    const context = canvas.getContext('2d');
    if (!context) {
      bitmap.close();
      return inputBlob;
    }

    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.filter = 'grayscale(1) contrast(1.75) brightness(1.08)';
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();

    return new Promise<Blob>((resolve) => {
      canvas.toBlob((blob) => {
        this.debug('preprocessImage output', {
          width: canvas.width,
          height: canvas.height,
          size: blob?.size ?? inputBlob.size
        });
        resolve(blob || inputBlob);
      }, 'image/png');
    });
  }

  private static async preprocessBinaryImage(image: Blob, invert = false): Promise<Blob> {
    this.debug('preprocessBinaryImage input', { size: image.size, invert });
    const bitmap = await createImageBitmap(image);
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;

    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) {
      bitmap.close();
      return image;
    }

    context.drawImage(bitmap, 0, 0);
    bitmap.close();

    const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;

    for (let i = 0; i < data.length; i += 4) {
      const red = data[i];
      const green = data[i + 1];
      const blue = data[i + 2];
      const luminance = Math.round((red * 0.299) + (green * 0.587) + (blue * 0.114));
      const value = luminance > 170 ? 255 : 0;
      const finalValue = invert ? 255 - value : value;

      data[i] = finalValue;
      data[i + 1] = finalValue;
      data[i + 2] = finalValue;
    }

    context.putImageData(imageData, 0, 0);

    return new Promise<Blob>((resolve) => {
      canvas.toBlob((blob) => {
        this.debug('preprocessBinaryImage output', {
          width: canvas.width,
          height: canvas.height,
          size: blob?.size ?? image.size,
          invert
        });
        resolve(blob || image);
      }, 'image/png');
    });
  }

  private static async recognizeCandidate(
    worker: Worker,
    image: Blob,
    pageSegMode: PSM,
    onProgress?: (update: OcrProgressUpdate) => void
  ): Promise<OcrResult> {
    this.debug('recognizeCandidate start', { pageSegMode, size: image.size });
    await worker.setParameters({
      tessedit_pageseg_mode: pageSegMode,
      preserve_interword_spaces: '1',
      user_defined_dpi: '300'
    });

    onProgress?.({ progress: 80, status: 'Recognizing text...' });
    const ret = await worker.recognize(image, {
      rotateAuto: true,
      rotateRadians: 0
    });

    this.debug('recognizeCandidate done', {
      pageSegMode,
      textLength: (ret.data.text || '').trim().length,
      confidence: ret.data.confidence || 0
    });

    return {
      text: (ret.data.text || '').trim(),
      confidence: ret.data.confidence || 0
    };
  }

  /**
   * Initialize or retrieve an existing Tesseract worker instance.
   * Uses locally bundled WASM, worker script, and language models for 100% offline privacy.
   */
  public static async getWorker(
    language = 'eng',
    onProgress?: (update: OcrProgressUpdate) => void,
    requestId = this.currentRequestId,
    skipCancellationCheck = false
  ): Promise<Worker> {
    if (this.warmupPromise) {
      const warmedWorker = await this.warmupPromise;
      return warmedWorker;
    }

    // If worker exists with same language, return it
    if (this.workerInstance && this.activeLanguage === language) {
      return this.workerInstance;
    }

    // Terminate existing worker if switching languages
    if (this.workerInstance) {
      await this.terminate();
    }

    onProgress?.({ progress: 10, status: 'Initializing OCR engine...' });

    // Use extension's local web-accessible assets to bypass host CSP and ensure offline privacy.
    // Pin the core to the bundled LSTM build so the worker does not depend on runtime core selection.
    const workerPath = chrome.runtime.getURL('tesseract/worker.min.js');
    const corePath = chrome.runtime.getURL('tesseract');
    const langPath = chrome.runtime.getURL('tessdata');

    const worker = await createWorker(language, 1, {
      workerPath,
      corePath,
      langPath,
      gzip: true,
      workerBlobURL: false,
      logger: (m) => {
        if (m.status === 'recognizing text') {
          const pct = Math.min(100, Math.round((m.progress || 0) * 100));
          onProgress?.({
            progress: pct,
            status: `Extracting text... (${pct}%)`
          });
        } else if (m.status === 'loading tesseract core') {
          onProgress?.({ progress: 30, status: 'Loading OCR core...' });
        } else if (m.status === 'loading language traineddata') {
          onProgress?.({ progress: 50, status: 'Loading language data...' });
        } else if (m.status === 'initializing tesseract') {
          onProgress?.({ progress: 70, status: 'Preparing recognition...' });
        }
      }
    }, {
      load_system_dawg: '0',
      load_freq_dawg: '0',
      load_unambig_dawg: '0',
      load_punc_dawg: '0',
      load_number_dawg: '0',
      load_bigram_dawg: '0'
    });

    if (!skipCancellationCheck && !this.isCurrentRequest(requestId)) {
      await worker.terminate().catch(() => {});
      throw new Error('OCR request was cancelled');
    }

    this.workerInstance = worker;
    this.activeLanguage = language;

    return worker;
  }

  public static async warmup(language = 'eng'): Promise<Worker> {
    if (this.workerInstance && this.activeLanguage === language) {
      return this.workerInstance;
    }

    if (!this.warmupPromise || this.activeLanguage !== language) {
      this.warmupPromise = this.getWorker(language, undefined, this.currentRequestId, true)
        .finally(() => {
          this.warmupPromise = null;
        });
    }

    return this.warmupPromise;
  }

  /**
   * Run OCR on image input (Blob or Data URL).
   */
  public static async recognize(
    image: string | Blob,
    language = 'eng',
    onProgress?: (update: OcrProgressUpdate) => void
  ): Promise<OcrResult> {
    const requestId = ++this.currentRequestId;
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
    try {
      this.debug('recognize start', { language });
      onProgress?.({ progress: 20, status: 'Preparing OCR image...' });
      const rawImage = await this.toBlob(image);
      const enhancedImage = await this.preprocessImage(rawImage);
      const binaryImage = await this.preprocessBinaryImage(enhancedImage);
      const invertedBinaryImage = await this.preprocessBinaryImage(enhancedImage, true);

      const worker = await this.getWorker(language, onProgress, requestId);

      if (!this.isCurrentRequest(requestId)) {
        throw new Error('OCR request was cancelled');
      }

      const recognitionPromise = (async () => {
        let bestResult: OcrResult = { text: '', confidence: 0 };

        const candidates = [
          { image: rawImage, pageSegMode: PSM.SPARSE_TEXT },
          { image: rawImage, pageSegMode: PSM.SINGLE_BLOCK },
          { image: enhancedImage, pageSegMode: PSM.SPARSE_TEXT },
          { image: enhancedImage, pageSegMode: PSM.SINGLE_BLOCK },
          { image: binaryImage, pageSegMode: PSM.SPARSE_TEXT },
          { image: binaryImage, pageSegMode: PSM.SINGLE_BLOCK },
          { image: invertedBinaryImage, pageSegMode: PSM.SPARSE_TEXT },
          { image: invertedBinaryImage, pageSegMode: PSM.SINGLE_BLOCK }
        ];

        for (const candidate of candidates) {
          const result = await this.recognizeCandidate(
            worker,
            candidate.image,
            candidate.pageSegMode,
            onProgress
          );

          if (result.text.length > bestResult.text.length || result.confidence > bestResult.confidence) {
            bestResult = result;
          }

          if (result.text.trim()) {
            return result;
          }
        }

        return bestResult;
      })();

      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutHandle = setTimeout(() => {
          this.currentRequestId += 1;
          void this.terminate();
          reject(new Error('OCR took too long to complete. Please try again.'));
        }, OcrService.OCR_TIMEOUT_MS);
      });

      const ret = await Promise.race([recognitionPromise, timeoutPromise]);

      if (!this.isCurrentRequest(requestId)) {
        throw new Error('OCR request was cancelled');
      }

      onProgress?.({ progress: 100, status: 'Complete' });
      this.debug('recognize complete', { textLength: ret.text.length, confidence: ret.confidence });
      return ret;
    } catch (err) {
      console.error('[TextSnip] OCR Recognition failed:', err);
      await this.terminate();
      throw err;
    } finally {
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
      }
    }
  }

  /**
   * Terminate active worker to free up memory when capture session closes.
   */
  public static async terminate(): Promise<void> {
    if (this.workerInstance) {
      try {
        await this.workerInstance.terminate();
      } catch (e) {
        console.warn('Error terminating Tesseract worker:', e);
      }
      this.workerInstance = null;
      this.activeLanguage = '';
    }
  }
}

