/**
 * Real HTTP client for the simulated TelePost control plane.
 *
 * Nothing is stubbed here: this speaks the same `Authorization: Bearer` +
 * `/api/v1/...` contract production uses. It exists so a scenario can observe
 * and drive the review lifecycle (list -> approve) through the real service
 * rather than by mutating its database.
 */

export interface TelepostReview {
  id: number | string;
  status: string;
  media_count?: number;
  [key: string]: unknown;
}

export class TelepostControl {
  constructor(
    private readonly apiBase: string,
    private readonly apiToken: string,
    /** Separate token used by the review endpoints. */
    private readonly reviewToken?: string,
  ) {}

  private headers(useReviewToken = false): Record<string, string> {
    const token = useReviewToken ? this.reviewToken || this.apiToken : this.apiToken;
    return { Authorization: `Bearer ${token}` };
  }

  private async request(
    method: string,
    path: string,
    options: { useReviewToken?: boolean; body?: unknown } = {},
  ): Promise<{ status: number; json: Record<string, unknown> }> {
    const url = `${this.apiBase.replace(/\/$/, '')}${path}`;
    // TelePost parses the request body as JSON on writes even when there is
    // nothing to send, so mutations always carry an (empty) JSON object rather
    // than a bodyless request that fails as `invalid_json`.
    const body = options.body === undefined && method !== 'GET' ? {} : options.body;
    const response = await fetch(url, {
      method,
      headers: {
        ...this.headers(options.useReviewToken),
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    let json: Record<string, unknown> = {};
    if (text) {
      try {
        const parsed = JSON.parse(text);
        json = parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : { value: parsed };
      } catch {
        json = { raw: text };
      }
    }
    return { status: response.status, json };
  }

  async health(): Promise<boolean> {
    try {
      const { status } = await this.request('GET', '/health');
      return status >= 200 && status < 300;
    } catch {
      return false;
    }
  }

  /** Reviews in any status; shape-tolerant because the API may paginate. */
  async listReviews(): Promise<TelepostReview[]> {
    const { json } = await this.request('GET', '/reviews');
    return extractRows(json).map((row) => ({
      ...row,
      id: (row.id ?? row.review_id) as number | string,
      status: String(row.status ?? 'unknown'),
    }));
  }

  async getReview(id: number | string): Promise<TelepostReview | null> {
    const { json } = await this.request('GET', `/reviews/${id}`);
    const rows = extractRows(json);
    if (rows.length > 0) {
      return {
        ...rows[0],
        id: (rows[0].id ?? rows[0].review_id ?? id) as number | string,
        status: String(rows[0].status ?? 'unknown'),
      };
    }
    if (typeof json.status === 'string') {
      return { ...json, id, status: json.status } as TelepostReview;
    }
    return null;
  }

  async approve(id: number | string): Promise<{ status: number; json: Record<string, unknown> }> {
    return this.request('POST', `/reviews/${id}/approve`, { useReviewToken: true });
  }

  async reject(id: number | string): Promise<{ status: number; json: Record<string, unknown> }> {
    return this.request('POST', `/reviews/${id}/reject`, { useReviewToken: true });
  }
}

/** Accepts `[...]`, `{data:[...]}`, `{items:[...]}` and `{reviews:[...]}`. */
function extractRows(json: Record<string, unknown>): Array<Record<string, unknown>> {
  if (Array.isArray(json)) return json as Array<Record<string, unknown>>;
  for (const key of ['data', 'items', 'reviews', 'results']) {
    const value = json[key];
    if (Array.isArray(value)) return value as Array<Record<string, unknown>>;
    if (value && typeof value === 'object') {
      const nested = value as Record<string, unknown>;
      for (const inner of ['items', 'reviews', 'results']) {
        if (Array.isArray(nested[inner])) return nested[inner] as Array<Record<string, unknown>>;
      }
    }
  }
  return [];
}
