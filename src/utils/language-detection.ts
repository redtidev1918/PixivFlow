/**
 * Language detection utilities for novel content
 * Uses franc-min library for fast and accurate language detection
 */

import { franc } from 'franc-min';
import { logger } from '../logger';

/**
 * Detected language information
 */
export interface DetectedLanguage {
  /**
   * ISO 639-3 language code (e.g., 'cmn' for Chinese, 'jpn' for Japanese, 'eng' for English)
   */
  code: string;
  /**
   * Language name in English
   */
  name: string;
  /**
   * Whether the detected language is Chinese (Simplified or Traditional)
   */
  isChinese: boolean;
  /**
   * Confidence score (0-1, higher is more confident)
   */
  confidence?: number;
}

/**
 * Language code to name mapping
 */
const LANGUAGE_NAMES: Record<string, string> = {
  'cmn': 'Chinese (Mandarin)',
  'jpn': 'Japanese',
  'eng': 'English',
  'kor': 'Korean',
  'spa': 'Spanish',
  'fra': 'French',
  'deu': 'German',
  'rus': 'Russian',
  'por': 'Portuguese',
  'ita': 'Italian',
  'und': 'Undetermined',
};

/**
 * Chinese language codes (including variants)
 */
const CHINESE_LANGUAGE_CODES = new Set([
  'cmn',  // Mandarin Chinese
  'yue',  // Cantonese
  'wuu',  // Wu Chinese
  'hak',  // Hakka Chinese
  'nan',  // Min Nan Chinese
]);

/**
 * 修正 franc 对中日文的误判。
 *
 * 中文与日文共享汉字，franc（以及 cld3/lingua 等概率型检测器）对"中日混合"
 * 文本常把中文正文误判为日文——而 Pixiv 中文小说正文经常混入少量日文标签/
 * 角色名/拟声词。区分中日文的可靠标准是 Unicode 假名字符：日文正文含大量
 * 平假名/片假名（U+3040–30FF），中文正文几乎不含假名。
 *
 * 规则：franc 判 jpn 时，若假名占 CJK 字符比例 < 10% 且汉字占比 > 20%，
 * 判定为中文（cmn）；否则维持 franc 原判。仅处理 jpn→cmn 的修正，
 * 不误伤真日文、也不影响英/韩等其它语言。
 */
export function refineFrancCode(detectedCode: string, text: string): string {
  if (detectedCode !== 'jpn') {
    return detectedCode;
  }
  const kana = (text.match(/[\u3040-\u30ff\u31f0-\u31ff]/g) || []).length;
  const han = (text.match(/[\u4e00-\u9fff]/g) || []).length;
  const cjk = kana + han;
  if (cjk > 0 && kana / cjk < 0.10 && han / text.length > 0.2) {
    return 'cmn';
  }
  return detectedCode;
}

/**
 * Detect the language of a text string
 * 
 * @param text The text to analyze
 * @param minLength Minimum text length required for reliable detection (default: 50)
 * @returns Detected language information, or null if text is too short
 * 
 * @example
 * ```typescript
 * const lang = detectLanguage("这是一段中文文本");
 * if (lang?.isChinese) {
 *   console.log("Detected Chinese text");
 * }
 * ```
 */
export function detectLanguage(text: string, minLength: number = 50): DetectedLanguage | null {
  if (!text || typeof text !== 'string') {
    return null;
  }

  // Remove common metadata headers that might interfere with detection
  // (e.g., "Title:", "Author:", "Tags:", etc.)
  const cleanedText = text
    .replace(/^(Title|Author|Author ID|Tags|Download Tag|Original URL|Created):\s*.*$/gmi, '')
    .replace(/^---\s*$/gm, '')
    .trim();

  // Check if text is long enough for reliable detection
  if (cleanedText.length < minLength) {
    logger.debug(`Text too short for language detection (${cleanedText.length} chars, minimum: ${minLength})`);
    return null;
  }

  try {
    // Use franc-min to detect language
    // franc-min returns ISO 639-3 language codes
    const detectedCode = franc(cleanedText);

    if (!detectedCode || detectedCode === 'und') {
      logger.debug('Language detection returned undetermined');
      return {
        code: 'und',
        name: LANGUAGE_NAMES['und'] || 'Undetermined',
        isChinese: false,
      };
    }

    // franc 对"中日混合"文本常把中文正文误判为日文（Pixiv 中文小说正文
    // 常混入日文标签/角色名/拟声词）。用假名占比二次校验：日文正文假名
    // （ひらがな/カタカナ）占比通常 30%+，中文正文几乎不含假名。
    const code = refineFrancCode(detectedCode, cleanedText);

    const isChinese = CHINESE_LANGUAGE_CODES.has(code);
    const name = LANGUAGE_NAMES[code] || code;

    logger.debug(`Detected language: ${name} (${code}), isChinese: ${isChinese}`, {
      textLength: cleanedText.length,
      detectedCode,
    });

    return {
      code,
      name,
      isChinese,
    };
  } catch (error) {
    logger.warn('Language detection failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/**
 * Check if a text is Chinese
 * 
 * @param text The text to check
 * @param minLength Minimum text length required for reliable detection (default: 50)
 * @returns true if the text is detected as Chinese, false otherwise, null if detection failed
 * 
 * @example
 * ```typescript
 * const isChinese = isChineseText("这是一段中文文本");
 * if (isChinese) {
 *   console.log("This is Chinese text");
 * }
 * ```
 */
export function isChineseText(text: string, minLength: number = 50): boolean | null {
  const detected = detectLanguage(text, minLength);
  return detected ? detected.isChinese : null;
}

