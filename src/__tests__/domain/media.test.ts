import {
  configureMediaAssetNamespace,
  DEFAULT_MEDIA_ASSET_NAMESPACE,
  getMediaAssetNamespace,
  mediaAssetId,
  type MediaAsset,
} from '../../domain/media/MediaAsset';

describe('domain/media MediaAsset', () => {
  afterEach(() => {
    // Tests mutate the process-wide namespace; always restore production default.
    configureMediaAssetNamespace(undefined);
  });

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

  it('honours an explicit namespace override', () => {
    expect(mediaAssetId('123456', 'illust', undefined, 'other')).toBe('other:123456:illust');
    // Default namespace stays pixiv (production config unchanged).
    expect(getMediaAssetNamespace()).toBe(DEFAULT_MEDIA_ASSET_NAMESPACE);
  });

  it('applies the configured namespace as the default prefix', () => {
    configureMediaAssetNamespace('secondsrc');
    expect(getMediaAssetNamespace()).toBe('secondsrc');
    expect(mediaAssetId('42', 'illust')).toBe('secondsrc:42:illust');
  });

  it('falls back to pixiv for empty or invalid namespaces', () => {
    configureMediaAssetNamespace('');
    expect(getMediaAssetNamespace()).toBe('pixiv');
    configureMediaAssetNamespace('INVALID_NS!');
    expect(getMediaAssetNamespace()).toBe('pixiv');
    expect(mediaAssetId('42', 'illust')).toBe('pixiv:42:illust');
  });
});
