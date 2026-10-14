import { promises as fs } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { inflateRawSync } from 'node:zlib';
import { parseNovel, assembleSeries, NovelDocument } from '../../download/novel-export/NovelDocument';
import { renderNovel, xml } from '../../download/novel-export/NovelHtmlRenderer';
import { assertPixivImageUrl, containedPath, exportBook, loadNovelDocument, prepareImages, validateNovelExport } from '../../download/novel-export/NovelExportService';
import { buildMediaAsset } from '../../domain/media/MediaAsset';
import { deliveryFilePaths } from '../../delivery/types';
import { NovelExportCommand } from '../../commands/NovelExportCommand';

const run = promisify(execFile);
const project = resolve(__dirname, '../../..');
const hook = `const ts=require('typescript');require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(require('fs').readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,f);`;
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64');
const doc = (id = '123', text = '中文 日本語 [[rb:漢字>かんじ]]'): NovelDocument => ({ version: 1, id, title: '标题 & <作品>', author: '作者', language: 'ja', sourceUrl: `https://www.pixiv.net/novel/show.php?id=${id}`, publishedAt: '2026-01-02T00:00:00Z', tags: ['中文', '日本語'], rawText: text, media: [] });
let directory: string;

beforeEach(async () => { directory = await fs.mkdtemp(join(tmpdir(), 'pixiv ebook ')); });
afterEach(async () => { await fs.rm(directory, { recursive: true, force: true }); });

function unzip(bytes: Buffer): Map<string, Buffer> {
  const end = bytes.length - 22;
  expect(bytes.readUInt32LE(end)).toBe(0x06054b50);
  let offset = bytes.readUInt32LE(end + 16);
  const files = new Map<string, Buffer>();
  for (let i = 0; i < bytes.readUInt16LE(end + 10); i++) {
    expect(bytes.readUInt32LE(offset)).toBe(0x02014b50);
    const method = bytes.readUInt16LE(offset + 10);
    const length = bytes.readUInt32LE(offset + 20);
    const nameLength = bytes.readUInt16LE(offset + 28);
    const extra = bytes.readUInt16LE(offset + 30);
    const comment = bytes.readUInt16LE(offset + 32);
    const local = bytes.readUInt32LE(offset + 42);
    const start = local + 30 + bytes.readUInt16LE(local + 26) + bytes.readUInt16LE(local + 28);
    const compressed = bytes.subarray(start, start + length);
    files.set(bytes.subarray(offset + 46, offset + 46 + nameLength).toString(), method === 8 ? inflateRawSync(compressed) : compressed);
    offset += 46 + nameLength + extra + comment;
  }
  return files;
}

async function exported(input: string, formats = ['epub'], output?: string) {
  const script = hook + `require('./src/download/novel-export/NovelExportService.ts').exportSavedNovel(process.argv[1],{formats:JSON.parse(process.argv[2])},process.argv[3]).then(r=>process.stdout.write(JSON.stringify(r))).catch(e=>{console.error(e);process.exitCode=1})`;
  const result = await run(process.execPath, ['-e', script, input, JSON.stringify(formats), ...(output ? [output] : [])], { cwd: project, windowsHide: true, timeout: 20_000 });
  return JSON.parse(result.stdout);
}

it('parses every marker, preserves double brackets, escapes text and prevents executable links', () => {
  const d = doc('1', '<script>x</script> &\n行\n\n段落[chapter:章 <一>][newpage][[rb:漢字>かんじ]][[jumpuri:外部>https://example.com/a?x=1&y=2]][jump:2][uploadedimage:1][pixivimage:22-1][[jumpuri:bad>javascript:alert(1)]]');
  expect(parseNovel(d.rawText).map(n => n.type)).toEqual(['text', 'chapter', 'newpage', 'ruby', 'link', 'jump', 'image', 'image', 'text']);
  const rendered = renderNovel(d, 'w0', () => 'images/local.png');
  expect(rendered.body).toContain('&lt;script&gt;');
  expect(rendered.body).not.toContain('<script>');
  expect(rendered.body).toContain('<ruby>漢字<rp>(</rp><rt>かんじ</rt>');
  expect(rendered.body).toContain('href="#w0-page-2"');
  expect(rendered.body).toContain('x=1&amp;y=2');
  expect(rendered.body).not.toContain('href="javascript:');
  expect(rendered.headings).toEqual([{ id: 'w0-chapter-1', title: '章 <一>' }]);
  expect(xml('😀\u0000\ud800')).toBe('😀��');
  expect(renderNovel(doc('1', '[jump:9]'), 'w0', () => '').body).not.toContain('href=');
});

