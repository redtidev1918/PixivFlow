import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Script } from 'node:vm';

it('keeps the pinned documentation runtime intact and syntactically valid', () => {
  const directory = resolve(__dirname, '../../../docs/assets/vendor');
  const runtime = readFileSync(resolve(directory, 'docsify.min.js'));
  const expected = readFileSync(resolve(directory, 'SOURCES.sha256'), 'utf8').trim().split(/\s+/)[0];
  expect(createHash('sha256').update(runtime).digest('hex')).toBe(expected);
  expect(() => new Script(runtime.toString('utf8'))).not.toThrow();
});
