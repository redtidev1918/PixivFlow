import { mediaAssetId, type MediaAsset } from '../../domain/media/MediaAsset';

describe('domain/media MediaAsset', () => {
  it('generates stable deterministic identities per pixiv kind', () => {
    expect(mediaAssetId('123456', 'pixivimage', 'p0')).toBe('pixiv:123456:pixivimage:p0');
    expect(mediaAssetId('987654', 'uploadedimage', '111')).toBe('pixiv:987654:uploadedimage:111');
    expect(mediaAssetId('123456', 'illust')).toBe('pixiv:123456:illust');
  });

  it('does not require localPath / artifactId in the canonical shape', () => {
    const asset: MediaAsset = {
      id: mediaAssetId('123456', 'pixivimage', 'p0'),
      source: 'pixiv',
      kind: 'image',
      sourceUrl: 'https://i.pximg.net/img-master/img/1_p0.jpg',
      sourceRef: { workId: '123456', sourceId: 'p0', pixivKind: 'pixivimage' },
    };
    expect('localPath' in asset).toBe(false);
    expect(asset.artifactId).toBeUndefined();
    expect(asset.id).toBe('pixiv:123456:pixivimage:p0');
  });
});
