/**
 * Command metadata system for better organization and documentation
 */

/**
 * Command category for better organization
 */
export enum CommandCategory {
  AUTHENTICATION = 'Authentication',
  DOWNLOAD = 'Download',
  CONFIGURATION = 'Configuration',
  MONITORING = 'Monitoring & Status',
  MAINTENANCE = 'Maintenance',
  UTILITY = 'Utility',
}

/**
 * Command metadata interface
 */
export interface CommandMetadata {
  /** Command category */
  category: CommandCategory;
  /** Whether this command requires authentication */
  requiresAuth: boolean;
  /** Whether this command is a long-running process */
  longRunning: boolean;
  /** Command examples */
  examples?: string[];
  /** Related commands */
  relatedCommands?: string[];
}

/**
 * Default metadata for commands
 */
export const DEFAULT_METADATA: CommandMetadata = {
  category: CommandCategory.UTILITY,
  requiresAuth: false,
  longRunning: false,
};

/**
 * Get command category display name with icon
 */
export function getCategoryDisplay(category: CommandCategory): string {
  const icons: Record<CommandCategory, string> = {
    [CommandCategory.AUTHENTICATION]: '🔐',
    [CommandCategory.DOWNLOAD]: '📥',
    [CommandCategory.CONFIGURATION]: '⚙️',
    [CommandCategory.MONITORING]: '📊',
    [CommandCategory.MAINTENANCE]: '🛠️',
    [CommandCategory.UTILITY]: '🔧',
  };
  return `${icons[category]} ${category}`;
}
