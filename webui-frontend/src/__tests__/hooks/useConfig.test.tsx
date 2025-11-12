import React from 'react';
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  useConfig,
  useConfigFiles,
  useConfigHistory,
  useConfigValidation,
} from '../../hooks/useConfig';
import { configService } from '../../services/configService';

// Mock the config service
jest.mock('../../services/configService', () => ({
  configService: {
    getConfig: jest.fn(),
    updateConfig: jest.fn(),
    validateConfig: jest.fn(),
    listConfigFiles: jest.fn(),
    switchConfigFile: jest.fn(),
    importConfigFile: jest.fn(),
    deleteConfigFile: jest.fn(),
    getConfigHistory: jest.fn(),
    saveConfigHistory: jest.fn(),
    applyConfigHistory: jest.fn(),
    deleteConfigHistory: jest.fn(),
    diagnoseConfig: jest.fn(),
    repairConfig: jest.fn(),
  },
}));

// Mock useErrorHandler
jest.mock('../../hooks/useErrorHandler', () => ({
  useErrorHandler: () => ({
    handleError: jest.fn(),
  }),
}));

describe('useConfig', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    });
    jest.clearAllMocks();
  });

  const createWrapper = () => {
    return ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };

  describe('useConfig', () => {
    it('should fetch config successfully', async () => {
      const mockConfig = {
        storage: {
          downloadDirectory: '/downloads',
        },
        download: {
          concurrency: 5,
        },
      };

      (configService.getConfig as jest.Mock).mockResolvedValue(mockConfig);

      const { result } = renderHook(() => useConfig(), { wrapper: createWrapper() });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.config).toEqual(mockConfig);
      expect(configService.getConfig).toHaveBeenCalledTimes(1);
    });

    it('should update config successfully', async () => {
      const mockConfig = {
        storage: {
          downloadDirectory: '/downloads',
        },
        download: {
          concurrency: 5,
        },
      };

      const updatedConfig = {
        storage: {
          downloadDirectory: '/new-downloads',
        },
        download: {
          concurrency: 10,
        },
      };

      (configService.getConfig as jest.Mock).mockResolvedValue(mockConfig);
      (configService.updateConfig as jest.Mock).mockResolvedValue(updatedConfig);

      const { result } = renderHook(() => useConfig(), { wrapper: createWrapper() });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await result.current.updateAsync(updatedConfig);

      expect(configService.updateConfig).toHaveBeenCalledWith(updatedConfig);
    });

    it('should validate config successfully', async () => {
      const mockConfig = {
        storage: {
          downloadDirectory: '/downloads',
        },
        download: {
          concurrency: 5,
        },
      };

      const validationResult = {
        valid: true,
        errors: [],
      };

      (configService.getConfig as jest.Mock).mockResolvedValue(mockConfig);
      (configService.validateConfig as jest.Mock).mockResolvedValue(validationResult);

      const { result } = renderHook(() => useConfig(), { wrapper: createWrapper() });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await result.current.validateAsync(mockConfig);

      expect(configService.validateConfig).toHaveBeenCalledWith(mockConfig);
      
      await waitFor(() => {
        expect(result.current.validationResult).toEqual(validationResult);
      });
    });

    it('should handle config update error', async () => {
      const mockConfig = {
        storage: {
          downloadDirectory: '/downloads',
        },
        download: {
          concurrency: 5,
        },
      };

      const error = new Error('Update failed');
      (configService.getConfig as jest.Mock).mockResolvedValue(mockConfig);
      (configService.updateConfig as jest.Mock).mockRejectedValue(error);

      const { result } = renderHook(() => useConfig(), { wrapper: createWrapper() });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await expect(
        result.current.updateAsync({ storage: { downloadDirectory: '/invalid' } })
      ).rejects.toThrow('Update failed');
    });
  });

  describe('useConfigFiles', () => {
    it('should fetch config files successfully', async () => {
      const mockConfigFiles = [
        { name: 'config1.json', path: '/path/to/config1.json' },
        { name: 'config2.json', path: '/path/to/config2.json' },
      ];

      (configService.listConfigFiles as jest.Mock).mockResolvedValue(mockConfigFiles);

      const { result } = renderHook(() => useConfigFiles(), { wrapper: createWrapper() });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.configFiles).toEqual(mockConfigFiles);
      expect(configService.listConfigFiles).toHaveBeenCalledTimes(1);
    });

    it('should switch config file successfully', async () => {
      const mockConfigFiles = [
        { name: 'config1.json', path: '/path/to/config1.json' },
      ];

      (configService.listConfigFiles as jest.Mock).mockResolvedValue(mockConfigFiles);
      (configService.switchConfigFile as jest.Mock).mockResolvedValue(undefined);

      const { result } = renderHook(() => useConfigFiles(), { wrapper: createWrapper() });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await result.current.switchFileAsync('/path/to/config1.json');

      expect(configService.switchConfigFile).toHaveBeenCalledWith('/path/to/config1.json');
    });

    it('should import config file successfully', async () => {
      const mockConfigFiles = [];
      const newConfig = {
        name: 'new-config.json',
        path: '/path/to/new-config.json',
      };

      (configService.listConfigFiles as jest.Mock).mockResolvedValue(mockConfigFiles);
      (configService.importConfigFile as jest.Mock).mockResolvedValue(newConfig);

      const { result } = renderHook(() => useConfigFiles(), { wrapper: createWrapper() });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await result.current.importFileAsync({
        config: { storage: { downloadDirectory: '/downloads' } },
        name: 'new-config',
      });

      expect(configService.importConfigFile).toHaveBeenCalledWith(
        { storage: { downloadDirectory: '/downloads' } },
        'new-config'
      );
    });

    it('should delete config file successfully', async () => {
      const mockConfigFiles = [
        { name: 'config1.json', path: '/path/to/config1.json' },
      ];

      (configService.listConfigFiles as jest.Mock).mockResolvedValue(mockConfigFiles);
      (configService.deleteConfigFile as jest.Mock).mockResolvedValue(undefined);

      const { result } = renderHook(() => useConfigFiles(), { wrapper: createWrapper() });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await result.current.deleteFileAsync('config1.json');

      expect(configService.deleteConfigFile).toHaveBeenCalledWith('config1.json');
    });
  });

  describe('useConfigHistory', () => {
    it('should fetch config history successfully', async () => {
      const mockHistory = [
        {
          id: 1,
          name: 'Backup 1',
          description: 'First backup',
          createdAt: '2025-01-01T00:00:00Z',
        },
        {
          id: 2,
          name: 'Backup 2',
          description: 'Second backup',
          createdAt: '2025-01-02T00:00:00Z',
        },
      ];

      (configService.getConfigHistory as jest.Mock).mockResolvedValue(mockHistory);

      const { result } = renderHook(() => useConfigHistory(), { wrapper: createWrapper() });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.history).toEqual(mockHistory);
      expect(configService.getConfigHistory).toHaveBeenCalledTimes(1);
    });

    it('should save config history successfully', async () => {
      const mockHistory = [];
      const newHistoryItem = {
        id: 1,
        name: 'Backup 1',
        description: 'First backup',
        createdAt: '2025-01-01T00:00:00Z',
      };

      (configService.getConfigHistory as jest.Mock).mockResolvedValue(mockHistory);
      (configService.saveConfigHistory as jest.Mock).mockResolvedValue(newHistoryItem);

      const { result } = renderHook(() => useConfigHistory(), { wrapper: createWrapper() });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await result.current.saveAsync({
        name: 'Backup 1',
        config: { storage: { downloadDirectory: '/downloads' } },
        description: 'First backup',
      });

      expect(configService.saveConfigHistory).toHaveBeenCalledWith(
        'Backup 1',
        { storage: { downloadDirectory: '/downloads' } },
        'First backup'
      );
    });

    it('should apply config history successfully', async () => {
      const mockHistory = [
        {
          id: 1,
          name: 'Backup 1',
          description: 'First backup',
          createdAt: '2025-01-01T00:00:00Z',
        },
      ];

      (configService.getConfigHistory as jest.Mock).mockResolvedValue(mockHistory);
      (configService.applyConfigHistory as jest.Mock).mockResolvedValue(undefined);

      const { result } = renderHook(() => useConfigHistory(), { wrapper: createWrapper() });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await result.current.applyAsync(1);

      expect(configService.applyConfigHistory).toHaveBeenCalledWith(1);
    });

    it('should delete config history successfully', async () => {
      const mockHistory = [
        {
          id: 1,
          name: 'Backup 1',
          description: 'First backup',
          createdAt: '2025-01-01T00:00:00Z',
        },
      ];

      (configService.getConfigHistory as jest.Mock).mockResolvedValue(mockHistory);
      (configService.deleteConfigHistory as jest.Mock).mockResolvedValue(undefined);

      const { result } = renderHook(() => useConfigHistory(), { wrapper: createWrapper() });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await result.current.deleteAsync(1);

      expect(configService.deleteConfigHistory).toHaveBeenCalledWith(1);
    });
  });

  describe('useConfigValidation', () => {
    it('should validate config successfully', async () => {
      const validationResult = {
        valid: true,
        errors: [],
      };

      (configService.validateConfig as jest.Mock).mockResolvedValue(validationResult);

      const { result } = renderHook(() => useConfigValidation(), { wrapper: createWrapper() });

      await result.current.validateAsync({ storage: { downloadDirectory: '/downloads' } });

      expect(configService.validateConfig).toHaveBeenCalledWith({
        storage: { downloadDirectory: '/downloads' },
      });
      
      await waitFor(() => {
        expect(result.current.validationResult).toEqual(validationResult);
      });
    });

    it('should diagnose config successfully', async () => {
      const diagnoseResult = {
        issues: [],
        suggestions: [],
      };

      (configService.diagnoseConfig as jest.Mock).mockResolvedValue(diagnoseResult);

      const { result } = renderHook(() => useConfigValidation(), { wrapper: createWrapper() });

      await result.current.diagnose();

      expect(configService.diagnoseConfig).toHaveBeenCalledTimes(1);
      
      await waitFor(() => {
        expect(result.current.diagnoseResult).toEqual(diagnoseResult);
      });
    });

    it('should repair config successfully', async () => {
      const repairResult = {
        fixed: true,
        backupPath: '/backup/path',
      };

      (configService.repairConfig as jest.Mock).mockResolvedValue(repairResult);

      const { result } = renderHook(() => useConfigValidation(), { wrapper: createWrapper() });

      await result.current.repairAsync(true);

      expect(configService.repairConfig).toHaveBeenCalledWith(true);
      
      await waitFor(() => {
        expect(result.current.repairResult).toEqual(repairResult);
      });
    });

    it('should handle validation error', async () => {
      const error = new Error('Validation failed');
      (configService.validateConfig as jest.Mock).mockRejectedValue(error);

      const { result } = renderHook(() => useConfigValidation(), { wrapper: createWrapper() });

      await expect(
        result.current.validateAsync({ storage: { downloadDirectory: '/invalid' } })
      ).rejects.toThrow('Validation failed');
    });
  });
});