it('enforces series identity, API ordering and missing chapter reporting', () => {
  const a = { ...doc('1'), series: { id: '42', title: '系列' } };
  const b = { ...doc('2'), series: { id: '42', title: '系列' } };
  expect(assembleSeries('42', '系列', ['2', '1'], [a, b]).documents.map(d => d.id)).toEqual(['2', '1']);
  expect(() => assembleSeries('42', '系列', ['1', '2'], [a])).toThrow('missing chapters 2');
  expect(() => assembleSeries('43', '系列', ['1'], [a])).toThrow('MISMATCH');
  expect(() => assembleSeries('42', '系列', ['1', '1'], [a])).toThrow('duplicate');
});

it('writes a real EPUB 3 container with uncompressed first mimetype, nested navigation, ruby and local image references', async () => {
  await fs.writeFile(join(directory, 'image.png'), png);
  const d = doc('123', '[chapter:第一章]正文[newpage][[rb:日本>にほん]][uploadedimage:1][uploadedimage:1]');
  d.media = [{ asset: buildMediaAsset({ workId: d.id, kind: 'uploadedimage', sourceId: '1', marker: '[uploadedimage:1]', sourceUrl: 'https://i.pximg.net/a.png' }), localPath: 'image.png' },
    { asset: buildMediaAsset({ workId: d.id, kind: 'novelcover', sourceUrl: 'https://i.pximg.net/cover.png' }), localPath: 'image.png' }];
  const input = join(directory, 'novel.txt.novel.json');
  await fs.writeFile(input, JSON.stringify({ novel_document: d }));
  const result = await exported(input);
  expect(result.errors).toEqual([]);
  expect(result.artifacts[0].variant).toBe('epub');
  const bytes = await fs.readFile(result.artifacts[0].path);
  expect(bytes.readUInt16LE(8)).toBe(0);
  expect(bytes.subarray(30, 38).toString()).toBe('mimetype');
  const files = unzip(bytes);
  expect(files.get('mimetype')?.toString()).toBe('application/epub+zip');
  expect(files.get('META-INF/container.xml')?.toString()).toContain('EPUB/package.opf');
  const opf = files.get('EPUB/package.opf')!.toString();
  expect(opf).toContain('version="3.0"'); expect(opf).toContain('properties="cover-image"');
  expect(opf).toContain('<dc:language>ja</dc:language>'); expect(opf).toContain('<dc:creator>作者</dc:creator>');
  for (const match of opf.matchAll(/href="([^"]+)"/g)) expect(files.has(`EPUB/${match[1]}`)).toBe(true);
  const body = files.get('EPUB/work-0.xhtml')!.toString();
  expect(body).toContain('<rt>にほん</rt>'); expect(body).toContain('class="page-break"');
  for (const match of body.matchAll(/src="([^"]+)"/g)) expect(files.get(`EPUB/${match[1]}`)).toEqual(png);
  expect(body).not.toContain('src="https:');
  expect(files.get('EPUB/nav.xhtml')!.toString()).toContain('<ol><li><a href="work-0.xhtml#w0-chapter-1">第一章');
  expect([...files.keys()].filter(n => n.startsWith('EPUB/images/'))).toHaveLength(1);
  const before = (await fs.stat(result.artifacts[0].path)).mtimeMs;
  expect((await exported(input)).errors).toEqual([]);
  expect((await fs.stat(result.artifacts[0].path)).mtimeMs).toBe(before);
  expect(deliveryFilePaths({ pixivId: '123', type: 'novel', title: d.title, artifacts: [...result.artifacts, { id: 'txt', workId: '123', variant: 'text', path: 'original.txt' }] })).toEqual(['original.txt']);
});

