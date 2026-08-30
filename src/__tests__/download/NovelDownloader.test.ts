import { NovelDownloader } from '../../download/NovelDownloader';
import { TargetConfig } from '../../config';
import { IPixivClient } from '../../interfaces/IPixivClient';
import { IDatabase } from '../../interfaces/IDatabase';
import { IFileService } from '../../interfaces/IFileService';
import { PixivNovel } from '../../pixiv/PixivClient';

jest.mock('../../utils/directory-info', () => ({
  displayDownloadPath: jest.fn(),
}));

describe('NovelDownloader', () => {
  const novel = {
    id: 123,
    title: 'Test novel',
    user: { id: '42', name: 'Author' },
    create_date: '2026-08-29T00:00:00+00:00',
    total_bookmarks: 10,
    total_view: 100,
    x_restrict: 1,
  } as PixivNovel;

  function createDownloader(text: string) {
    const client = {
      getNovelDetailWithTags: jest.fn().mockResolvedValue({
        novel,
        tags: [{ name: 'ボテ腹' }, { name: 'R-18' }],
      }),
      getNovelText: jest.fn().mockResolvedValue({ novel_text: text }),
    } as unknown as jest.Mocked<IPixivClient>;
    const database = {
      insertDownload: jest.fn(),
    } as unknown as jest.Mocked<IDatabase>;
    const fileService = {
      sanitizeFileName: jest.fn((name: string) => name),
      saveText: jest.fn().mockResolvedValue('/tmp/123_Test novel.txt'),
      saveMetadata: jest.fn().mockResolvedValue('/tmp/123_Test novel.txt.json'),
    } as unknown as jest.Mocked<IFileService>;
    return {
      downloader: new NovelDownloader(client, database, fileService),
      client,
      database,
      fileService,
    };
  }

  it('unwraps novel_text and writes the actual novel body', async () => {
    const { downloader, fileService, database } = createDownloader('Actual novel body');

    const artifact = await downloader.download(
      novel,
      'ボテ腹',
      { type: 'novel', detectLanguage: false } as TargetConfig
    );

    const written = fileService.saveText.mock.calls[0][0];
    expect(written).toContain('Actual novel body');
    expect(written).not.toContain('[object Object]');
    expect(database.insertDownload).toHaveBeenCalledTimes(1);
    expect(artifact).toMatchObject({
      pixivId: '123',
      type: 'novel',
      spoiler: true,
      tags: ['ボテ腹', 'R-18'],
    });
  });

  it('does not persist or deliver an empty-body novel', async () => {
    const { downloader, fileService, database } = createDownloader('   ');

    const artifact = await downloader.download(
      novel,
      'ボテ腹',
      { type: 'novel', detectLanguage: false } as TargetConfig
    );

    expect(artifact).toBeUndefined();
    expect(fileService.saveText).not.toHaveBeenCalled();
    expect(database.insertDownload).not.toHaveBeenCalled();
  });
});
