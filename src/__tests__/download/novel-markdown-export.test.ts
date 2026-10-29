import { promises as fs } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { NovelDocument, assembleSeries } from '../../download/novel-export/NovelDocument';
import { exportBook, exportSavedNovel, loadNovelDocument, validateNovelExport } from '../../download/novel-export/NovelExportService';
import { MARKDOWN_RENDERER_VERSION, renderMarkdownBook, writeMarkdownBook } from '../../download/novel-export/MarkdownExporter';
import { buildMediaAsset } from '../../domain/media/MediaAsset';
import { deliveryFilePaths } from '../../delivery/types';
import { findRichNovelSources } from '../../delivery/TelePressRichNovel';
import { novelExportArgs } from '../../commands/NovelExportCommand';

const run = promisify(execFile);
const project = resolve(__dirname, '../../..');
const hook = `const ts=require('typescript');require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(require('fs').readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,f);`;

/** Subprocess export (EPUB writing needs a native dynamic import; jest's VM cannot do it). */
async function exported(input: string, formats: string[], output?: string) {
  const script = hook + `require('./src/download/novel-export/NovelExportService.ts').exportSavedNovel(process.argv[1],{formats:JSON.parse(process.argv[2])},process.argv[3]).then(r=>process.stdout.write(JSON.stringify(r))).catch(e=>{console.error(e);process.exitCode=1})`;
  const result = await run(process.execPath, ['-e', script, input, JSON.stringify(formats), ...(output ? [output] : [])], { cwd: project, windowsHide: true, timeout: 20_000 });
  return JSON.parse(result.stdout);
}

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64');
const gif = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
const doc = (id = '123', text = '中文 日本語 [[rb:漢字>かんじ]]'): NovelDocument => ({
  version: 1, id, title: '标题 & <作品>', author: '作者', language: 'ja',
  sourceUrl: `https://www.pixiv.net/novel/show.php?id=${id}`,
  publishedAt: '2026-01-02T00:00:00Z', tags: ['中文', '日本語'], rawText: text, media: [],
});
let directory: string;

beforeEach(async () => { directory = await fs.mkdtemp(join(tmpdir(), 'pixiv novel md ')); });
afterEach(async () => { await fs.rm(directory, { recursive: true, force: true }); });

