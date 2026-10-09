import { SettingsService } from '../storage/settings-service';

document.addEventListener('DOMContentLoaded', async () => {
  const btnCapture = document.getElementById('btn-capture') as HTMLButtonElement;
  const btnOpenOptions = document.getElementById('btn-open-options') as HTMLButtonElement;
  const selectLanguage = document.getElementById('select-language') as HTMLSelectElement;
  const statusMessage = document.getElementById('status-message') as HTMLDivElement;
  const shortcutDisplay = document.getElementById('shortcut-display') as HTMLElement;

  // Load and apply settings
  const settings = await SettingsService.getSettings();

  // Apply theme
  if (settings.theme === 'system') {
    document.documentElement.removeAttribute('data-theme');
  } else {
    document.documentElement.setAttribute('data-theme', settings.theme);
  }

  if (selectLanguage) {
    selectLanguage.value = settings.ocrLanguage || 'eng';
    selectLanguage.addEventListener('change', async () => {
      await SettingsService.saveSettings({ ocrLanguage: selectLanguage.value });
    });
  }

  // Display configured shortcut
  try {
    const commands = await chrome.commands.getAll();
    const snipCommand = commands.find((c) => c.name === '_execute_action');
    if (snipCommand && snipCommand.shortcut) {
      shortcutDisplay.textContent = snipCommand.shortcut;
    }
  } catch (err) {
    console.warn('Could not retrieve commands:', err);
  }

  // Open settings/options page
  btnOpenOptions?.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

  // Handle capture button click
  btnCapture?.addEventListener('click', async () => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab || !tab.id) {
        showError('No active browser tab found.');
        return;
      }

      const url = tab.url || '';
      if (
        url.startsWith('chrome://') ||
        url.startsWith('chrome-extension://') ||
        url.startsWith('https://chromewebstore.google.com') ||
        url.startsWith('https://chrome.google.com/webstore') ||
        url.startsWith('edge://') ||
        url.startsWith('about:') ||
        url.startsWith('view-source:')
      ) {
        showError('This page cannot be captured by the extension. Try a standard website.');
        return;
      }

      // Send start selection message to background
      await chrome.runtime.sendMessage({ type: 'START_SELECTION' });
      // Close popup so it doesn't block the screen
      window.close();
    } catch (err) {
      console.error('Failed to start capture:', err);
      showError('Unable to start capture on this page.');
    }
  });

  function showError(msg: string) {
    if (statusMessage) {
      statusMessage.textContent = msg;
      statusMessage.className = 'status-message error';
      statusMessage.classList.remove('hidden');
    }
  }
});

