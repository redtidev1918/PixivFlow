import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { promisify } from 'node:util';
import { inflateRawSync } from 'node:zlib';
import ts from 'typescript';
import type { ArchiveEntry } from '../../utils/zip';

const execFileAsync = promisify(execFile);
const projectRoot = resolve(__dirname, '../../..');
let runtimeDir: string;
let runtimeFile: string;
let fixtureDir: string;

// Jest's CommonJS VM cannot execute native ESM imports without an experimental
// flag. Exercise the emitted CommonJS helper in Node with the real dependency.
async function createZipArchive(dest: string, entries: ArchiveEntry[]): Promise<string> {
  const script = 'require(process.argv[1]).createZipArchive(process.argv[2], JSON.parse(process.argv[3]))'
    + '.then(path => process.stdout.write(path))'
    + '.catch(error => { process.stderr.write(error.message); process.exitCode = 1; });';
  const { stdout } = await execFileAsync(process.execPath, ['-e', script, runtimeFile, dest, JSON.stringify(entries)], {
    timeout: 5000,
    windowsHide: true,
  });
  return stdout;
}

function readZipEntries(bytes: Buffer): Array<{ name: string; body: Buffer }> {
  const end = bytes.length - 22;
  expect(bytes.readUInt32LE(end)).toBe(0x06054b50);
  const count = bytes.readUInt16LE(end + 10);
  let offset = bytes.readUInt32LE(end + 16);
  const entries: Array<{ name: string; body: Buffer }> = [];
  for (let i = 0; i < count; i++) {
    expect(bytes.readUInt32LE(offset)).toBe(0x02014b50);
    const method = bytes.readUInt16LE(offset + 10);
    const size = bytes.readUInt32LE(offset + 20);
    const nameLength = bytes.readUInt16LE(offset + 28);
    const extraLength = bytes.readUInt16LE(offset + 30);
    const commentLength = bytes.readUInt16LE(offset + 32);
    const local = bytes.readUInt32LE(offset + 42);
    expect(bytes.readUInt32LE(local)).toBe(0x04034b50);
    const start = local + 30 + bytes.readUInt16LE(local + 26) + bytes.readUInt16LE(local + 28);
    const compressed = bytes.subarray(start, start + size);
    expect([0, 8]).toContain(method);
    entries.push({
      name: bytes.subarray(offset + 46, offset + 46 + nameLength).toString('utf8'),
      body: method === 8 ? inflateRawSync(compressed) : compressed,
    });
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

describe('createZipArchive with archiver ESM', () => {
  beforeAll(async () => {
    // Keep emitted code below the project to resolve the installed dependency.
    runtimeDir = await fs.mkdtemp(join(projectRoot, '.zip-test-'));
    runtimeFile = join(runtimeDir, 'zip.cjs');
    const source = await fs.readFile(join(projectRoot, 'src/utils/zip.ts'), 'utf8');
    const config = ts.readConfigFile(join(projectRoot, 'tsconfig.json'), ts.sys.readFile);
    const { options } = ts.convertCompilerOptionsFromJson(config.config.compilerOptions, projectRoot);
    await fs.writeFile(runtimeFile, ts.transpileModule(source, { compilerOptions: options }).outputText);
  });
  afterAll(async () => {
    if (runtimeDir) await fs.rm(runtimeDir, { recursive: true, force: true });
  });
  beforeEach(async () => { fixtureDir = await fs.mkdtemp(join(tmpdir(), 'pixivflow zip ')); });
  afterEach(async () => { await fs.rm(fixtureDir, { recursive: true, force: true }); });

  it('preserves novel entry contents, order and Unicode names', async () => {
    const names = ['novel.txt', '小说.md', 'metadata.json', 'images/001.jpg'];
    const contents = [Buffer.from('正文\n'), Buffer.from('# 标题\n'), Buffer.from('{"id":"123"}'), Buffer.from([0xff, 0xd8, 0xff, 0xe0])];
    const entries: ArchiveEntry[] = [];
    for (let i = 0; i < names.length; i++) {
      const sourcePath = join(fixtureDir, `source ${i}`);
      await fs.writeFile(sourcePath, contents[i]);
      entries.push({ name: names[i], sourcePath });
    }
    const dest = join(fixtureDir, 'novel archive.zip');
    expect(await createZipArchive(dest, entries)).toBe(dest);
    const archived = readZipEntries(await fs.readFile(dest));
    expect(archived.map(entry => entry.name)).toEqual(names);
    expect(archived.map(entry => entry.body)).toEqual(contents);
  });

  it('finalizes an empty archive', async () => {
    const dest = join(fixtureDir, 'empty.zip');
    expect(await createZipArchive(dest, [])).toBe(dest);
    expect(readZipEntries(await fs.readFile(dest))).toEqual([]);
  });

  it('reports output failure without hanging or leaving a partial archive', async () => {
    const dest = join(fixtureDir, 'missing', 'novel.zip');
    await expect(createZipArchive(dest, [])).rejects.toThrow('Failed to create zip archive:');
    await expect(fs.access(dest)).rejects.toThrow();
  });
});
