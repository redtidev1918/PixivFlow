import { artifactId } from '../../domain/media/Artifact';
import { deliveryFilePaths, type DownloadedArtifact } from '../../delivery/types';

const baseArtifact = (): DownloadedArtifact => ({
  pixivId: '456',
  type: 'novel',
  title: 'Test',
});

describe('domain/media Artifact', () => {
  it('generates deterministic artifact ids', () => {
    expect(artifactId('456', 'text', '456_Test.txt')).toBe('pixiv:456:text:456_Test.txt');
    expect(artifactId('456', 'original', 'images/11.jpg')).toBe('pixiv:456:original:images/11.jpg');
  });

  it('derives delivery paths from canonical artifacts without the legacy files projection', () => {
    const novel = {
      ...baseArtifact(),
      artifacts: [
        { id: 'pixiv:456:text:456.txt', workId: '456', variant: 'text' as const, path: '/tmp/456.txt' },
        { id: 'pixiv:456:markdown:456.md', workId: '456', variant: 'markdown' as const, path: '/tmp/456.md' },
        { id: 'pixiv:456:metadata:456.json', workId: '456', variant: 'metadata' as const, path: '/tmp/456.json' },
        { id: 'pixiv:456:zip:456.zip', workId: '456', variant: 'zip' as const, path: '/tmp/456.zip' },
        { id: 'pixiv:456:original:11.jpg', workId: '456', variant: 'original' as const, path: '/tmp/images/11.jpg' },
      ],
    };
    // Novels ship txt + zip; markdown/metadata/original stay sidecars.
    expect(deliveryFilePaths(novel)).toEqual(['/tmp/456.txt', '/tmp/456.zip']);

    const illustration = {
      ...baseArtifact(),
      type: 'illustration' as const,
      artifacts: [
        { id: 'pixiv:1:original:1.jpg', sourceAssetId: 'pixiv:1:illust:page-1', workId: '1', variant: 'original' as const, path: '/tmp/p0.jpg' },
        { id: 'pixiv:1:metadata:1.json', workId: '1', variant: 'metadata' as const, path: '/tmp/p0.jpg.json' },
        { id: 'pixiv:1:original:2.jpg', sourceAssetId: 'pixiv:1:illust:page-2', workId: '1', variant: 'original' as const, path: '/tmp/p1.jpg' },
      ],
    };
    // Illustrations ship originals in page order and nothing else.
    expect(deliveryFilePaths(illustration)).toEqual(['/tmp/p0.jpg', '/tmp/p1.jpg']);
  });
});
