import { UserSettings, DEFAULT_SETTINGS } from '../types/settings';

const STORAGE_KEY = 'textsnip_settings';

export class SettingsService {
  static async getSettings(): Promise<UserSettings> {
    try {
      const data = await chrome.storage.local.get(STORAGE_KEY);
      if (data && data[STORAGE_KEY]) {
        return { ...DEFAULT_SETTINGS, ...data[STORAGE_KEY] };
      }
    } catch (e) {
      console.warn('Failed to load settings from storage, using defaults:', e);
    }
    return { ...DEFAULT_SETTINGS };
  }

  static async saveSettings(settings: Partial<UserSettings>): Promise<UserSettings> {
    const current = await this.getSettings();
    const updated: UserSettings = { ...current, ...settings };
    await chrome.storage.local.set({ [STORAGE_KEY]: updated });
    return updated;
  }
}

