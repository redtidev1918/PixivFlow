/**
 * Process-wide active configuration path.
 *
 * The CLI resolves the effective configuration file exactly once at bootstrap
 * and publishes it here, so every downstream consumer — commands, the WebUI
 * HTTP handlers, the download task manager and the scheduler runtime — reads
 * the same file instead of re-resolving a path of its own.
 *
 * Resolution priority is owned by `getConfigPath()`:
 *   explicit `--config` > PIXIV_DOWNLOADER_CONFIG > default at bootstrap;
 *   the published path then remains active for downstream consumers.
 *
 * Keeping the state in one module makes the "which config file is in use?"
 * question answerable and testable instead of being implicit in ~40 call sites.
 */

export interface ActiveConfigPath {
  /** Absolute path of the configuration file in use. */
  path: string;
  /**
   * True when the path was requested explicitly (`--config` or
   * `PIXIV_DOWNLOADER_CONFIG`). Explicit requests must fail loudly instead of
   * silently falling back to a different configuration file.
   */
  explicit: boolean;
}

let activeConfigPath: ActiveConfigPath | undefined;

/**
 * Publish the configuration file the process should use.
 * @param path - Resolved absolute path of the configuration file
 * @param explicit - Whether the user requested this path explicitly
 */
export function setActiveConfigPath(path: string, explicit: boolean = true): void {
  activeConfigPath = { path, explicit };
}

/** The configuration file published by the caller of the process, if any. */
export function getActiveConfigPath(): string | undefined {
  return activeConfigPath?.path;
}

/** Whether the active configuration file was requested explicitly. */
export function isActiveConfigPathExplicit(): boolean {
  return activeConfigPath?.explicit === true;
}

/** Forget the published path (used by tests and embedded hosts). */
export function clearActiveConfigPath(): void {
  activeConfigPath = undefined;
}
