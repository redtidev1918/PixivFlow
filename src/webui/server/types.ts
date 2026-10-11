/**
 * WebUI Server configuration options
 */
export interface WebUIServerOptions {
  port?: number;
  host?: string;
  enableCors?: boolean;
  corsOrigin?: string | string[];
  staticPath?: string;
  /**
   * Configuration file the WebUI must serve. Explicit `--config` wins over
   * `PIXIV_DOWNLOADER_CONFIG`, which wins over the default resolution. When
   * omitted, the process-wide active config path is used, so the WebUI, the
   * download task manager and the scheduler share one effective config.
   */
  configPath?: string;
  /**
   * Serve HTTPS instead of HTTP. When set, both files must be readable.
   * Opt-in via WEBUI_TLS_CERT / WEBUI_TLS_KEY env.
   */
  tls?: { certPath: string; keyPath: string };
}































































