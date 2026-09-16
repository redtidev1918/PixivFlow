export type SystemErrorType =
  | 'PIXIV_AUTH_FAILED'
  | 'PIXIV_RATE_LIMITED'
  | 'PIXIV_NOT_FOUND'
  | 'PIXIV_CDN_FORBIDDEN'
  | 'NETWORK_TIMEOUT'
  | 'DOWNLOAD_CORRUPTED'
  | 'IMAGE_PROCESS_FAILED'
  | 'TELEGRAM_UPLOAD_FAILED'
  | 'CONFIG_ERROR'
  | 'INTERNAL_ERROR';

export interface SystemErrorClassification {
  error_type: SystemErrorType;
  retryable: boolean;
}

export interface SystemErrorInput extends Partial<SystemErrorClassification> {
  service?: string;
  component?: string;
  bot_id?: string;
  schedule_id?: string;
  slot_id?: string;
  pixiv_id?: string;
  stage?: string;
  message: string;
  http_status?: number | null;
  trace_id?: string;
}

export interface SystemErrorRow extends SystemErrorInput {
  id: number;
  created_at: string;
  resolved_at: string | null;
}
