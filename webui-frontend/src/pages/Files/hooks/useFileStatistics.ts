import { useMemo } from 'react';
import { FileItem } from '../Files';

const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'];

/**
 * Hook for calculating file statistics
 */
export function useFileStatistics(files: FileItem[], directories: FileItem[]) {
  const stats = useMemo(() => {
    const all = [...directories, ...files];
    const directoriesCount = all.filter((item) => item.type === 'directory').length;
    const filesCount = all.filter((item) => item.type === 'file').length;
    const totalSize = all
      .filter((item) => item.type === 'file' && item.size)
      .reduce((sum, item) => sum + (item.size || 0), 0);
    const images = all.filter(
      (item) =>
        item.type === 'file' &&
        imageExtensions.includes(item.extension?.toLowerCase() || '')
    ).length;

    const formatFileSize = (bytes: number) => {
      if (bytes < 1024) return `${bytes} B`;
      if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
      return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
    };

    return {
      directories: directoriesCount,
      files: filesCount,
      totalSize: formatFileSize(totalSize),
      images,
    };
  }, [directories, files]);

  return stats;
}

