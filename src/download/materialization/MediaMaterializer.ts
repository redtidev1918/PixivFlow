import { IPixivClient } from '../../interfaces/IPixivClient';
import { IFileService } from '../../interfaces/IFileService';
import { type MediaAsset } from '../../domain/media/MediaAsset';
import { type Artifact, artifactId, type ArtifactVariant } from '../../domain/media/Artifact';

export interface MaterializationOptions {
  variant?: 'original' | 'delivery';
  destination?: string;
}

/**
 * Turns a canonical MediaAsset into a local Artifact on demand. This is the
 * future lazy-materialization boundary; today it wraps the existing
 * IPixivClient.downloadImage + IFileService.saveBinary path so no new HTTP
 * download implementation exists.
 */
export interface MediaMaterializer {
  materialize(asset: MediaAsset, options?: MaterializationOptions): Promise<Artifact>;
}

function fileNameFor(asset: MediaAsset): string {
  const sourceId = asset.sourceRef?.sourceId ?? '';
  let ext = '';
  try {
    const last = new URL(asset.sourceUrl).pathname.split('/').pop() || '';
    const dot = last.lastIndexOf('.');
    if (dot >= 0) ext = last.slice(dot);
  } catch {
    // keep no extension
  }
  return `${sourceId}${ext}` || 'image';
}

export class PixivMediaMaterializer implements MediaMaterializer {
  constructor(
    private readonly client: IPixivClient,
    private readonly fileService: IFileService
  ) {}

  async materialize(asset: MediaAsset, options: MaterializationOptions = {}): Promise<Artifact> {
    if (!options.destination) {
      throw new Error('PixivMediaMaterializer requires options.destination');
    }
    const buffer = await this.client.downloadImage(asset.sourceUrl);
    const fileName = fileNameFor(asset);
    const path = await this.fileService.saveBinary(buffer, fileName, options.destination);
    const variant: ArtifactVariant = options.variant ?? 'original';
    return {
      id: artifactId(asset.sourceRef?.workId ?? '', variant, fileName),
      sourceAssetId: asset.id,
      workId: asset.sourceRef?.workId ?? '',
      variant,
      path,
    };
  }
}