describe('formal Markdown export format', () => {
  it('exports a pure-text novel to Markdown without requiring any image', async () => {
    const d = doc('123', '第一段\r\n第二行\n\n第二段');
    const result = await exportBook({ id: d.id, title: d.title, documents: [d] }, new Map([[d.id, directory]]), join(directory, 'novel'), { formats: ['md'] });
    expect(result.errors).toEqual([]);
    expect(result.warnings ?? []).toEqual([]);
    expect(result.artifacts).toHaveLength(1);
    const artifact = result.artifacts[0];
    expect(artifact.variant).toBe('markdown-export');
    expect(artifact.mimeType).toBe('text/markdown');
    expect(artifact.path.endsWith('.novel.md')).toBe(true);
    const content = await fs.readFile(artifact.path, 'utf-8');
    expect(content).toContain('# 标题 \\& \\<作品\\>');
    expect(content).toContain('- Author: 作者');
    expect(content).toContain('- Source: <https://www.pixiv.net/novel/show.php?id=123>');
    expect(content).toContain('- Published: 2026-01-02T00:00:00Z');
    expect(content).toContain('- Tags: 中文, 日本語');
    // CRLF normalized, hard line break keeps Pixiv verse lines, blank line splits paragraphs.
    expect(content).toContain('第一段\\\n第二行');
    expect(content).toContain('第一段\\\n第二行\n\n第二段');
    expect(content.endsWith('\n')).toBe(true);
    // No images directory is fabricated for an image-less novel.
    await expect(fs.access(join(directory, 'images'))).rejects.toThrow();
  });

  it('never collides with the rich-media sidecar path and is not delivered to Telegram', async () => {
    const d = doc('123', '正文');
    const sidecar = join(directory, '123_标题.md');
    await fs.writeFile(sidecar, 'sidecar bytes');
    const result = await exportBook({ id: d.id, title: d.title, documents: [d] }, new Map([[d.id, directory]]), join(directory, '123_标题'), { formats: ['md'] });
    expect(result.errors).toEqual([]);
    expect(await fs.readFile(sidecar, 'utf-8')).toBe('sidecar bytes');
    const files = deliveryFilePaths({
      pixivId: '123', type: 'novel', title: d.title,
      artifacts: [
        ...result.artifacts,
        { id: 'txt', workId: '123', variant: 'text', path: 'original.txt' },
        { id: 'zip', workId: '123', variant: 'zip', path: 'original.zip' },
      ],
    });
    expect(files).toEqual(['original.txt', 'original.zip']);
  });

  it('keeps TelePress on the rich-media sidecar when a formal export artifact exists', async () => {
    const txtPath = join(directory, '123_标题.txt');
    const mdSidecar = join(directory, '123_标题.md');
    await fs.writeFile(txtPath, 'txt body');
    await fs.writeFile(mdSidecar, 'sidecar body');
    await fs.mkdir(join(directory, 'images'));
    await fs.writeFile(join(directory, 'images', 'a.png'), png);
    const sources = findRichNovelSources({
      pixivId: '123', type: 'novel', title: '标题',
      artifacts: [
        { id: 'export', workId: '123', variant: 'markdown-export', path: join(directory, '123_标题.novel.md') },
        { id: 'text', workId: '123', variant: 'text', path: txtPath },
        { id: 'md', workId: '123', variant: 'markdown', path: mdSidecar },
      ],
    });
    expect(sources?.mdPath).toBe(mdSidecar);
    expect(sources?.imagePaths).toEqual([join(directory, 'images', 'a.png')]);
  });

  it('converts every Pixiv marker with escaping, anchors and traceable fallbacks', () => {
    const d = doc('1', [
      '<script>x</script> & *em* `code` [br]',
      '1. list start',
      '- dash start',
      '#no-space heading is text',
      '>引用行',
      '---',
      '[chapter:章 <一>]',
      '章内正文',
      '[newpage]',
      '第二页',
      '[[jumpuri:外部 > https://example.com/a?x=1&y=2]]',
      '[[rb:漢字>かんじ]]',
      '[jump:2]',
      '[jump:9]',
      '[chapter:]',
    ].join('\n'));
    const content = renderMarkdownBook({ id: '1', title: d.title, documents: [d] }, () => undefined);
    expect(content).toContain('\\<script\\>x\\</script\\> \\& \\*em\\* \\`code\\` \\[br\\]');
    expect(content).toContain('\\1. list start');
    expect(content).toContain('\\- dash start');
    expect(content).toContain('#no-space heading is text');
    expect(content).toContain('\\---');
    expect(content).toContain('<a id="chapter-1"></a>');
    expect(content).toContain('## 章 \\<一\\>');
    expect(content).toContain('<a id="page-2"></a>');
    expect(content).toContain('第二页');
    expect(content).toContain('[外部](<https://example.com/a?x=1&y=2>)');
    expect(content).toContain('<ruby>漢字<rp>(</rp><rt>かんじ</rt><rp>)</rp></ruby>');
    expect(content).toContain('[→ 2](#page-2)');
    // Out-of-range jump and empty chapter stay traceable instead of vanishing.
    expect(content).toContain('\\[jump:9\\]');
    expect(content).toContain('<!-- pixiv marker: [chapter:] -->');
    // A `---` body line never turns the previous verse line into a setext heading.
    expect(content).not.toMatch(/\\\n---/);
  });
});

