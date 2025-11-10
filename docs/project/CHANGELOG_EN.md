# 📝 Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Added
- ✨ Added pixiv-token-getter adapter support (2025-11-10)
  - New `pixiv-token-getter-adapter.ts` module supporting login via pixiv-token-getter library
  - Supports both interactive and headless login modes
  - Provides better login experience and error handling
  - Automatically detects if pixiv-token-getter is available, falls back to other login methods if not
  - Electron app automatically integrates pixiv-token-getter adapter

### Improved
- ✨ Optimized metadata file storage location (2025-01-XX)
  - Moved metadata JSON files from download directory to `data/metadata` directory to keep download directory clean
  - Enhanced error handling and input validation in `saveMetadata` method
  - Added filename sanitization to prevent filesystem errors from special characters
  - Improved error handling: metadata save failures no longer cause download failures, only log warnings
  - Updated project structure documentation to reflect new metadata directory location

### Removed
- 🗑️ Removed mobile support (iOS/Android) (2025-11-10)
  - Deleted Android directory and related mobile code
  - Removed mobile-related documentation and configuration files
  - Project now focuses on desktop applications (Windows/macOS/Linux) and web browser access
  - Updated documentation to clearly state desktop-only support, no mobile support
- 🗑️ Cleaned up test files and example files (2025-11-10)
  - Deleted `test-pixiv-token-getter.ts` test file
  - Deleted `terminal-login-example.ts` example file
  - Deleted test files: `test-concurrency.ts`, `test-download.ts`, `test-scheduled-download.ts`, etc.
  - Removed related test scripts from `package.json` (`login:example`, `test:token-getter`)
  - Cleaned up compiled files in `dist` directory
- ✨ Added global installation documentation and instructions (2025-01-XX)
  - Added global installation method in README.md
  - Added global installation steps in QUICKSTART.md
  - Added global installation option in START_HERE.md
  - Updated command quick reference, including commands after global installation
  - Explained configuration file location and usage after global installation

### Fixed
- 🐛 Fixed dynamic concurrency control rate limit detection logic (2025-01-XX)
  - Fixed incorrect rate limit detection in `processInParallel`
  - Now correctly identifies `NetworkError.isRateLimit` property instead of relying on error message string matching
  - Improved log output when rate limited, including detailed concurrency change information
  - When encountering 429 errors, the system automatically halves the concurrency (not below minimum concurrency limit)
  - After consecutive successful requests, the system gradually restores concurrency

### Planned
- Add more download modes
- Performance optimizations
- UI improvements

---

## [2.0.0] - 2024-12

### Added
- ✨ Complete TypeScript rewrite
- ✨ Standalone CLI tool, no browser extension required
- ✨ Scheduled task support (Cron expressions)
- ✨ Smart deduplication feature (SQLite database)
- ✨ Resume download feature
- ✨ Auto retry mechanism
- ✨ Detailed logging system
- ✨ Setup wizard (interactive configuration)
- ✨ Multiple download modes (search, ranking)
- ✨ Support for illustration and novel downloads
- ✨ Flexible filtering conditions (tags, bookmarks, date range)
- ✨ Random download feature
- ✨ Complete script toolset
- ✨ Health check feature
- ✨ Auto monitoring and maintenance scripts
- ✨ Proxy support (HTTP/HTTPS/SOCKS5)
- ✨ OAuth 2.0 PKCE authentication flow

### Changed
- 🔧 Optimized download performance
- 🔧 Improved error handling
- 🔧 Enhanced log readability
- 🔧 Optimized configuration management

### Documentation
- 📚 Complete README
- 📚 Detailed usage tutorial (TUTORIAL.md)
- 📚 Beginner guide (START_HERE.md)
- 📚 Quick start guide (QUICKSTART.md)
- 📚 Login guide (LOGIN_GUIDE.md)
- 📚 Configuration guide (CONFIG_GUIDE.md)
- 📚 Script usage guide (SCRIPTS_GUIDE.md)
- 📚 Test guide (TEST_GUIDE.md)

---

## [1.0.0] - Initial Release

### Added
- 🎉 Initial release
- Basic download functionality
- Simple configuration system

---

## Version Notes

### Version Number Format

Version numbers follow [Semantic Versioning](https://semver.org/):

- **Major version**: Incompatible API changes
- **Minor version**: Backward compatible feature additions
- **Patch version**: Backward compatible bug fixes

### Change Types

- **Added**: New features
- **Changed**: Changes to existing functionality
- **Fixed**: Bug fixes
- **Removed**: Removed features
- **Security**: Security-related fixes
- **Documentation**: Documentation updates

---

## Links

- [GitHub Releases](https://github.com/zoidberg-xgd/pixivflow/releases)
- [Complete Documentation](./README.md)

---

**Note**: For detailed change records, please see [GitHub Releases](https://github.com/zoidberg-xgd/pixivflow/releases).

