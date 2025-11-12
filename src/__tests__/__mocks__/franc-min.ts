/**
 * Mock for franc-min module
 * Used in tests to avoid ESM import issues
 */

/**
 * Mock language detection function
 * Returns language codes based on simple heuristics for testing
 */
export function franc(text: string): string {
  if (!text || text.length < 10) {
    return 'und';
  }

  // Simple heuristics for testing
  // Check for Chinese characters
  if (/[\u4e00-\u9fff]/.test(text)) {
    return 'cmn';
  }

  // Check for Japanese characters
  if (/[\u3040-\u309f\u30a0-\u30ff]/.test(text)) {
    return 'jpn';
  }

  // Check for Korean characters
  if (/[\uac00-\ud7a3]/.test(text)) {
    return 'kor';
  }

  // Default to English for other text
  if (/^[a-zA-Z\s]+$/.test(text)) {
    return 'eng';
  }

  // Undetermined for mixed content
  return 'und';
}

















































