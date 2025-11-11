import { useState, useCallback } from 'react';

/**
 * Hook for managing loading state
 */
export function useLoading(initialState = false) {
  const [loading, setLoading] = useState(initialState);

  const startLoading = useCallback(() => setLoading(true), []);
  const stopLoading = useCallback(() => setLoading(false), []);
  const toggleLoading = useCallback(() => setLoading((prev) => !prev), []);

  return {
    loading,
    setLoading,
    startLoading,
    stopLoading,
    toggleLoading,
  };
}

/**
 * Hook for managing multiple loading states
 */
export function useLoadingStates<T extends string>(
  initialStates?: Partial<Record<T, boolean>>
) {
  const [loadingStates, setLoadingStates] = useState<Partial<Record<T, boolean>>>(
    initialStates || {}
  );

  const setLoading = useCallback((key: T, value: boolean) => {
    setLoadingStates((prev) => ({ ...prev, [key]: value }));
  }, []);

  const startLoading = useCallback((key: T) => {
    setLoading(key, true);
  }, [setLoading]);

  const stopLoading = useCallback((key: T) => {
    setLoading(key, false);
  }, [setLoading]);

  const isLoading = useCallback(
    (key: T) => loadingStates[key] === true,
    [loadingStates]
  );

  const isAnyLoading = Object.values(loadingStates).some((value) => value === true);

  return {
    loadingStates,
    setLoading,
    startLoading,
    stopLoading,
    isLoading,
    isAnyLoading,
  };
}

