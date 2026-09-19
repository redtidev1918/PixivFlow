import { PixivMediaMaterializer } from '../../../download/materialization/MediaMaterializer';
import { IPixivClient } from '../../../interfaces/IPixivClient';
import { IFileService } from '../../../interfaces/IFileService';
import { buildMediaAsset } from '../../../domain/media/MediaAsset';

describe('MediaMaterializer', () => {
  const mediaAsset = buildMediaAsset({
    workId: '456',
    kind: 'uploadedimage',
    sourceId: '11',
    sourceUrl: 'https://i.pximg.net/img/original/u/11.jpg',
  });

  it('wraps the existing download+save path and produces an original Artifact', async () => {
    const client = {
      downloadImage: jest.fn().mockResolvedValue(new ArrayBuffer(4)),
    } as unknown as jest.Mocked<IPixivClient>;
    const fileService = {
      saveBinary: jest.fn().mockResolvedValue('/tmp/novels/images/11.jpg'),
    } as unknown as jest.Mocked<IFileService>;

    const materializer = new PixivMediaMaterializer(client, fileService);
    const artifact = await materializer.materialize(mediaAsset, {
      variant: 'original',
      destination: '/tmp/novels/images',
    });

    expect(client.downloadImage).toHaveBeenCalledWith('https://i.pximg.net/img/original/u/11.jpg');
    expect(fileService.saveBinary).toHaveBeenCalledWith(expect.anything(), '11.jpg', '/tmp/novels/images');
    expect(artifact).toEqual({
      id: 'pixiv:456:original:11.jpg',
      sourceAssetId: 'pixiv:456:uploadedimage:11',
      workId: '456',
      variant: 'original',
      path: '/tmp/novels/images/11.jpg',
    });
  });

  it('requires a destination', async () => {
    const materializer = new PixivMediaMaterializer(
      {} as unknown as IPixivClient,
      {} as unknown as IFileService,
    );
    await expect(materializer.materialize(mediaAsset)).rejects.toThrow('requires options.destination');
  });
});