it('exports a series in manifest order rather than filename order', async () => {
  for (const id of ['2', '1']) await fs.writeFile(join(directory, `${id}.json`), JSON.stringify({ novel_document: { ...doc(id, `[chapter:内部${id}]正文${id}`), series: { id: '8', title: '合订' } } }));
  const input = join(directory, 'series-8.series.json');
  await fs.writeFile(input, JSON.stringify({ version: 1, seriesId: '8', title: '合订', orderedIds: ['2', '1'], metadataPaths: ['1.json', '2.json'] }));
  const result = await exported(input);
  expect(result.errors).toEqual([]);
  const files = unzip(await fs.readFile(result.artifacts[0].path));
  expect(files.get('EPUB/work-0.xhtml')!.toString()).toContain('正文2');
  expect(files.get('EPUB/work-1.xhtml')!.toString()).toContain('正文1');
  expect(files.get('EPUB/nav.xhtml')!.toString()).toContain('内部2');
});

it('reports missing images and browser explicitly and preserves an existing output on failure', async () => {
  const d = doc('123', '[uploadedimage:missing]');
  const dest = join(directory, 'book');
  await fs.writeFile(`${dest}.epub`, 'previous good file');
  const result = await exportBook({ id: d.id, title: d.title, documents: [d] }, new Map([[d.id, directory]]), dest, { formats: ['epub'] });
  expect(result.errors[0].message).toContain('NOVEL_IMAGE_MISSING');
  expect(await fs.readFile(`${dest}.epub`, 'utf8')).toBe('previous good file');
  const plain = doc();
  const pdf = await exportBook({ id: plain.id, title: plain.title, documents: [plain] }, new Map([[plain.id, directory]]), dest, { formats: ['pdf'], pdf: { browserPath: join(directory, 'nonexistent') } });
  expect(pdf.errors[0].message).toContain('PDF_BROWSER_MISSING');
  expect((await fs.readdir(directory)).filter(f => /\.tmp$|\.lock$/.test(f))).toEqual([]);
});

it('rejects concurrent exports without stealing a lock', async () => {
  const d = doc(); const base = join(directory, 'book');
  await fs.writeFile(`${base}.epub.lock`, 'another process');
  const result = await exportBook({ id: d.id, title: d.title, documents: [d] }, new Map([[d.id, directory]]), base, { formats: ['epub'] });
  expect(result.errors[0].code).toBe('NOVEL_EXPORT_BUSY');
  expect(await fs.readFile(`${base}.epub.lock`, 'utf8')).toBe('another process');
});

it('coalesces repeated image references through the existing materializer and reports download failure', async () => {
  const d = doc('1', '[uploadedimage:1][uploadedimage:1]');
  d.media = [{ asset: buildMediaAsset({ workId: '1', kind: 'uploadedimage', sourceId: '1', marker: '[uploadedimage:1]', sourceUrl: 'https://i.pximg.net/a.png' }) }];
  const materialize = jest.fn(async () => { const file = join(directory, 'image.png'); await fs.writeFile(file, png); return { id: '1', workId: '1', variant: 'original' as const, path: file }; });
  const book = { id: '1', title: d.title, documents: [d] };
  expect(await prepareImages(book, new Map([['1', directory]]), { materialize })).toHaveLength(1);
  expect(materialize).toHaveBeenCalledTimes(1);
  expect(materialize.mock.calls[0]).toBeDefined();
  d.media[0].localPath = undefined;
  await expect(prepareImages(book, new Map([['1', directory]]), { materialize: jest.fn().mockRejectedValue(new Error('image download failed')) })).rejects.toThrow('image download failed');
});

it('blocks unsafe paths, URLs, image payloads, oversized text and invalid configuration', async () => {
  await expect(containedPath(directory, resolve(__filename))).rejects.toThrow('NOVEL_PATH_UNSAFE');
  for (const url of ['http://i.pximg.net/a', 'https://127.0.0.1/a', 'https://i.pximg.net.evil/a', 'file:///a', 'https://user@i.pximg.net/a']) expect(() => assertPixivImageUrl(url)).toThrow();
  expect(() => validateNovelExport({ formats: ['html'] })).toThrow();
  expect(() => validateNovelExport({ pdf: { timeoutMs: Infinity } })).toThrow();
  expect(() => parseNovel('a'.repeat(8 * 1024 * 1024 + 1))).toThrow('NOVEL_TEXT_LIMIT');
  const d = doc('1', '[uploadedimage:1]');
  await fs.writeFile(join(directory, 'fake.png'), '<script>alert(1)</script>');
  d.media = [{ asset: buildMediaAsset({ workId: '1', kind: 'uploadedimage', sourceId: '1', marker: '[uploadedimage:1]', sourceUrl: 'https://i.pximg.net/a.png' }), localPath: 'fake.png' }];
  await expect(prepareImages({ id: '1', title: d.title, documents: [d] }, new Map([['1', directory]]))).rejects.toThrow('NOVEL_IMAGE_TYPE');
});

