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
   * Serve HTTPS instead of HTTP. When set, both files must be readable.
   * Opt-in via WEBUI_TLS_CERT / WEBUI_TLS_KEY env.
   */
  tls?: { certPath: string; keyPath: string };
}































































