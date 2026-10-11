import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer, Server } from 'node:http';
import { Database } from '../../storage/Database';
import { DeliveryService } from '../../delivery/DeliveryService';
import { DeliveryDispatcher } from '../../delivery/DeliveryDispatcher';
import { OutboxWorker } from '../../delivery/OutboxWorker';
import type { DeliveryConfig, TargetConfig } from '../../config';
import type { DownloadedArtifact } from '../../delivery/types';

describe('receiver archive selection', () => {
  let dir: string;
  let db: Database;
  let artifact: DownloadedArtifact;
  let server: Server;
  let config: DeliveryConfig;
  let received: Array<{ route: string; body: string }>;
  let failNext: boolean;
  const target = (routes = ['telepost']): TargetConfig => ({
    id: 'novel', type: 'novel', tag: 'test', storageMode: 'cache',
    delivery: { target: routes[0], targets: routes },
  } as TargetConfig);

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'pixivflow-archive-delivery-'));
    db = new Database(join(dir, 'ledger.db'));
    db.migrate();
    const text = join(dir, 'novel.txt');
    const zip = join(dir, 'novel.zip');
    writeFileSync(text, '正文 [uploadedimage:11]');
    writeFileSync(zip, 'PK archive fixture');
    artifact = {
      pixivId: '123', type: 'novel', title: 'Novel',
      artifacts: [
        {id:'text',workId:'123',variant:'text',path:text},
        {id:'zip',workId:'123',variant:'zip',path:zip},
      ],
      cleanupFiles: [text, zip],
    };
    received = [];
    failNext = false;
    // Synthetic receiver with TelePost's archive admission rule. Exercise the
    // real multipart provider and durable worker, without a real submission.
    server = createServer(async (req, res) => {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(Buffer.from(chunk));
      const body = Buffer.concat(chunks).toString('utf8');
      received.push({route:req.url!,body});
      const blocked = req.url === '/telepost' && /filename="[^"]*\.zip"/i.test(body);
      const status = blocked ? 400 : failNext ? 503 : 201;
      failNext = false;
      res.writeHead(status, {'content-type':'application/json'});
      res.end(JSON.stringify(status === 201
        ? {data:{review_id:42,status:'pending_review'}}
        : {error:blocked ? 'blocked_file_type' : 'unavailable'}));
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${(server.address() as {port:number}).port}`;
    config = {targets:{
      telepost:{type:'httpMultipart',url:`${base}/telepost`,archiveDelivery:'local-only'},
      archive:{type:'httpMultipart',url:`${base}/archive`},
    }};
  });

  afterEach(async () => {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    db.close();
    rmSync(dir, {recursive:true,force:true});
  });

  function payloadFor(route: string) {
    const row = db.outbox.list(undefined, 20).find(row => row.deliveryTarget === route)!;
    return JSON.parse(row.payloadJson);
  }

  it('freezes TXT-only files, content and aligned previews without mutating local ZIP artifacts', () => {
    const previews = [join(dir, 'text-preview.jpg'), join(dir, 'zip-preview.jpg')];
    previews.forEach(path => writeFileSync(path, 'preview'));
    artifact.previewFiles = previews;
    new DeliveryService(db, config).enqueue(artifact, target(['telepost','archive']));
    expect(payloadFor('telepost').files).toEqual([artifact.artifacts![0].path]);
    expect(payloadFor('telepost').previewFiles).toEqual([previews[0]]);
    expect(JSON.stringify(payloadFor('telepost').content)).not.toContain('novel.zip');
    expect(payloadFor('archive').files).toEqual(artifact.artifacts!.map(item => item.path));
    expect(payloadFor('archive').previewFiles).toEqual(previews);
    expect(payloadFor('telepost').cleanupFiles).toContain(artifact.artifacts![1].path);
    expect(artifact.artifacts).toHaveLength(2);
    expect(existsSync(artifact.artifacts![1].path)).toBe(true);
  });

  it('does not require an excluded archive to exist', () => {
    rmSync(artifact.artifacts![1].path);
    expect(() => new DeliveryService(db, config).enqueue(artifact, target())).not.toThrow();
    expect(payloadFor('telepost').files).toEqual([artifact.artifacts![0].path]);
  });

  it('rejects ZIP-only output before creating an intent', () => {
    artifact.artifacts = [artifact.artifacts![1]];
    expect(() => new DeliveryService(db, config).enqueue(artifact, target())).toThrow('no deliverable artifacts');
    expect(db.outbox.list(undefined, 20)).toHaveLength(0);
    expect(existsSync(artifact.artifacts[0].path)).toBe(true);
  });

  it('retries the same durable TXT-only intent after restart', async () => {
    new DeliveryService(db, config).enqueue(artifact, target());
    const original = db.outbox.list(undefined, 20)[0];
    failNext = true;
    const worker = new OutboxWorker(db, new DeliveryDispatcher(config), {retryBaseMs:0,retryMaxMs:0});
    expect((await worker.drainOnce(1)).retried).toBe(1);
    const before = db.outbox.get(original.id)!;
    db.close();
    db = new Database(join(dir, 'ledger.db'));
    db.migrate();
    // A new dispatcher/config cannot change an already-frozen attachment set.
    config.targets!.telepost = {...config.targets!.telepost, archiveDelivery:'attach'} as typeof config.targets.telepost;
    const resumed = new OutboxWorker(db, new DeliveryDispatcher(config));
    expect((await resumed.drainOnce()).done).toBe(1);
    expect(db.outbox.get(original.id)!.payloadJson).toBe(before.payloadJson);
    expect(received).toHaveLength(2);
    for (const request of received) {
      expect(request.body).toContain('filename="novel.txt"');
      expect(request.body).not.toContain('filename="novel.zip"');
    }
  });

  it('keeps the ZIP for another route until that route has received it', async () => {
    new DeliveryService(db, config).enqueue(artifact, target(['telepost','archive']));
    const worker = new OutboxWorker(db, new DeliveryDispatcher(config), {batchSize:1});
    expect((await worker.drainOnce(1)).done).toBe(1);
    expect(received[0].route).toBe('/telepost');
    expect(existsSync(artifact.artifacts![1].path)).toBe(true);
    expect((await worker.drainOnce()).done).toBe(1);
    expect(received[1].route).toBe('/archive');
    expect(received[1].body).toContain('filename="novel.zip"');
    expect(existsSync(artifact.artifacts![1].path)).toBe(false);
  });

  it('retains shared files needed by a failed sibling for manual recovery', async () => {
    new DeliveryService(db, config).enqueue(artifact, target(['telepost','archive']));
    const sibling = db.outbox.list(undefined, 20).find(row => row.deliveryTarget === 'archive')!;
    db.deliveries.recordAck(sibling.deliveryId!, { status: 'failed', error: 'receiver unavailable' });
    const worker = new OutboxWorker(db, new DeliveryDispatcher(config), {batchSize:1});
    expect((await worker.drainOnce(1)).done).toBe(1);
    expect(existsSync(artifact.artifacts![0].path)).toBe(true);
    expect(existsSync(artifact.artifacts![1].path)).toBe(true);
  });
});
