export type ThemeMode = 'system' | 'light' | 'dark';

export interface UserSettings {
  ocrLanguage: string;
  autoCopyText: boolean;
  showPreview: boolean;
  theme: ThemeMode;
}

export const DEFAULT_SETTINGS: UserSettings = {
  ocrLanguage: 'eng',
  autoCopyText: false,
  showPreview: true,
  theme: 'system'
};