describe('inline images', () => {
  it('references downloaded images in place, keeps every occurrence and preserves order', async () => {
    await fs.mkdir(join(directory, 'images'));
    await fs.writeFile(join(directory, 'images', 'a.png'), png);
    const d = doc('1', '前文\n[uploadedimage:1]\n中文\n[uploadedimage:1]\n后文');
    d.media = [{ asset: buildMediaAsset({ workId: '1', kind: 'uploadedimage', sourceId: '1', marker: '[uploadedimage:1]', sourceUrl: 'https://i.pximg.net/a.png' }), localPath: 'images/a.png' }];
    const export_ = await writeMarkdownBook({ id: '1', title: d.title, documents: [d] }, new Map([['1', directory]]), join(directory, 'book.novel.md'));
    expect(export_.warnings).toEqual([]);
    expect(export_.refs).toEqual([{ doc: '1', marker: '[uploadedimage:1]', ref: 'images/a.png' }]);
    const ref = `![\\[uploadedimage:1\\]](images/a.png)`;
    expect(export_.content.split(ref)).toHaveLength(3); // two occurrences
    // Text/image order follows the source (assert past the front matter; tags may repeat body words).
    const body = export_.content.slice(export_.content.indexOf('---'));
    expect(body.indexOf('前文')).toBeLessThan(body.indexOf('中文'));
    expect(body.indexOf('中文')).toBeLessThan(body.indexOf('后文'));
    // Single physical file, nothing copied.
    expect(await fs.readdir(join(directory, 'images'))).toEqual(['a.png']);
  });

  it('copies out-of-directory images once under a content-hash name', async () => {
    const chapterDir = join(directory, 'ch1');
    const outDir = join(directory, 'out');
    await fs.mkdir(chapterDir, { recursive: true });
    await fs.mkdir(outDir, { recursive: true });
    await fs.writeFile(join(chapterDir, 'illust.jpg'), png);
    await fs.writeFile(join(chapterDir, 'illust2.jpg'), gif);
    const d = doc('1', '[pixivimage:9-1][pixivimage:9-1][pixivimage:8]');
    d.media = [
      { asset: buildMediaAsset({ workId: '1', kind: 'pixivimage', sourceId: '9-1', marker: '[pixivimage:9-1]', sourceUrl: 'https://i.pximg.net/b.png' }), localPath: 'illust.jpg' },
      { asset: buildMediaAsset({ workId: '1', kind: 'pixivimage', sourceId: '8', marker: '[pixivimage:8]', sourceUrl: 'https://i.pximg.net/c.gif' }), localPath: 'illust2.jpg' },
    ];
    const export_ = await writeMarkdownBook({ id: '1', title: d.title, documents: [d] }, new Map([['1', chapterDir]]), join(outDir, 'book.novel.md'));
    expect(export_.warnings).toEqual([]);
    const files = await fs.readdir(join(outDir, 'images'));
    expect(files).toHaveLength(2);
    const pngHash = createHash('sha256').update(png).digest('hex');
    const gifHash = createHash('sha256').update(gif).digest('hex');
    expect(files.sort()).toEqual([`${gifHash}.gif`, `${pngHash}.png`].sort());
    expect(export_.content.split(`(images/${pngHash}.png)`)).toHaveLength(3); // repeated marker → repeated reference
    // The copy is byte-identical; source files are untouched.
    expect(await fs.readFile(join(outDir, 'images', `${pngHash}.png`))).toEqual(png);
    expect(await fs.readFile(join(chapterDir, 'illust.jpg'))).toEqual(png);
  });

  it('materializes missing images through the materializer once and records localPath', async () => {
    const d = doc('1', '[uploadedimage:7]');
    d.media = [{ asset: buildMediaAsset({ workId: '1', kind: 'uploadedimage', sourceId: '7', marker: '[uploadedimage:7]', sourceUrl: 'https://i.pximg.net/a.png' }) }];
    const materialize = jest.fn(async () => {
      const file = join(directory, 'images', '7.png');
      await fs.writeFile(file, png);
      return { id: 'a', workId: '1', variant: 'original' as const, path: file };
    });
    const export_ = await writeMarkdownBook({ id: '1', title: d.title, documents: [d] }, new Map([['1', directory]]), join(directory, 'book.novel.md'), { materialize });
    expect(materialize).toHaveBeenCalledTimes(1);
    expect(export_.warnings).toEqual([]);
    expect(export_.content).toContain('![\\[uploadedimage:7\\]](images/7.png)');
    expect(d.media[0].localPath).toBe(join('images', '7.png'));
  });

  it('keeps the body complete when images are missing, unsafe or unavailable', async () => {
    await fs.writeFile(join(directory, 'real.png'), png);
    const outsideDir = await fs.mkdtemp(join(tmpdir(), 'pixiv novel md outside '));
    try {
      await fs.writeFile(join(outsideDir, 'secret.png'), png);
      const d = doc('1', '开头\n[uploadedimage:1]\n中段\n[pixivimage:2]\n结尾\n[uploadedimage:3]\n[uploadedimage:4]\n[pixivimage:5]');
      d.media = [
        { asset: buildMediaAsset({ workId: '1', kind: 'uploadedimage', sourceId: '1', marker: '[uploadedimage:1]', sourceUrl: 'https://i.pximg.net/a.png' }) },
        { asset: buildMediaAsset({ workId: '1', kind: 'pixivimage', sourceId: '2', marker: '[pixivimage:2]', sourceUrl: 'https://i.pximg.net/b.png' }), localPath: join(outsideDir, 'secret.png') },
        { asset: buildMediaAsset({ workId: '1', kind: 'uploadedimage', sourceId: '3', marker: '[uploadedimage:3]', sourceUrl: 'https://i.pximg.net/c.png' }), localPath: 'missing.png' },
        { asset: buildMediaAsset({ workId: '1', kind: 'uploadedimage', sourceId: '4', marker: '[uploadedimage:4]', sourceUrl: 'https://i.pximg.net/d.png' }), localPath: 'real.png' },
      ];
      const dest = join(directory, 'book.novel.md');
      const export_ = await writeMarkdownBook({ id: '1', title: d.title, documents: [d] }, new Map([['1', directory]]), dest);
      expect(export_.warnings.map(w => w.split(':')[0]).sort()).toEqual(['NOVEL_IMAGE_FILE_MISSING', 'NOVEL_IMAGE_MISSING', 'NOVEL_IMAGE_UNSAFE', 'NOVEL_IMAGE_UNAVAILABLE'].sort());
      for (const marker of ['\\[uploadedimage:1\\]', '\\[pixivimage:2\\]', '\\[uploadedimage:3\\]', '\\[pixivimage:5\\]']) expect(export_.content).toContain(marker);
      expect(export_.content).toContain('开头');
      expect(export_.content).toContain('中段');
      expect(export_.content).toContain('结尾');
      expect(export_.content).toContain('![\\[uploadedimage:4\\]](images/');
      // Nothing escaped the destination directory.
      const outFiles = await fs.readdir(join(directory, 'images'));
      expect(outFiles.every(name => /^[0-9a-f]{64}\.(png|jpg|gif|webp|bmp)$/.test(name))).toBe(true);
      // The unsafe source file outside the root is untouched.
      expect(await fs.readFile(join(outsideDir, 'secret.png'))).toEqual(png);
    } finally {
      await fs.rm(outsideDir, { recursive: true, force: true });
    }
  });
});

