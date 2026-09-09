import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { HttpMultipartDelivery } from '../../delivery/HttpMultipartDelivery';

function parseFields(buffer: Buffer): Record<string, string> {
  const text = buffer.toString('latin1');
  const fields: Record<string, string> = {};
  // Only field parts (no filename=); body up to the next boundary marker.
  const re = /name="(?!\S+"; filename=")([^"]+)"\r\n\r\n([\s\S]*?)\r\n--/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    fields[m[1]] = Buffer.from(m[2], 'latin1').toString('utf8');
  }
  return fields;
}

describe('E2E idempotency contract over real HTTP', () => {
  it('ACK loss retry carries the SAME key; server creates one record and answers idempotent_replay', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'e2e-'));
    const file = join(dir, 'a.jpg');
    writeFileSync(file, 'img');
    const seenKeys: string[] = [];
    const posts = new Map<string, number>();
    let serverError: unknown = null;

    const server: Server = createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', (c: Buffer) => chunks.push(c));
      req.on('end', () => {
        try {
          const fields = parseFields(Buffer.concat(chunks));
          const key = fields.idempotency_key;
          expect(key).toBeTruthy();
          seenKeys.push(key);
          let payload: unknown;
          const existing = posts.get(key);
          if (existing) {
            payload = {
              ok: true,
              data: {
                status: 'published', reused: true,
                reuse_reason: 'idempotent_replay',
                matched_idempotency_key: key, message_id: existing,
              },
            };
          } else {
            posts.set(key, 555);
            payload = { ok: true, data: { status: 'published', reused: false, message_id: 555 } };
          }
          res.writeHead(200, { 'content-type': 'application/json' });
          res.end(JSON.stringify(payload));
        } catch (e) {
          serverError = e;
          if (!res.headersSent) res.writeHead(500);
          res.end('err');
        }
      });
    });

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = (server.address() as AddressInfo).port;
    try {
      const provider = new HttpMultipartDelivery({
        type: 'httpMultipart',
        url: `http://127.0.0.1:${port}/submissions`,
        fileField: 'files',
        fields: { tags: 'Pixiv', idempotency_key: '{{idempotencyKey}}' },
      });
      const ctx = {
        title: 'W', pixivId: '999', type: 'illustration' as const,
        idempotencyKey: 'pixivflow:t:illustration:999:slot1:ta',
      };
      const r1 = await provider.deliver({ files: [file], context: ctx });
      // ACK lost: the caller retries the SAME intent with the SAME key.
      const r2 = await provider.deliver({ files: [file], context: ctx });

      expect(seenKeys).toEqual([ctx.idempotencyKey, ctx.idempotencyKey]);
      expect(r1.ack?.kind).toBe('accepted');
      expect(r2.ack?.kind).toBe('idempotent_replay');
      expect(posts.size).toBe(1);
      expect(serverError).toBeNull();
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      rmSync(dir, { recursive: true, force: true });
    }
  }, 20000);
});
