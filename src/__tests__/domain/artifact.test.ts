import { artifactId, projectLegacyFiles, type Artifact } from '../../domain/media/Artifact';

describe('domain/media Artifact', () => {
  it('generates deterministic artifact ids', () => {
    expect(artifactId('456', 'text', '456_Test.txt')).toBe('pixiv:456:text:456_Test.txt');
    expect(artifactId('456', 'original', 'images/11.jpg')).toBe('pixiv:456:original:images/11.jpg');
  });

  it('projects legacy files from canonical artifacts', () => {
    const artifacts: Artifact[] = [
      { id: 'pixiv:456:text:456.txt', workId: '456', variant: 'text', path: '/tmp/456.txt' },
      { id: 'pixiv:456:original:11.jpg', workId: '456', variant: 'original', path: '/tmp/images/11.jpg' },
    ];
    expect(projectLegacyFiles(artifacts)).toEqual(['/tmp/456.txt', '/tmp/images/11.jpg']);
    expect(projectLegacyFiles([])).toEqual([]);
  });
});
