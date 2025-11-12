import { useState, useCallback } from 'react';

/**
 * Hook for managing file browser navigation
 * Handles path navigation and back navigation
 */
export function useFileBrowser() {
  const [currentPath, setCurrentPath] = useState<string>('');

  const handleNavigate = useCallback((path: string) => {
    setCurrentPath(path);
  }, []);

  const handleGoBack = useCallback(() => {
    const parts = currentPath.split('/');
    parts.pop();
    handleNavigate(parts.join('/'));
  }, [currentPath, handleNavigate]);

  const resetPath = useCallback(() => {
    setCurrentPath('');
  }, []);

  return {
    currentPath,
    handleNavigate,
    handleGoBack,
    resetPath,
  };
}

