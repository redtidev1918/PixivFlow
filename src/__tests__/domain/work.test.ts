import { toResolvedWork, type Work } from '../../domain/media/Work';

describe('domain/media ResolvedWork', () => {
  it('builds work + mediaAssets from resolved media refs', () => {
    const work: Work = { id: '456', type: 'novel', title: 'Rich novel', tags: ['a'] };
    const resolved = toResolvedWork(work, [{
      workId: '456',
      kind: 'uploadedimage',
      sourceId: '11',
      sourceUrl: 'https://i.pximg.net/img/original/u/11.jpg',
    }]);

    expect(resolved.work).toBe(work);
    expect(resolved.mediaAssets).toHaveLength(1);
    expect(resolved.mediaAssets![0]).toMatchObject({
      id: 'pixiv:456:uploadedimage:11',
      source: 'pixiv',
      kind: 'image',
      sourceUrl: 'https://i.pximg.net/img/original/u/11.jpg',
      artifactId: undefined,
    });
  });

  it('stays descriptor-only (no scheduler/delivery fields)', () => {
    const resolved = toResolvedWork({ id: '1', type: 'illustration' }, []);
    expect(resolved.work).not.toHaveProperty('slotId');
    expect(resolved.work).not.toHaveProperty('telegramFileId');
    expect(resolved.mediaAssets).toEqual([]);
  });
});
