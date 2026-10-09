import { SettingsService } from '../storage/settings-service';
import { ThemeMode } from '../types/settings';

document.addEventListener('DOMContentLoaded', async () => {
  const ocrLanguageSelect = document.getElementById('ocr-language') as HTMLSelectElement;
  const autoCopyCheckbox = document.getElementById('auto-copy') as HTMLInputElement;
  const showPreviewCheckbox = document.getElementById('show-preview') as HTMLInputElement;
  const themeSelect = document.getElementById('theme-select') as HTMLSelectElement;
  const saveToast = document.getElementById('save-toast') as HTMLDivElement;

  let toastTimeout: number | undefined;

  function showToast() {
    if (!saveToast) return;
    saveToast.classList.remove('hidden');
    if (toastTimeout) clearTimeout(toastTimeout);
    toastTimeout = window.setTimeout(() => {
      saveToast.classList.add('hidden');
    }, 2000);
  }

  function applyTheme(theme: ThemeMode) {
    if (theme === 'system') {
      document.documentElement.removeAttribute('data-theme');
    } else {
      document.documentElement.setAttribute('data-theme', theme);
    }
  }

  // Load current settings
  const settings = await SettingsService.getSettings();
  if (ocrLanguageSelect) ocrLanguageSelect.value = settings.ocrLanguage || 'eng';
  if (autoCopyCheckbox) autoCopyCheckbox.checked = settings.autoCopyText;
  if (showPreviewCheckbox) showPreviewCheckbox.checked = settings.showPreview;
  if (themeSelect) themeSelect.value = settings.theme || 'system';
  applyTheme(settings.theme);

  // Event listeners for auto-saving
  ocrLanguageSelect?.addEventListener('change', async () => {
    await SettingsService.saveSettings({ ocrLanguage: ocrLanguageSelect.value });
    showToast();
  });

  autoCopyCheckbox?.addEventListener('change', async () => {
    await SettingsService.saveSettings({ autoCopyText: autoCopyCheckbox.checked });
    showToast();
  });

  showPreviewCheckbox?.addEventListener('change', async () => {
    await SettingsService.saveSettings({ showPreview: showPreviewCheckbox.checked });
    showToast();
  });

  themeSelect?.addEventListener('change', async () => {
    const selectedTheme = themeSelect.value as ThemeMode;
    await SettingsService.saveSettings({ theme: selectedTheme });
    applyTheme(selectedTheme);
    showToast();
  });
});

