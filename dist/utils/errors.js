"use strict";
/**
 * Unified error handling utilities
 * Provides consistent error types and handling patterns across the application
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.DatabaseError = exports.DownloadError = exports.NetworkError = exports.AuthenticationError = exports.ConfigError = exports.PixivFlowError = void 0;
exports.is404Error = is404Error;
exports.isSkipableError = isSkipableError;
exports.getErrorMessage = getErrorMessage;
exports.getDetailedErrorInfo = getDetailedErrorInfo;
exports.getErrorStack = getErrorStack;
class PixivFlowError extends Error {
    code;
    statusCode;
    cause;
    constructor(message, code, statusCode, cause) {
        super(message);
        this.code = code;
        this.statusCode = statusCode;
        this.cause = cause;
        this.name = 'PixivFlowError';
        // Maintains proper stack trace for where our error was thrown (only available on V8)
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, PixivFlowError);
        }
    }
}
exports.PixivFlowError = PixivFlowError;
class ConfigError extends PixivFlowError {
    constructor(message, cause) {
        super(message, 'CONFIG_ERROR', 400, cause);
        this.name = 'ConfigError';
    }
}
exports.ConfigError = ConfigError;
class AuthenticationError extends PixivFlowError {
    constructor(message, cause) {
        super(message, 'AUTH_ERROR', 401, cause);
        this.name = 'AuthenticationError';
    }
}
exports.AuthenticationError = AuthenticationError;
class NetworkError extends PixivFlowError {
    url;
    isRateLimit;
    waitTime;
    constructor(message, url, cause, metadata) {
        super(message, 'NETWORK_ERROR', undefined, cause);
        this.url = url;
        this.name = 'NetworkError';
        this.isRateLimit = metadata?.isRateLimit;
        this.waitTime = metadata?.waitTime;
    }
}
exports.NetworkError = NetworkError;
class DownloadError extends PixivFlowError {
    itemId;
    itemType;
    constructor(message, itemId, itemType, cause) {
        super(message, 'DOWNLOAD_ERROR', undefined, cause);
        this.itemId = itemId;
        this.itemType = itemType;
        this.name = 'DownloadError';
    }
}
exports.DownloadError = DownloadError;
class DatabaseError extends PixivFlowError {
    constructor(message, cause) {
        super(message, 'DATABASE_ERROR', 500, cause);
        this.name = 'DatabaseError';
    }
}
exports.DatabaseError = DatabaseError;
/**
 * Check if an error is a 404 (not found) error
 */
function is404Error(error) {
    if (error instanceof Error) {
        return error.message.includes('404') ||
            error.message.includes('not found') ||
            (error instanceof NetworkError && error.statusCode === 404);
    }
    return String(error).includes('404');
}
/**
 * Check if an error should be skipped (non-fatal)
 */
function isSkipableError(error) {
    if (is404Error(error)) {
        return true;
    }
    if (error instanceof Error) {
        // Network timeouts and connection errors are usually skipable
        const skipablePatterns = [
            'timeout',
            'ECONNREFUSED',
            'ENOTFOUND',
            'ETIMEDOUT',
            'ECONNRESET',
            '403', // Forbidden (private content)
            'language filter', // Language filter mismatch (should skip)
            'skipped:', // Explicitly skipped items (e.g., "Novel X skipped: ...")
        ];
        return skipablePatterns.some(pattern => error.message.toLowerCase().includes(pattern.toLowerCase()));
    }
    return false;
}
/**
 * Extract error message safely
 */
function getErrorMessage(error) {
    if (error instanceof Error) {
        return error.message;
    }
    if (typeof error === 'string') {
        return error;
    }
    return String(error);
}
/**
 * Get detailed error information including cause and suggestions
 */
function getDetailedErrorInfo(error) {
    const message = getErrorMessage(error);
    let type = 'UNKNOWN_ERROR';
    let cause;
    const suggestions = [];
    if (error instanceof NetworkError) {
        type = 'NETWORK_ERROR';
        if (error.cause) {
            cause = getErrorMessage(error.cause);
        }
        // Add suggestions based on error message
        const msgLower = message.toLowerCase();
        if (msgLower.includes('401') || msgLower.includes('unauthorized')) {
            suggestions.push('认证失败：请检查 refresh token 是否有效');
            suggestions.push('尝试重新登录以获取新的 refresh token');
        }
        else if (msgLower.includes('403') || msgLower.includes('forbidden')) {
            suggestions.push('访问被拒绝：可能是 Pixiv API 限制');
            suggestions.push('等待一段时间后重试，或检查账户状态');
        }
        else if (msgLower.includes('timeout') || msgLower.includes('timed out')) {
            suggestions.push('请求超时：检查网络连接');
            suggestions.push('尝试增加网络超时时间或使用代理');
        }
        else if (msgLower.includes('failed after')) {
            suggestions.push('多次重试后仍然失败：可能是网络不稳定或 API 限制');
            suggestions.push('检查网络连接和代理设置');
            suggestions.push('等待一段时间后重试');
        }
    }
    else if (error instanceof AuthenticationError) {
        type = 'AUTH_ERROR';
        suggestions.push('认证错误：请检查 refresh token 是否有效');
        suggestions.push('尝试重新登录以获取新的 refresh token');
    }
    return { message, type, cause, suggestions: suggestions.length > 0 ? suggestions : undefined };
}
/**
 * Extract error stack trace safely
 */
function getErrorStack(error) {
    if (error instanceof Error) {
        return error.stack;
    }
    return undefined;
}
//# sourceMappingURL=errors.js.map