/**
 * Configuration module - Main entry point
 * 
 * This module re-exports all configuration types and functions from sub-modules
 * to maintain backward compatibility with existing code.
 */

// Export all types
export type {
  TargetType,
  TargetConfig,
  PixivCredentialConfig,
  NetworkConfig,
  OrganizationMode,
  StorageConfig,
  SchedulerConfig,
  StandaloneConfig,
} from './config/types';

// Export configuration functions
export { loadConfig, getConfigPath } from './config/loader';
export { generateDefaultConfig, DEFAULT_CONFIG } from './config/defaults';
export { validateConfigFile, ConfigValidationError } from './config/validation';
export { applyEnvironmentOverrides, adjustProxyForEnvironment, isRunningInDocker } from './config/environment';
export { processConfigPlaceholders } from './config/placeholders';
export { applyDefaults } from './config/path-resolution';
