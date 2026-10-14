import { downloadFromUrl, downloadFromBatchUrls } from '../../webui/routes/handlers/download-url-handlers';
import { downloadTaskManager } from '../../webui/services/DownloadTaskManager';

jest.mock('../../webui/services/DownloadTaskManager', () => ({ downloadTaskManager: { hasActiveTask: jest.fn(() => false), startTask: jest.fn(async () => {}) } }));

function response() { const r = { status: jest.fn(), json: jest.fn() }; r.status.mockReturnValue(r); return r; }
beforeEach(() => jest.clearAllMocks());

it('passes ebook choices through the existing download task', async () => {
  const res = response();
  await downloadFromUrl({ body: { url: 'https://www.pixiv.net/novel/series/42', novelExport: { formats: ['epub'], mergeSeries: true } } } as never, res as never);
  expect(downloadTaskManager.startTask).toHaveBeenCalledWith(expect.any(String), undefined, { targets: [expect.objectContaining({ seriesId: 42, novelExport: { formats: ['epub'], mergeSeries: true } })] });
  expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
});

it.each([{ formats: ['html'] }, { formats: ['pdf'], pdf: { browserPath: '/untrusted/binary' } }, 'epub'])('rejects invalid or executable-bearing WebUI options: %j', async novelExport => {
  const res = response();
  await downloadFromUrl({ body: { url: 'https://www.pixiv.net/novel/show.php?id=42', novelExport } } as never, res as never);
  expect(res.status).toHaveBeenCalledWith(400);
  expect(downloadTaskManager.startTask).not.toHaveBeenCalled();
});

it('applies batch ebook formats only to novels', async () => {
  const res = response();
  await downloadFromBatchUrls({ body: { urls: ['https://www.pixiv.net/artworks/1', 'https://www.pixiv.net/novel/show.php?id=2'], novelExport: { formats: ['epub'] } } } as never, res as never);
  const targets = (downloadTaskManager.startTask as jest.Mock).mock.calls[0][2].targets;
  expect(targets[0].novelExport).toBeUndefined(); expect(targets[1].novelExport.formats).toEqual(['epub']);
});
