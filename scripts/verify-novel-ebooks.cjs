// Explicit integration gate: requires a build, Java/EPUBCheck, optional Chromium
// and Python with pypdf. Missing prerequisites FAIL; this is never a skipped test.
const { promises: fs } = require('node:fs');
const { join, resolve } = require('node:path');
const { tmpdir } = require('node:os');
const { deflateSync } = require('node:zlib');
const { execFileSync } = require('node:child_process');
const assert = require('node:assert/strict');
const { exportSavedNovel } = require('../dist/download/novel-export/NovelExportService');
const { buildMediaAsset } = require('../dist/domain/media/MediaAsset');

function chunk(type, data) {
  const bytes = Buffer.concat([Buffer.from(type), data]); let crc = 0xffffffff;
  for (const byte of bytes) { crc ^= byte; for (let k = 0; k < 8; k++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); }
  const size = Buffer.alloc(4); size.writeUInt32BE(data.length);
  const tail = Buffer.alloc(4); tail.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
  return Buffer.concat([size, bytes, tail]);
}
function fixturePng() {
  const width = 600, height = 400; const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 2;
  const raster = Buffer.alloc(height * (width * 3 + 1));
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const p = y * (width * 3 + 1) + 1 + x * 3;
    raster[p] = 30 + Math.floor(x / 3); raster[p + 1] = 60 + Math.floor(y / 3); raster[p + 2] = 160;
  }
  return Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), chunk('IHDR', header), chunk('IDAT', deflateSync(raster)), chunk('IEND', Buffer.alloc(0))]);
}

(async () => {
  assert(process.env.EPUBCHECK_JAR, 'EPUBCHECK_JAR is required');
  assert(process.env.PIXIVFLOW_PDF_BROWSER, 'PIXIVFLOW_PDF_BROWSER is required');
  const directory = process.argv[2] ? resolve(process.argv[2]) : await fs.mkdtemp(join(tmpdir(), 'pixiv-ebook-validation-'));
  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(join(directory, 'illustration.png'), fixturePng());
  for (const id of ['101', '102']) {
    const document = { version: 1, id, title: `第${id === '101' ? '一' : '二'}篇：中文与日本語`, author: '测试作者',
      sourceUrl: `https://www.pixiv.net/novel/show.php?id=${id}`, language: 'ja', publishedAt: '2026-01-02T00:00:00Z',
      tags: ['中文', '日本語'], series: { id: '42', title: '小说合订验证' },
      rawText: '[chapter:序章]中文段落，保留原文。\n日本語の文章。[[rb:漢字>かんじ]]と[[rb:東京>とうきょう]]。\n\n特殊字符 < & > " 😀。[[jumpuri:外部链接>https://example.com/a?x=1&y=2]]\n[uploadedimage:1][newpage][chapter:第二章]新的页面。[jump:1]\n' + '用于验证分页与字体的中文段落。日本語の文章と句読点。\n\n'.repeat(35),
      media: [{ asset: buildMediaAsset({ workId: id, kind: 'uploadedimage', sourceId: '1', marker: '[uploadedimage:1]', sourceUrl: 'https://i.pximg.net/fixture.png' }), localPath: 'illustration.png' },
        { asset: buildMediaAsset({ workId: id, kind: 'novelcover', sourceUrl: 'https://i.pximg.net/cover.png' }), localPath: 'illustration.png' }] };
    await fs.writeFile(join(directory, `${id}.txt.novel.json`), JSON.stringify({ novel_document: document }));
  }
  await fs.writeFile(join(directory, 'series-42.series.json'), JSON.stringify({ version: 1, seriesId: '42', title: '小说合订验证', orderedIds: ['102', '101'], metadataPaths: ['101.txt.novel.json', '102.txt.novel.json'] }));
  for (const file of ['101.txt.novel.json', 'series-42.series.json']) {
    const result = await exportSavedNovel(join(directory, file), { formats: ['epub', 'pdf'] });
    assert.deepEqual(result.errors, []);
    const epub = result.artifacts.find(a => a.variant === 'epub').path;
    execFileSync('java', ['-jar', process.env.EPUBCHECK_JAR, epub], { stdio: 'inherit', windowsHide: true, timeout: 120_000 });
    const pdf = result.artifacts.find(a => a.variant === 'pdf').path;
    execFileSync(process.env.PIXIVFLOW_PDF_PYTHON || 'python', [join(__dirname, 'verify-novel-pdf.py'), pdf], { stdio: 'inherit', windowsHide: true, timeout: 60_000, env: { ...process.env, PYTHONIOENCODING: 'utf-8' } });
  }
  console.log(`Validated EPUB and PDF fixtures: ${directory}`);
})().catch(error => { console.error(error); process.exitCode = 1; });
