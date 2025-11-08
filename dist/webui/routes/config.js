"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const fs_1 = require("fs");
const path_1 = require("path");
const config_1 = require("../../config");
const logger_1 = require("../../logger");
const config_validator_1 = require("../utils/config-validator");
const router = (0, express_1.Router)();
/**
 * GET /api/config
 * Get current configuration
 */
router.get('/', async (req, res) => {
    try {
        const configPath = (0, config_1.getConfigPath)();
        const config = (0, config_1.loadConfig)(configPath);
        // Remove sensitive information before sending
        const safeConfig = {
            ...config,
            pixiv: {
                ...config.pixiv,
                refreshToken: config.pixiv?.refreshToken ? '***' : undefined,
                clientSecret: config.pixiv?.clientSecret ? '***' : undefined,
            },
        };
        // Include config path information
        res.json({
            ...safeConfig,
            _meta: {
                configPath,
                configPathRelative: (0, path_1.relative)(process.cwd(), configPath),
            },
        });
    }
    catch (error) {
        logger_1.logger.error('Failed to get config', { error });
        res.status(500).json({ error: 'Failed to get config' });
    }
});
/**
 * PUT /api/config
 * Update configuration
 */
router.put('/', async (req, res) => {
    try {
        const configPath = (0, config_1.getConfigPath)();
        const currentConfig = (0, config_1.loadConfig)(configPath);
        // Merge with existing config (preserve sensitive data)
        const updatedConfig = {
            ...currentConfig,
            ...req.body,
            pixiv: {
                ...currentConfig.pixiv,
                ...req.body.pixiv,
                // Preserve sensitive fields
                refreshToken: currentConfig.pixiv?.refreshToken,
                clientSecret: currentConfig.pixiv?.clientSecret,
            },
        };
        // Validate configuration
        const validationResult = (0, config_validator_1.validateConfig)(updatedConfig);
        if (!validationResult.valid) {
            return res.status(400).json({
                error: 'Invalid configuration',
                details: validationResult.errors,
            });
        }
        // Write to file
        (0, fs_1.writeFileSync)(configPath, JSON.stringify(updatedConfig, null, 2), 'utf-8');
        logger_1.logger.info('Configuration updated', { configPath });
        res.json({
            success: true,
            message: 'Configuration updated successfully',
        });
    }
    catch (error) {
        logger_1.logger.error('Failed to update config', { error });
        res.status(500).json({
            error: 'Failed to update config',
            message: error instanceof Error ? error.message : String(error),
        });
    }
});
/**
 * POST /api/config/validate
 * Validate configuration
 */
router.post('/validate', async (req, res) => {
    try {
        const config = req.body;
        const validationResult = (0, config_validator_1.validateConfig)(config);
        res.json({
            valid: validationResult.valid,
            errors: validationResult.errors,
        });
    }
    catch (error) {
        logger_1.logger.error('Failed to validate config', { error });
        res.status(500).json({ error: 'Failed to validate config' });
    }
});
/**
 * GET /api/config/backup
 * Backup current configuration
 */
router.get('/backup', async (req, res) => {
    try {
        const configPath = (0, config_1.getConfigPath)();
        const config = (0, config_1.loadConfig)(configPath);
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupPath = configPath.replace('.json', `.backup.${timestamp}.json`);
        (0, fs_1.writeFileSync)(backupPath, JSON.stringify(config, null, 2), 'utf-8');
        res.json({
            success: true,
            backupPath,
            message: 'Configuration backed up successfully',
        });
    }
    catch (error) {
        logger_1.logger.error('Failed to backup config', { error });
        res.status(500).json({ error: 'Failed to backup config' });
    }
});
/**
 * POST /api/config/restore
 * Restore configuration from backup
 */
router.post('/restore', async (req, res) => {
    try {
        const { backupPath } = req.body;
        if (!backupPath || !(0, fs_1.existsSync)(backupPath)) {
            return res.status(400).json({
                error: 'Invalid backup path',
            });
        }
        const backupConfig = JSON.parse((0, fs_1.readFileSync)(backupPath, 'utf-8'));
        const configPath = (0, config_1.getConfigPath)();
        (0, fs_1.writeFileSync)(configPath, JSON.stringify(backupConfig, null, 2), 'utf-8');
        res.json({
            success: true,
            message: 'Configuration restored successfully',
        });
    }
    catch (error) {
        logger_1.logger.error('Failed to restore config', { error });
        res.status(500).json({ error: 'Failed to restore config' });
    }
});
exports.default = router;
//# sourceMappingURL=config.js.map