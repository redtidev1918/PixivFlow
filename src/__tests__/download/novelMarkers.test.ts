import { scanNovelMarkers, extractNovelAssets } from '../../download/novelMarkers';

describe('novelMarkers', () => {
  it('scans simple markers and plain text', () => {
    const markers = scanNovelMarkers('header [newpage] body');
    expect(markers[0]).toEqual({ type: 'text', value: 'header ' });
    expect(markers[1]).toEqual({ type: 'newpage', raw: '[newpage]' });
  });

  it('keeps [[...]] double-bracket close so URLs are not truncated early', () => {
    const markers = scanNovelMarkers('x[[jumpuri:Title > https://example.com/a?b=1]]y');
    const jump = markers.find((m) => m.type === 'jumpuri');
    expect(jump).toBeTruthy();
    if (jump && jump.type === 'jumpuri') expect(jump.url).toBe('https://example.com/a?b=1');
  });

  it('extracts uploadedimage assets from the images map', () => {
    const assets = extractNovelAssets('[uploadedimage:11]', {
      images: {
        '11': { urls: { original: 'https://i.pximg.net/img/original/u/11.jpg' } },
      },
    });
    expect(assets).toEqual([
      {
        marker: '[uploadedimage:11]',
        kind: 'uploadedimage',
        sourceId: '11',
        url: 'https://i.pximg.net/img/original/u/11.jpg',
        status: 'pending',
      },
    ]);
  });

  it('marks a deleted pixivimage as unavailable (no retry-worthy url)', () => {
    const assets = extractNovelAssets('[pixivimage:12551-1]', { illusts: { '12551-1': null } });
    expect(assets[0].kind).toBe('pixivimage');
    expect(assets[0].status).toBe('unavailable');
    expect(assets[0].url).toBeUndefined();
  });
});