describe('series', () => {
  const seriesDocs = (): NovelDocument[] => {
    const a = { ...doc('1', '[chapter:序章]第一章正文[newpage]后篇'), series: { id: '42', title: '系列' } };
    const b = { ...doc('2', '[chapter:序章]第二章正文'), series: { id: '42', title: '系列' } };
    return [a, b];
  };

  it('merges chapters in API order with a working table of contents', async () => {
    const docs = seriesDocs();
    const book = assembleSeries('42', '系列', ['2', '1'], [docs[1], docs[0]]);
    const result = await exportBook(book, new Map([['1', directory], ['2', directory]]), join(directory, 'series-42'), { formats: ['md'] });
    expect(result.errors).toEqual([]);
    const content = await fs.readFile(result.artifacts[0].path, 'utf-8');
    expect(content).toContain('# 系列');
    expect(content).toContain('- Chapters: 2');
    expect(content).toContain('## 目录 / Contents');
    expect(content).toContain('[1. 标题 \\& \\<作品\\>](#doc-0)');
    expect(content).toContain('[2. 标题 \\& \\<作品\\>](#doc-1)');
    // Duplicate chapter titles still get distinct anchors, all present in the body.
    const anchors = [...content.matchAll(/\(#(doc-\d-chapter-\d)\)/g)].map(m => m[1]);
    expect(new Set(anchors).size).toBe(anchors.length);
    for (const anchor of anchors) expect(content).toContain(`<a id="${anchor}"></a>`);
    expect(content).toContain('第一章正文');
    expect(content).toContain('第二章正文');
    expect(content).toContain('- Author: 作者');
    expect(content).toContain('## 1. 标题 \\& \\<作品\\>');
    // Merged per-document page anchors are namespaced (orderedIds ['2','1'] → doc 1 carries the newpage).
    expect(content).toContain('<a id="doc-1-page-2"></a>');
    expect(content.indexOf('第二章正文')).toBeLessThan(content.indexOf('第一章正文'));
  });

  it('exports per-chapter Markdown and a merged book alongside EPUB', async () => {
    // Subprocess: the EPUB writer needs a native dynamic import jest's VM cannot run.
    for (const d of seriesDocs()) {
      await fs.writeFile(join(directory, `${d.id}.txt.novel.json`), JSON.stringify({ novel_document: d }));
      const chapter = await exported(join(directory, `${d.id}.txt.novel.json`), ['md']);
      expect(chapter.errors).toEqual([]);
      expect(chapter.artifacts[0].path.endsWith(`${d.id}.novel.md`)).toBe(true);
    }
    await fs.writeFile(join(directory, 'series-42.series.json'), JSON.stringify({
      version: 1, seriesId: '42', title: '系列', orderedIds: ['2', '1'],
      metadataPaths: ['1.txt.novel.json', '2.txt.novel.json'],
    }));
    const both = await exported(join(directory, 'series-42.series.json'), ['md', 'epub']);
    expect(both.errors).toEqual([]);
    expect(both.artifacts.map((a: { variant: string }) => a.variant).sort()).toEqual(['epub', 'markdown-export']);
    const files = await fs.readdir(directory);
    expect(files).toContain('series-42.novel.md');
    const merged = await fs.readFile(join(directory, 'series-42.novel.md'), 'utf-8');
    expect(merged).toContain('## 目录 / Contents');
    expect(merged.indexOf('第二章正文')).toBeLessThan(merged.indexOf('第一章正文'));
  });
});

describe('offline re-export and idempotency', () => {
  it('re-exports saved metadata deterministically without network or login', async () => {
    const d = doc('77', '[chapter:章][[rb:漢字>かんじ]]');
    await fs.writeFile(join(directory, '77.txt'), `Title: t\n\n---\n\n${d.rawText}`);
    const input = join(directory, '77.txt.novel.json');
    await fs.writeFile(input, JSON.stringify({ novel_document: d }));
    const first = await exportSavedNovel(input, { formats: ['md'] });
    expect(first.errors).toEqual([]);
    const path = first.artifacts[0].path;
    const bytes = await fs.readFile(path);
    expect((await loadNovelDocument(input)).rawText).toBe(d.rawText);
    const mtime = (await fs.stat(path)).mtimeMs;
    const second = await exportSavedNovel(input, { formats: ['md'] });
    expect(second.errors).toEqual([]);
    // Identical fingerprint → cache skip, byte-for-byte stability.
    expect(await fs.readFile(path)).toEqual(bytes);
    expect((await fs.stat(path)).mtimeMs).toBe(mtime);
  });

  it('keeps TXT untouched and degrades non-pixiv image sources to warnings', async () => {
    const d = doc('5', '[uploadedimage:1]');
    const txt = join(directory, '5.txt');
    await fs.writeFile(txt, 'precious txt');
    d.media = [{ asset: buildMediaAsset({ workId: '5', kind: 'uploadedimage', sourceId: '1', marker: '[uploadedimage:1]', sourceUrl: 'https://evil.example/a.png' }) }];
    // No localPath + a materializer → the pximg-only URL gate fires as a warning, not an error.
    const result = await exportBook({ id: d.id, title: d.title, documents: [d] }, new Map([[d.id, directory]]), join(directory, '5'), { formats: ['md'] }, { materialize: jest.fn() });
    expect(result.errors).toEqual([]);
    expect(result.warnings?.[0]).toContain('NOVEL_IMAGE_URL_UNSAFE');
    expect(await fs.readFile(txt, 'utf-8')).toBe('precious txt');
    expect(MARKDOWN_RENDERER_VERSION).toBeGreaterThan(0);
  });
});

describe('format validation is one vocabulary across CLI, config and WebUI', () => {
  it('accepts md in every entry point', () => {
    expect(() => validateNovelExport({ formats: ['md'] })).not.toThrow();
    expect(() => validateNovelExport({ formats: ['md', 'epub', 'pdf', 'txt'] })).not.toThrow();
    expect(() => validateNovelExport({ formats: ['html'] })).toThrow('novelExport.formats must contain txt, md, epub or pdf');
    const args = novelExportArgs({ options: { formats: 'md,epub' }, positional: [] } as never);
    expect(args.formats).toEqual(['md', 'epub']);
  });
});

describe('download integration', () => {
  it('produces TXT + formal Markdown (and sidecar unchanged) in one real download run', async () => {
    const script = hook + `
      const {NovelDownloader}=require('./src/download/NovelDownloader.ts');
      const {FileService}=require('./src/download/FileService.ts');
      const path=require('path'); const fs=require('fs');
      const root=process.argv[1];
      const png=Buffer.from('${png.toString('base64')}','base64');
      const detail={id:123,title:'Test Novel',user:{id:'1',name:'Author'},create_date:'2026-01-01'};
      const client={
        getNovelDetailWithTags:async()=>({novel:detail,tags:[]}),
        getNovelText:async()=>({novel_text:'[chapter:Opening]body line[[rb:漢字>かんじ]][uploadedimage:11]', images:{'11':{urls:{original:'https://i.pximg.net/novel/11.png'}}}}),
        downloadImage:async(url)=>{ if(!url.startsWith('https://i.pximg.net/')) throw new Error('bad url'); return png.buffer.slice(png.byteOffset,png.byteOffset+png.byteLength); },
      };
      const files=new FileService({downloadDirectory:root,novelDirectory:root,databasePath:path.join(root,'data','test.db')});
      const db={insertDownload:()=>{}};
      new NovelDownloader(client,db,files).download(detail,'test',{type:'novel',detectLanguage:false,novelExport:{formats:['md']}}).then(a=>{
        fs.writeFileSync(path.join(root,'result.json'),JSON.stringify({a}));
      }).catch(e=>{console.error(e);process.exitCode=1});`;
    await run(process.execPath, ['-e', script, directory], { cwd: project, windowsHide: true, timeout: 20_000 });
    const { a } = JSON.parse(await fs.readFile(join(directory, 'result.json'), 'utf-8'));
    const variants = a.artifacts.map((x: { variant: string }) => x.variant);
    expect(variants).toContain('text');
    expect(variants).toContain('markdown');        // rich-media sidecar (TelePress input)
    expect(variants).toContain('markdown-export'); // formal reader export
    const formal = a.artifacts.find((x: { variant: string }) => x.variant === 'markdown-export').path as string;
    const sidecar = a.artifacts.find((x: { variant: string }) => x.variant === 'markdown').path as string;
    expect(formal.endsWith('.novel.md')).toBe(true);
    expect(sidecar.endsWith('.md')).toBe(true);
    expect(sidecar).not.toBe(formal);
    const md = await fs.readFile(formal, 'utf-8');
    expect(md).toContain('## Opening');
    expect(md).toContain('<ruby>漢字<rp>(</rp><rt>かんじ</rt><rp>)</rp></ruby>');
    expect(md).toMatch(/!\[\\\[uploadedimage:11\\\]\]\(images\/.+\.(png|jpg)\)/);
    const sidecarBytes = await fs.readFile(sidecar, 'utf-8');
    expect(sidecarBytes).toContain('[chapter:Opening]'); // raw markers preserved for TelePress
    // TXT intact and first-class for delivery (rich-media ZIP ships with it; the .novel.md never does).
    const txt = a.artifacts.find((x: { variant: string }) => x.variant === 'text').path as string;
    expect(await fs.readFile(txt, 'utf-8')).toContain('[chapter:Opening]');
    expect(deliveryFilePaths(a)).toEqual([txt, a.artifacts.find((x: { variant: string }) => x.variant === 'zip').path]);
    // TelePress still resolves the sidecar, not the formal export.
    expect(findRichNovelSources(a)?.mdPath).toBe(sidecar);
  });
});
