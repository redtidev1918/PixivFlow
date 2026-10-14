// In-container gate for the Alpine production image (CI test.yml "full-image"
// job): exercises the shipped /app/dist build with the bundled Chromium and
// Noto CJK fonts. The scripts/ directory is volume-mounted read-only at
// /verify by CI; nothing here is copied into the image, and the image gains
// no test dependencies permanently (pypdf is installed into the throwaway
// container by the CI step that also runs this script).
const { promises: fs } = require('node:fs');
const { join, resolve } = require('node:path');
const { deflateSync } = require('node:zlib');
const assert = require('node:assert/strict');
const { exportSavedNovel } = require('/app/dist/download/novel-export/NovelExportService');
const { buildMediaAsset } = require('/app/dist/domain/media/MediaAsset');

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
  const directory = process.argv[2] ? resolve(process.argv[2]) : '/tmp/ebook';
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
  for (const [input, base] of [[join(directory, '101.txt.novel.json'), join(directory, 'single')], [join(directory, 'series-42.series.json'), join(directory, 'series')]]) {
    const result = await exportSavedNovel(input, { formats: ['epub', 'pdf'] }, base);
    assert.deepEqual(result.errors, []);
    const epub = await fs.readFile(`${base}.epub`);
    assert.equal(epub.readUInt32LE(0), 0x04034b50, 'EPUB is not a ZIP');
    assert.equal(epub.readUInt16LE(8), 0, 'mimetype entry must be stored uncompressed');
    assert.equal(epub.subarray(30, 38).toString(), 'mimetype');
    assert.equal(epub.subarray(38, 58).toString(), 'application/epub+zip');
    const pdf = await fs.readFile(`${base}.pdf`);
    assert.ok(pdf.subarray(0, 5).toString() === '%PDF-' && pdf.length > 10_000, 'PDF output missing or trivial');
    assert.ok(pdf.subarray(-64).toString('latin1').includes('%%EOF'), 'PDF trailer missing');
    // A successful export already proves the in-renderer CJK font check passed
    // (writePdf throws PDF_CJK_FONT_MISSING otherwise); deeper page/text/font
    // assertions run in the same container via scripts/verify-novel-pdf.py.
    console.log(`${base}: epub ${epub.length} bytes, pdf ${pdf.length} bytes`);
  }
  console.log(`Container ebook verification passed: ${directory}`);
})().catch(error => { console.error(error); process.exitCode = 1; });
