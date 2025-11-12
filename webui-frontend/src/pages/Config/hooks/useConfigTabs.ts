import { useState, useCallback } from 'react';

/**
 * Hook for managing config tabs state
 */
export function useConfigTabs() {
  const [activeTab, setActiveTab] = useState('files');

  const handleTabChange = useCallback((tab: string) => {
    setActiveTab(tab);
  }, []);

  return {
    activeTab,
    setActiveTab: handleTabChange,
  };
}

