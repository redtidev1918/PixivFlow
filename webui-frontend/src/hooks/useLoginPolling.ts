import { useEffect, useRef, useCallback } from 'react';
import { message } from 'antd';

const MAX_POLLING_DURATION = 10 * 60 * 1000; // 10 minutes

interface UseLoginPollingOptions {
  enabled: boolean;
  onAuthenticated: () => void;
  refetchAuthStatus: () => Promise<unknown>;
  isAuthenticated: (response: unknown) => boolean;
}

/**
 * Hook for polling authentication status during interactive login
 */
export function useLoginPolling({
  enabled,
  onAuthenticated,
  refetchAuthStatus,
  isAuthenticated,
}: UseLoginPollingOptions) {
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const pollingStartTimeRef = useRef<number | null>(null);

  const stopPolling = useCallback(() => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
    pollingStartTimeRef.current = null;
  }, []);

  useEffect(() => {
    if (enabled) {
      // Initialize polling start time if not set
      if (!pollingStartTimeRef.current) {
        pollingStartTimeRef.current = Date.now();
        console.log('[LoginPolling] Starting polling for interactive login...');
      }

      // Start polling every 2 seconds
      if (!pollingIntervalRef.current) {
        pollingIntervalRef.current = setInterval(async () => {
          try {
            // Check if we've exceeded max polling duration
            if (pollingStartTimeRef.current && Date.now() - pollingStartTimeRef.current > MAX_POLLING_DURATION) {
              console.log('[LoginPolling] Polling timeout reached, stopping...');
              stopPolling();
              message.warning('登录超时，请重试');
              return;
            }

            console.log('[LoginPolling] Polling auth status...');
            const result = await refetchAuthStatus();

            if (isAuthenticated(result)) {
              console.log('[LoginPolling] Authentication detected via polling!');
              stopPolling();
              onAuthenticated();
            }
          } catch (error) {
            console.error('[LoginPolling] Polling error:', error);
            // Continue polling even on error
          }
        }, 2000);
      }
    } else {
      // Stop polling when disabled
      stopPolling();
    }

    // Cleanup on unmount
    return () => {
      stopPolling();
    };
  }, [enabled, refetchAuthStatus, isAuthenticated, onAuthenticated, stopPolling]);

  return {
    stopPolling,
  };
}

