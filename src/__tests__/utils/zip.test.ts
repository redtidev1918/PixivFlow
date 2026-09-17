import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createZipArchive } from '../../utils/zip';

describe('createZipArchive', () => {
  it('produces a valid zip with every source file in order', async () => {
    const dir = await fs.mkdtemp(join(tmpdir(), 'pixivflow-zip-'));
    const txt = join(dir, 'novel.txt');
    const md = join(dir, 'novel.md');
    const imgDir = join(dir, 'images');
    const img = join(imgDir, '001.jpg');
    await fs.mkdir(imgDir);
    await fs.writeFile(txt, 'body\n');
    await fs.writeFile(md, '# title\n');
    await fs.writeFile(img, Buffer.from([0xff, 0xd8, 0xff, 0xe0]));

    const dest = join(dir, 'novel.zip');
    const out = await createZipArchive(dest, [
      { name: 'novel.txt', sourcePath: txt },
      { name: 'novel.md', sourcePath: md },
      { name: 'images/001.jpg', sourcePath: img },
    ]);

    expect(out).toBe(dest);
    const bytes = await fs.readFile(dest);
    expect(bytes.length).toBeGreaterThan(0);
    // PK\x03\x04 = local file header signature of a zip archive.
    expect(bytes.subarray(0, 4).toString('latin1')).toBe('PK\x03\x04');
    await fs.rm(dir, { recursive: true, force: true });
  });
});
