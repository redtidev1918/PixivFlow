import { normalizeNovelCoverUrl } from '../../download/novelCover';

describe('normalizeNovelCoverUrl (§novel-cover)', () => {
  it('keeps a real cover and derives the original-size URL', () => {
    const resized =
      'https://i.pximg.net/c/240x480_70_a2/novel-cover-master/img/2026/01/02/03/04/05/123_abc.jpg';
    expect(normalizeNovelCoverUrl(resized)).toBe(
      'https://i.pximg.net/novel-cover-master/img/2026/01/02/03/04/05/123_abc.jpg'
    );
  });

  it('normalizes the Pixiv default placeholder to null', () => {
    expect(
      normalizeNovelCoverUrl(
        'https://i.pximg.net/c/240x480_70_a2/novel-cover-master-default/img/common/def.png'
      )
    ).toBeNull();
  });

  it('normalizes missing and malformed values to null', () => {
    expect(normalizeNovelCoverUrl(undefined)).toBeNull();
    expect(normalizeNovelCoverUrl(null)).toBeNull();
    expect(normalizeNovelCoverUrl('')).toBeNull();
    expect(normalizeNovelCoverUrl('not-a-url')).toBeNull();
  });

  it('keeps an unresizable real cover untouched', () => {
    const url = 'https://i.pximg.net/novel-cover-master/img/cover.jpg';
    expect(normalizeNovelCoverUrl(url)).toBe(url);
  });
});
