import { BUILD } from '../version';
import { versionString } from '../commands/VersionCommand';

describe('build version metadata', () => {
  it('exposes version + commit placeholder', () => {
    expect(typeof BUILD.version).toBe('string');
    expect(BUILD.version.length).toBeGreaterThan(0);
    expect(typeof BUILD.commit).toBe('string');
    expect(BUILD.commit.length).toBeGreaterThan(0);
    const line = versionString();
    expect(line).toContain(BUILD.version);
    expect(line).toContain(`commit ${BUILD.commit}`);
  });
});
