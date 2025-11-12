import { useState, useCallback, useMemo } from 'react';
import { message } from 'antd';

/**
 * Loading state with optional message
 */
export interface LoadingState {
  loading: boolean;
  message?: string;
  progress?: number; // 0-100
}

/**
 * Hook for unified loading state management
 * Provides loading state, loading message, and loading progress
 */
export function useLoadingState(initialState: boolean = false) {
  const [loading, setLoading] = useState<boolean>(initialState);
  const [loadingMessage, setLoadingMessage] = useState<string | undefined>(undefined);
  const [progress, setProgress] = useState<number | undefined>(undefined);
  const [messageKey, setMessageKey] = useState<string | undefined>(undefined);

  const startLoading = useCallback((msg?: string, key?: string) => {
    setLoading(true);
    if (msg) {
      setLoadingMessage(msg);
      if (key) {
        setMessageKey(key);
        message.loading({ content: msg, key, duration: 0 });
      }
    }
  }, []);

  const stopLoading = useCallback((successMessage?: string) => {
    setLoading(false);
    setLoadingMessage(undefined);
    setProgress(undefined);
    
    if (messageKey) {
      message.destroy(messageKey);
      if (successMessage) {
        message.success({ content: successMessage, key: messageKey, duration: 2 });
      }
      setMessageKey(undefined);
    }
  }, [messageKey]);

  const updateProgress = useCallback((value: number) => {
    setProgress(Math.max(0, Math.min(100, value)));
  }, []);

  const updateMessage = useCallback((msg: string) => {
    setLoadingMessage(msg);
    if (messageKey) {
      message.loading({ content: msg, key: messageKey, duration: 0 });
    }
  }, [messageKey]);

  const state: LoadingState = useMemo(
    () => ({
      loading,
      message: loadingMessage,
      progress,
    }),
    [loading, loadingMessage, progress]
  );

  return {
    ...state,
    startLoading,
    stopLoading,
    updateProgress,
    updateMessage,
    setLoading,
  };
}

/**
 * Hook for managing multiple loading states
 */
export function useLoadingStates<T extends string>(
  initialStates?: Partial<Record<T, boolean>>
) {
  const [loadingStates, setLoadingStates] = useState<Partial<Record<T, LoadingState>>>(() => {
    if (!initialStates) {
      return {};
    }

    return Object.entries(initialStates).reduce<Partial<Record<T, LoadingState>>>(
      (acc, [key, value]) => {
        acc[key as T] = { loading: Boolean(value) };
        return acc;
      },
      {}
    );
  });

  const setLoading = useCallback((key: T, value: boolean, message?: string) => {
    setLoadingStates((prev) => ({
      ...prev,
      [key]: {
        loading: value,
        message: value ? message : undefined,
        progress: value ? prev[key]?.progress : undefined,
      },
    }));
  }, []);

  const startLoading = useCallback((key: T, message?: string) => {
    setLoading(key, true, message);
  }, [setLoading]);

  const stopLoading = useCallback((key: T, successMessage?: string) => {
    setLoadingStates((prev) => {
      const current = prev[key];
      if (current?.loading && successMessage) {
        // Show success message if provided
        message.success(successMessage);
      }
      return {
        ...prev,
        [key]: {
          loading: false,
          message: undefined,
          progress: undefined,
        },
      };
    });
  }, []);

  const updateProgress = useCallback((key: T, value: number) => {
    setLoadingStates((prev) => ({
      ...prev,
      [key]: {
        ...prev[key],
        loading: prev[key]?.loading ?? false,
        progress: Math.max(0, Math.min(100, value)),
      },
    }));
  }, []);

  const isLoading = useCallback(
    (key: T) => loadingStates[key]?.loading === true,
    [loadingStates]
  );

  const getLoadingState = useCallback(
    (key: T): LoadingState | undefined => loadingStates[key],
    [loadingStates]
  );

  const isAnyLoading = useMemo(() => {
    const stateValues = Object.values(loadingStates) as Array<LoadingState | undefined>;
    return stateValues.some((state) => state?.loading === true);
  }, [loadingStates]);

  return {
    loadingStates,
    setLoading,
    startLoading,
    stopLoading,
    updateProgress,
    isLoading,
    getLoadingState,
    isAnyLoading,
  };
}

