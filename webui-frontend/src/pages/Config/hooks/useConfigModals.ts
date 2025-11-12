import { useState, useCallback } from 'react';

/**
 * Hook for managing config modals state
 */
export function useConfigModals() {
  const [previewVisible, setPreviewVisible] = useState(false);
  const [jsonEditorVisible, setJsonEditorVisible] = useState(false);
  const [editingConfigFile, setEditingConfigFile] = useState<string | null>(null);

  const openPreview = useCallback(() => {
    setPreviewVisible(true);
  }, []);

  const closePreview = useCallback(() => {
    setPreviewVisible(false);
  }, []);

  const openJsonEditor = useCallback((filename: string) => {
    setEditingConfigFile(filename);
    setJsonEditorVisible(true);
  }, []);

  const closeJsonEditor = useCallback(() => {
    setJsonEditorVisible(false);
    setEditingConfigFile(null);
  }, []);

  return {
    previewVisible,
    jsonEditorVisible,
    editingConfigFile,
    openPreview,
    closePreview,
    openJsonEditor,
    closeJsonEditor,
  };
}