it('imports legacy TXT raw markers with metadata without stripping ruby', async () => {
  const file = join(directory, '1.txt');
  await fs.writeFile(file, 'Title: Old\n\n---\n\n[[rb:漢字>かんじ]]');
  await fs.writeFile(`${file}.json`, JSON.stringify({ pixiv_id: 1, type: 'novel', title: 'Old', author: { name: 'A' }, original_url: 'https://www.pixiv.net/novel/show.php?id=1', tags: [] }));
  expect((await loadNovelDocument(`${file}.json`)).rawText).toBe('[[rb:漢字>かんじ]]');
  const result = await exported(file);
  expect(result.errors).toEqual([]);
  expect(unzip(await fs.readFile(result.artifacts[0].path)).get('EPUB/work-0.xhtml')!.toString()).toContain('<rt>かんじ</rt>');
});

it('exposes an offline CLI with visible failures', async () => {
  const command = new NovelExportCommand();
  expect(command.requiresToken).toBe(false); expect(command.metadata.rendersResult).toBe(true);
  const result = await command.execute({} as never, { options: { input: join(directory, 'missing.json') }, positional: [] } as never);
  expect(result.success).toBe(false); expect(result.message).toBeTruthy(); expect(result.error).toBeTruthy();
});

it('integrates real file persistence with download export and isolates optional PDF failures', async () => {
  const script = hook + `
    const {NovelDownloader}=require('./src/download/NovelDownloader.ts');
    const {FileService}=require('./src/download/FileService.ts');
    const path=require('path'); const fs=require('fs');
    const root=process.argv[1];
    const detail={id:123,title:'Test',user:{id:'1',name:'Author'},create_date:'2026-01-01',series:{id:42,title:'Series'}};
    const client={getNovelDetailWithTags:async()=>({novel:detail,tags:[]}),getNovelText:async()=>({novel_text:'[chapter:章][[rb:漢字>かんじ]]'})};
    const files=new FileService({downloadDirectory:root,novelDirectory:root,databasePath:path.join(root,'data','test.db')});
    let saved=false;const db={insertDownload:()=>{saved=true}};
    new NovelDownloader(client,db,files).download(detail,'test',{type:'novel',detectLanguage:false,novelExport:{formats:['epub','pdf'],pdf:{browserPath:path.join(root,'missing-browser')}}}).then(a=>{
      const metadata=JSON.parse(fs.readFileSync(a.artifacts.find(x=>x.variant==='metadata').path));
      fs.writeFileSync(path.join(root,'result.json'),JSON.stringify({a,metadata,saved}));
    }).catch(e=>{console.error(e);process.exitCode=1});`;
  await run(process.execPath, ['-e', script, directory], { cwd: project, windowsHide: true, timeout: 20_000 });
  const { a, metadata, saved } = JSON.parse(await fs.readFile(join(directory, 'result.json'), 'utf8'));
  expect(saved).toBe(true);
  expect(metadata.export_errors[0].code).toBe('PDF_BROWSER_MISSING');
  expect(metadata.novel_document.series.id).toBe('42');
  const txt = a.artifacts.find((v: { variant: string }) => v.variant === 'text').path;
  expect(await fs.readFile(txt, 'utf8')).toContain('[[rb:漢字>かんじ]]');
  const snapshot = a.artifacts.find((v: { variant: string }) => v.variant === 'novel-document').path;
  expect((await loadNovelDocument(snapshot)).rawText).toContain('[chapter:章]');
  expect((await exported(txt)).errors).toEqual([]);
  expect(deliveryFilePaths(a)).toEqual([txt]);
});
