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
  /**
   * Whether the entry point must print the returned result.
   *
   * A command that hands its human-readable output back in `CommandResult`
   * (`message`, or `data` when `--json` is given) instead of printing it
   * inline sets this — otherwise the result would be computed and thrown
   * away, which is what made `pixivflow delivery status` silent. Commands that
   * print their own output leave it unset so nothing is printed twice.
   */
  rendersResult?: boolean;
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
