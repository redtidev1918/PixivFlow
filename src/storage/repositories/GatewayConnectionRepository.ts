import { BaseRepository } from './BaseRepository';

/**
 * Lifecycle of a gateway connection as PixivFlow last observed it.
 *
 * This is a CACHE of the gateway's own pairing state, not a state authority:
 * pairing (QR scan / bot login) happens entirely inside the external gateway,
 * and PixivFlow only stores the last observation. `unknown` means "never
 * probed", and a stale `connected` is acceptable — the gateway remains the
 * source of truth and a failed delivery is what actually proves it is down.
 */
export type GatewayConnectionStatus = 'unknown' | 'unreachable' | 'waiting' | 'connected';

export const GATEWAY_CONNECTION_STATUSES: readonly GatewayConnectionStatus[] = [
  'unknown',
  'unreachable',
  'waiting',
  'connected',
];

export interface GatewayConnectionRow {
  id: string;
  name: string;
  type: string;
  endpoint: string | null;
  status: GatewayConnectionStatus;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

export interface UpsertGatewayConnection {
  name: string;
  type: string;
  endpoint?: string | null;
  status?: GatewayConnectionStatus;
  metadata?: Record<string, unknown> | null;
  /** Deterministic id for callers that want name-stable rows (defaults to the name). */
  id?: string;
}

interface RawGatewayRow {
  id: string;
  name: string;
  type: string;
  endpoint: string | null;
  status: string;
  metadata: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Registry of external Messaging Gateway connections.
 *
 * Deliberately tiny: it answers "which gateways does this deployment point at,
 * and what did we last observe?" so the WebUI/CLI can show a connection list.
 * It never stores tokens, cookies or session material — those live with the
 * gateway process itself (Hermes keeps its session in its own directory; a
 * OneBot implementation keeps its own login state).
 */
export class GatewayConnectionRepository extends BaseRepository {
  /** All connections, newest observation first, name-stable tiebreak. */
  list(): GatewayConnectionRow[] {
    const rows = this.db
      .prepare(`SELECT * FROM gateway_connections ORDER BY name ASC`)
      .all() as RawGatewayRow[];
    return rows.map(toRow);
  }

  getByName(name: string): GatewayConnectionRow | null {
    const row = this.db
      .prepare(`SELECT * FROM gateway_connections WHERE name = ?`)
      .get(String(name)) as RawGatewayRow | undefined;
    return row ? toRow(row) : null;
  }

  getById(id: string): GatewayConnectionRow | null {
    const row = this.db
      .prepare(`SELECT * FROM gateway_connections WHERE id = ?`)
      .get(String(id)) as RawGatewayRow | undefined;
    return row ? toRow(row) : null;
  }

  /** Insert or update by name. Returns the durable row after the write. */
  upsert(input: UpsertGatewayConnection): GatewayConnectionRow {
    const metadata = input.metadata === undefined ? null : JSON.stringify(input.metadata ?? null);
    this.db
      .prepare(
        `INSERT INTO gateway_connections (id, name, type, endpoint, status, metadata)
         VALUES (@id, @name, @type, @endpoint, @status, @metadata)
         ON CONFLICT(name) DO UPDATE SET
           type = excluded.type,
           endpoint = excluded.endpoint,
           status = excluded.status,
           metadata = excluded.metadata,
           updated_at = CURRENT_TIMESTAMP`
      )
      .run({
        id: input.id?.trim() || `gateway:${input.name}`,
        name: input.name.trim(),
        type: input.type.trim(),
        endpoint: input.endpoint?.trim() || null,
        status: input.status ?? 'unknown',
        metadata,
      });
    const row = this.getByName(input.name.trim());
    if (!row) throw new Error(`Gateway connection did not persist: ${input.name}`);
    return row;
  }

  /**
   * Record one observation of a gateway's connection state. Keeps `endpoint` /
   * `type` / `metadata` untouched — this is the probe path, not the config path.
   */
  recordStatus(
    name: string,
    status: GatewayConnectionStatus,
    metadata?: Record<string, unknown> | null
  ): GatewayConnectionRow | null {
    const existing = this.getByName(name);
    if (!existing) return null;
    return this.upsert({
      id: existing.id,
      name: existing.name,
      type: existing.type,
      endpoint: existing.endpoint,
      status,
      metadata: metadata === undefined ? existing.metadata : metadata,
    });
  }

  remove(name: string): boolean {
    const info = this.db.prepare(`DELETE FROM gateway_connections WHERE name = ?`).run(String(name));
    return Number(info.changes ?? 0) > 0;
  }
}

function toRow(row: RawGatewayRow): GatewayConnectionRow {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    endpoint: row.endpoint ?? null,
    status: normalizeStatus(row.status),
    metadata: parseMetadata(row.metadata),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function normalizeStatus(value: string): GatewayConnectionStatus {
  return (GATEWAY_CONNECTION_STATUSES as readonly string[]).includes(value)
    ? (value as GatewayConnectionStatus)
    : 'unknown';
}

function parseMetadata(value: string | null): Record<string, unknown> | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}
