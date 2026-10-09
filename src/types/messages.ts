import { SelectionPayload } from './crop';

export type ExtensionMessage =
  | { type: 'START_SELECTION' }
  | { type: 'CANCEL_SELECTION' }
  | { type: 'WARMUP_OCR' }
  | { type: 'CAPTURE_TAB'; payload: SelectionPayload }
  | { type: 'CAPTURE_TAB_RESULT'; success: true; screenshotDataUrl: string }
  | { type: 'CAPTURE_TAB_RESULT'; success: false; error: string }
  | { type: 'RUN_OCR'; payload: { image: string; language: string }; tabId: number }
  | { type: 'EXECUTE_OCR'; payload: { image: string; language: string }; tabId: number }
  | { type: 'OCR_PROGRESS'; progress: number; status: string; tabId?: number }
  | { type: 'OCR_COMPLETE'; success: true; text: string; confidence: number }
  | { type: 'OCR_COMPLETE'; success: false; error: string }
  | { type: 'GET_SETTINGS' }
  | { type: 'GET_SETTINGS_RESPONSE'; settings: import('./settings').UserSettings };
