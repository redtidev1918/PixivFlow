// Invoked by verify-telepost-contract.py against the actual TelePost HTTP app.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { Database } = require('../dist/storage/Database');
const { DeliveryService } = require('../dist/delivery/DeliveryService');
const { DeliveryDispatcher } = require('../dist/delivery/DeliveryDispatcher');
const { OutboxWorker } = require('../dist/delivery/OutboxWorker');
const { HttpMultipartDelivery } = require('../dist/delivery/HttpMultipartDelivery');
const { NovelDownloader } = require('../dist/download/NovelDownloader');

async function main() {
  const [url, directory] = process.argv.slice(2);
  const config = { targets: { telepost: { type: 'httpMultipart', url, archiveDelivery: 'local-only',
    fields: { tags: '{{topicTag}},{{workTags}}', title: '{{displayTitle}}', work_id: '{{workId}}',
      work_type: '{{type}}', target_id: '{{targetId}}' } } } };
  const file = (name, bytes = 'synthetic fixture') => {
    const result = path.join(directory, name);
    fs.writeFileSync(result, bytes);
    return result;
  };
  const rawText = 'before [pixivimage:99] between [pixivimage:99] after';
  const client = {
    getNovelDetailWithTags: async () => ({ novel: { id: 123, title: '中文测试',
      create_date: '2026-10-27T00:00:00Z', user: { name: 'Fixture' } }, tags: [{ name: 'test' }] }),
    getNovelText: async () => ({ novel_text: rawText,
      illusts: { '99': { illust: { images: { original: 'https://i.pximg.net/99.jpg' } } } } }),
  };
  const downloader = new NovelDownloader(client, { insertDownload() {} }, {
    sanitizeFileName: name => name,
    saveText: async (text, name) => file(name, text),
    saveMetadata: async () => file('metadata.json', '{}'),
  }, undefined, undefined, { mode: 'on-demand' });
  const novel = await downloader.download({ id: 123 }, 'test', { type: 'novel', detectLanguage: false });
  assert.equal(novel.mediaAssets.length, 1, 'repeated text markers leaked into canonical asset set');
  const markdown = novel.artifacts.find(a => a.variant === 'markdown');
  assert.equal((fs.readFileSync(markdown.path, 'utf8').match(/!\[\]/g) || []).length, 2);
  // Simulate a durable intent frozen by the old producer. Normalization on
  // transport also allows safe recovery without rewriting old SQLite payloads.
  novel.mediaAssets.push({ ...novel.mediaAssets[0] });
  const album = { pixivId: '456', type: 'illustration', title: '12-page fixture',
    artifacts: Array.from({ length: 12 }, (_, i) => ({ id: `page-${i}`, workId: '456', variant: 'original', path: file(`page-${i}.jpg`) })),
    mediaAssets: Array.from({ length: 12 }, (_, i) => ({ id: `pixiv:456:illust:page-${i}`, source: 'pixiv', kind: 'image', sourceUrl: `https://i.pximg.net/${i}.jpg` })),
  };
  const plain = { pixivId: '789', type: 'novel', title: 'Plain fixture',
    artifacts: [{ id: 'plain', workId: '789', variant: 'text', path: file('plain.txt') }] };
  const dbPath = path.join(directory, 'producer.db');
  let db = new Database(dbPath); db.migrate();
  const service = new DeliveryService(db, config);
  for (const artifact of [novel, album, plain]) {
    service.enqueue(artifact, { id: `fixture-${artifact.pixivId}`, type: artifact.type, storageMode: 'cache', topic: 'test', delivery: { target: 'telepost' } });
  }
  const before = db.outbox.list(undefined, 20).map(row => row.payloadJson).sort();
  const originalFetch = global.fetch;
  let loseResponse = true;
  global.fetch = async (...args) => {
    const response = await originalFetch(...args);
    if (loseResponse) { loseResponse = false; await response.text(); throw new Error('network connection response lost'); }
    return response;
  };
  try {
    const worker = new OutboxWorker(db, new DeliveryDispatcher(config), { batchSize: 1, retryBaseMs: 0, retryMaxMs: 0 });
    assert.equal((await worker.drainOnce(1)).retried, 1);
    db.close(); db = new Database(dbPath); db.migrate();
    const resumed = new OutboxWorker(db, new DeliveryDispatcher(config));
    assert.equal((await resumed.drainOnce()).done, 3);
    assert.deepEqual(db.outbox.list(undefined, 20).map(row => row.payloadJson).sort(), before);
    assert.equal(db.deliveries.countByStatusForTarget('telepost').delivered, 3);
    const provider = new HttpMultipartDelivery(config.targets.telepost);
    const request = { files: [file('blocked.zip')], context: { title: 'fixture', pixivId: '900', type: 'novel', topic: 'test', idempotencyKey: 'blocked' } };
    const blocked = await provider.deliver(request);
    assert.equal(blocked.status, 400);
    assert.equal(blocked.ack.kind, 'permanent_failure');
    assert.match(blocked.ack.error, /code=blocked_file_type/);
    const form = new FormData();
    form.append('files', new Blob(['fixture']), 'raw.txt');
    form.append('tags', 'test');
    const asset = { asset_id: 'pixiv:900:pixivimage:99', kind: 'image', source_url: 'https://i.pximg.net/99.jpg' };
    form.append('media_assets', JSON.stringify([asset, asset]));
    const rejected = await originalFetch(url, { method: 'POST', body: form });
    assert.equal(rejected.status, 400);
    assert.equal((await rejected.json()).error.code, 'invalid_media_asset');
    console.log('VERIFIED: novel markers -> assets -> SQLite outbox -> multipart -> TelePost; ACK-loss/restart and 12-page illustration');
  } finally { global.fetch = originalFetch; db.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
