import { useState, useCallback } from 'react';
import { message } from 'antd';
import { useTranslation } from 'react-i18next';
import { useErrorHandler } from '../../../hooks/useErrorHandler';
import { FileItem } from '../Files';

const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'];

/**
 * Hook for managing file operations (preview, delete)
 */
export function useFileOperations(
  deleteFileAsync: (params: { id: string; path?: string; type?: string }) => Promise<void>,
  fileType: 'illustration' | 'novel',
  onNavigate?: (path: string) => void
) {
  const { t } = useTranslation();
  const { handleError } = useErrorHandler();
  const [previewVisible, setPreviewVisible] = useState(false);
  const [previewFile, setPreviewFile] = useState<FileItem | null>(null);

  const handlePreview = useCallback(
    (file: FileItem) => {
      if (file.type === 'directory') {
        onNavigate?.(file.path);
        return;
      }

      const ext = file.extension?.toLowerCase() || '';
      const isImage = imageExtensions.includes(ext);
      const isText = ['.txt', '.md', '.text'].includes(ext);

      if (isImage || isText) {
        setPreviewFile(file);
        setPreviewVisible(true);
      } else {
        message.info(t('files.previewNotSupported'));
      }
    },
    [onNavigate, t]
  );

  const handleDelete = useCallback(
    async (file: FileItem) => {
      try {
        await deleteFileAsync({ id: file.name, path: file.path, type: fileType });
        message.success(t('files.fileDeleted'));
      } catch (error) {
        handleError(error);
      }
    },
    [deleteFileAsync, fileType, handleError, t]
  );

  const closePreview = useCallback(() => {
    setPreviewVisible(false);
    setPreviewFile(null);
  }, []);

  return {
    previewVisible,
    previewFile,
    handlePreview,
    handleDelete,
    closePreview,
  };
}

