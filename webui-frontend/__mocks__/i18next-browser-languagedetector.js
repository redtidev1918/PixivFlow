class LanguageDetectorMock {
  constructor() {
    this.type = 'languageDetector';
    this.language = 'en-US';
  }

  init() {
    // noop
  }

  detect() {
    return this.language;
  }

  cacheUserLanguage(language) {
    this.language = language;
  }
}

module.exports = LanguageDetectorMock;
module.exports.default = LanguageDetectorMock;

