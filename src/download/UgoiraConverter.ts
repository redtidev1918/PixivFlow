import { execFile } from 'node:child_process';
import { join } from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);

export async function convertUgoira(zipPath: string, framesPath: string): Promise<string> {
  const gifPath = zipPath.replace(/\.zip$/i, '.gif');
  try {
    await run('python3', [join(__dirname, 'ugoira_to_gif.py'), zipPath, framesPath, gifPath], {
      timeout: 270_000,
      maxBuffer: 64 * 1024,
    });
  } catch (error) {
    throw new Error(`Ugoira GIF conversion failed; install Python 3 and FFmpeg. Original ZIP/JSON retained. ${error instanceof Error ? error.message : String(error)}`);
  }
  return gifPath;
}
