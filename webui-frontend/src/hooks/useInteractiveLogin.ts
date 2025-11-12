import { useEffect, useRef, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { message } from 'antd';
import { api } from '../services/api';
import { QUERY_KEYS } from '../constants';
import type { ElectronLoginSuccessData, ElectronLoginError } from '../types/electron';

interface UseInteractiveLoginOptions {
  onLoginSuccess?: () => void;
  refetchAuthStatus: () => Promise<unknown>;
  isAuthenticated: (response: unknown) => boolean;
  startPolling: () => void;
  stopPolling: () => void;
}

/**
 * Hook for handling interactive login (Electron and backend API)
 */
export function useInteractiveLogin({
  onLoginSuccess,
  refetchAuthStatus,
  isAuthenticated,
  startPolling,
  stopPolling,
}: UseInteractiveLoginOptions) {
  const queryClient = useQueryClient();
  const isInteractiveLoginActiveRef = useRef<boolean>(false);

  // Handle successful login
  const handleLoginSuccess = useCallback(async () => {
    stopPolling();
    
    // Show progress messages
    message.loading({ content: '✅ 登录成功，正在验证登录状态...', key: 'login-success', duration: 0 });
    
    // Invalidate queries to refresh data
    queryClient.invalidateQueries({ queryKey: QUERY_KEYS.AUTH_STATUS });
    queryClient.invalidateQueries({ queryKey: QUERY_KEYS.CONFIG });
    
    // Wait for backend config to refresh
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Wait for auth status to update before navigating
    try {
      const result = await refetchAuthStatus();
      console.log('[InteractiveLogin] Auth status after invalidate:', result);
      
      message.destroy('login-success');
      
      // Verify authentication before navigating
      if (isAuthenticated(result)) {
        console.log('[InteractiveLogin] Authentication confirmed, navigating to dashboard...');
        message.success('✅ 登录成功！正在跳转到 Dashboard...');
        
        await new Promise(resolve => setTimeout(resolve, 800));
        window.location.href = '/dashboard';
      } else {
        console.warn('[InteractiveLogin] Auth status not confirmed, but attempting navigation anyway...');
        message.warning('状态验证失败，但将尝试跳转...');
        
        await new Promise(resolve => setTimeout(resolve, 1000));
        window.location.href = '/dashboard';
      }
    } catch (error) {
      console.error('[InteractiveLogin] Error checking auth status before navigation:', error);
      message.destroy('login-success');
      message.warning('状态检查出错，但将尝试跳转...');
      
      await new Promise(resolve => setTimeout(resolve, 1000));
      window.location.href = '/dashboard';
    }
    
    onLoginSuccess?.();
  }, [stopPolling, queryClient, refetchAuthStatus, isAuthenticated, onLoginSuccess]);

  // Register IPC event listeners for Electron login
  useEffect(() => {
    const isElectron = typeof window !== 'undefined' && window.electron;
    if (!isElectron || !window.electron?.onLoginSuccess) {
      return;
    }

    console.log('[InteractiveLogin] Registering IPC event listeners for Electron login...');

    // Handle login success from Electron
    const handleElectronLoginSuccess = async (data: ElectronLoginSuccessData) => {
      console.log('[InteractiveLogin] Received login-success event from Electron:', data);
      
      try {
        stopPolling();
        
        if (data.refreshToken) {
          console.log('[InteractiveLogin] RefreshToken received from Electron');
          message.loading({ content: '✅ 已获取授权码，正在交换 Token...', key: 'login-progress', duration: 0 });
          
          await new Promise(resolve => setTimeout(resolve, 500));
          
          message.loading({ content: '✅ Token 交换成功，正在保存到后端配置...', key: 'login-progress', duration: 0 });
          
          await new Promise(resolve => setTimeout(resolve, 1000));
          
          message.loading({ content: '✅ Token 已保存，正在验证登录状态...', key: 'login-progress', duration: 0 });
        } else {
          message.loading({ content: '✅ 登录成功，正在验证登录状态...', key: 'login-progress', duration: 0 });
        }
        
        queryClient.invalidateQueries({ queryKey: ['authStatus'] });
        queryClient.invalidateQueries({ queryKey: ['config'] });
        
        await new Promise(resolve => setTimeout(resolve, 1500));
        
        // Check auth status multiple times with retries
        let authenticated = false;
        
        for (let attempt = 0; attempt < 5; attempt++) {
          try {
            const result = await refetchAuthStatus();
            console.log(`[InteractiveLogin] Auth status check (attempt ${attempt + 1}/5):`, result);
            
            if (isAuthenticated(result)) {
              authenticated = true;
              console.log('[InteractiveLogin] Authentication confirmed');
              break;
            } else {
              if (attempt < 4) {
                await new Promise(resolve => setTimeout(resolve, 500));
              }
            }
          } catch (error) {
            console.error(`[InteractiveLogin] Auth status check error (attempt ${attempt + 1}/5):`, error);
            if (attempt < 4) {
              await new Promise(resolve => setTimeout(resolve, 500));
            }
          }
        }
        
        message.destroy('login-progress');
        
        if (authenticated || data.refreshToken) {
          console.log('[InteractiveLogin] Proceeding with login success (authenticated:', authenticated, ', hasToken:', !!data.refreshToken, ')');
          message.success('✅ 登录成功！正在跳转到 Dashboard...');
          
          await new Promise(resolve => setTimeout(resolve, 800));
          window.location.href = '/dashboard';
        } else {
          console.error('[InteractiveLogin] Authentication not confirmed after multiple attempts');
          message.warning('登录成功，但状态验证失败。请手动刷新页面或点击"检查登录状态"按钮。');
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : '未知错误';
        console.error('[InteractiveLogin] Error handling login-success event:', error);
        message.destroy('login-progress');
        message.error('处理登录成功事件时出错: ' + errorMessage);
      }
    };

    // Handle login error from Electron
    const handleElectronLoginError = (error: ElectronLoginError) => {
      console.error('[InteractiveLogin] Received login-error event from Electron:', error);
      stopPolling();
      message.error('登录失败: ' + (error.message || '未知错误'));
    };

    // Register event listeners
    const cleanupLoginSuccess = window.electron.onLoginSuccess(handleElectronLoginSuccess);
    const cleanupLoginError = window.electron.onLoginError(handleElectronLoginError);

    // Cleanup
    return () => {
      console.log('[InteractiveLogin] Cleaning up IPC event listeners...');
      if (cleanupLoginSuccess && typeof cleanupLoginSuccess === 'function') {
        cleanupLoginSuccess();
      }
      if (cleanupLoginError && typeof cleanupLoginError === 'function') {
        cleanupLoginError();
      }
    };
  }, [queryClient, refetchAuthStatus, isAuthenticated, stopPolling]);

  // Handle interactive login
  const handleInteractiveLogin = useCallback(async (configData?: { data?: { data?: { network?: { proxy?: { enabled?: boolean; [key: string]: unknown } } } } }) => {
    const isElectron = typeof window !== 'undefined' && window.electron;
    
    if (isElectron && window.electron?.openLoginWindow) {
      // Use Electron system browser login
      console.log('[InteractiveLogin] Using Electron system browser login...');
      
      try {
        message.info('正在打开系统浏览器进行登录...', 3);
        
        isInteractiveLoginActiveRef.current = true;
        startPolling();
        
        const result = await window.electron.openLoginWindow();
        if (!result.success) {
          if (result.cancelled) {
            stopPolling();
            isInteractiveLoginActiveRef.current = false;
            return;
          }
          throw new Error(result.error || '无法打开登录窗口');
        }
        
        console.log('[InteractiveLogin] Login window opened, waiting for login-success or login-error event...');
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : '未知错误';
        console.error('[InteractiveLogin] Failed to open Electron login window:', error);
        message.error('无法打开登录窗口: ' + errorMessage);
        stopPolling();
        isInteractiveLoginActiveRef.current = false;
      }
      return;
    }
    
    // Fallback to backend API (Puppeteer/Python)
    const username = '';
    const password = '';
    
    const proxy = configData?.data?.data?.network?.proxy?.enabled 
      ? configData.data.data.network.proxy 
      : undefined;
    
    stopPolling();
    
    isInteractiveLoginActiveRef.current = true;
    startPolling();
    console.log('[InteractiveLogin] Starting interactive login via backend API, polling will begin...');
    
    try {
      await api.login(username, password, false, proxy);
    } catch (error) {
      const apiError = error as { code?: string; message?: string };
      const isTimeout = apiError?.code === 'ECONNABORTED' || apiError?.message?.includes('timeout');
      
      if (isTimeout) {
        console.log('[InteractiveLogin] Interactive login API timeout, but continuing to poll for status...');
        message.info('正在等待浏览器登录完成，系统会自动检测登录状态...');
        return;
      }
      
      stopPolling();
      isInteractiveLoginActiveRef.current = false;
      throw error;
    }
  }, [startPolling, stopPolling]);

  // Manual check login status
  const handleCheckStatus = useCallback(async () => {
    try {
      message.loading({ content: '正在检查登录状态...', key: 'checkStatus', duration: 0 });
      const result = await refetchAuthStatus();
      message.destroy('checkStatus');
      
      if (isAuthenticated(result)) {
        handleLoginSuccess();
      } else {
        message.info('尚未登录，请完成浏览器中的登录流程。系统会自动检测登录状态。');
        if (!isInteractiveLoginActiveRef.current) {
          isInteractiveLoginActiveRef.current = true;
          startPolling();
        }
      }
    } catch (error) {
      message.destroy('checkStatus');
      message.error('检查登录状态失败');
      console.error('[InteractiveLogin] Manual status check error:', error);
    }
  }, [refetchAuthStatus, isAuthenticated, handleLoginSuccess, startPolling]);

  return {
    handleInteractiveLogin,
    handleCheckStatus,
    isActive: isInteractiveLoginActiveRef.current,
  };
}

