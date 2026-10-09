export interface OcrLanguageInfo {
  code: string;
  label: string;
  isBundled: boolean;
}

export const SUPPORTED_LANGUAGES: OcrLanguageInfo[] = [
  { code: 'eng', label: 'English', isBundled: true },
  { code: 'tam', label: 'Tamil', isBundled: false },
  { code: 'sin', label: 'Sinhala', isBundled: false },
  { code: 'hin', label: 'Hindi', isBundled: false },
  { code: 'ara', label: 'Arabic', isBundled: false }
];

export function getLanguageInfo(code: string): OcrLanguageInfo {
  return SUPPORTED_LANGUAGES.find((lang) => lang.code === code) || SUPPORTED_LANGUAGES[0];
}

