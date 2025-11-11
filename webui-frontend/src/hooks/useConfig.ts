import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { configService } from '../services/configService';
import { ConfigData } from '../services/api';
import { useErrorHandler } from './useErrorHandler';

/**
 * Hook for managing configuration
 */
export function useConfig() {
  const queryClient = useQueryClient();
  const { handleError } = useErrorHandler();

  const {
    data: config,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['config'],
    queryFn: () => configService.getConfig(),
  });

  const updateMutation = useMutation({
    mutationFn: (config: Partial<ConfigData>) => configService.updateConfig(config),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['config'] });
    },
    onError: (error) => handleError(error),
  });

  const validateMutation = useMutation({
    mutationFn: (config: Partial<ConfigData>) => configService.validateConfig(config),
    onError: (error) => handleError(error),
  });

  return {
    config: config,
    isLoading,
    error,
    refetch,
    update: updateMutation.mutate,
    updateAsync: updateMutation.mutateAsync,
    isUpdating: updateMutation.isPending,
    validate: validateMutation.mutate,
    validateAsync: validateMutation.mutateAsync,
    isValidating: validateMutation.isPending,
    validationResult: validateMutation.data,
  };
}

/**
 * Hook for managing configuration files
 */
export function useConfigFiles() {
  const queryClient = useQueryClient();
  const { handleError } = useErrorHandler();

  const {
    data: configFiles,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['configFiles'],
    queryFn: () => configService.listConfigFiles(),
  });

  const switchMutation = useMutation({
    mutationFn: (path: string) => configService.switchConfigFile(path),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['configFiles'] });
      queryClient.invalidateQueries({ queryKey: ['config'] });
    },
    onError: (error) => handleError(error),
  });

  const importMutation = useMutation({
    mutationFn: ({ config, name }: { config: Partial<ConfigData>; name?: string }) =>
      configService.importConfigFile(config, name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['configFiles'] });
    },
    onError: (error) => handleError(error),
  });

  const deleteMutation = useMutation({
    mutationFn: (filename: string) => configService.deleteConfigFile(filename),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['configFiles'] });
    },
    onError: (error) => handleError(error),
  });

  return {
    configFiles: configFiles || [],
    isLoading,
    error,
    refetch,
    switchFile: switchMutation.mutate,
    switchFileAsync: switchMutation.mutateAsync,
    isSwitching: switchMutation.isPending,
    importFile: importMutation.mutate,
    importFileAsync: importMutation.mutateAsync,
    isImporting: importMutation.isPending,
    deleteFile: deleteMutation.mutate,
    deleteFileAsync: deleteMutation.mutateAsync,
    isDeleting: deleteMutation.isPending,
  };
}

/**
 * Hook for managing configuration history
 */
export function useConfigHistory() {
  const queryClient = useQueryClient();
  const { handleError } = useErrorHandler();

  const {
    data: history,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['configHistory'],
    queryFn: () => configService.getConfigHistory(),
  });

  const saveMutation = useMutation({
    mutationFn: ({
      name,
      config,
      description,
    }: {
      name: string;
      config: Partial<ConfigData>;
      description?: string;
    }) => configService.saveConfigHistory(name, config, description),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['configHistory'] });
    },
    onError: (error) => handleError(error),
  });

  const applyMutation = useMutation({
    mutationFn: (id: number) => configService.applyConfigHistory(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['configHistory'] });
      queryClient.invalidateQueries({ queryKey: ['config'] });
    },
    onError: (error) => handleError(error),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => configService.deleteConfigHistory(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['configHistory'] });
    },
    onError: (error) => handleError(error),
  });

  return {
    history: history || [],
    isLoading,
    error,
    refetch,
    save: saveMutation.mutate,
    saveAsync: saveMutation.mutateAsync,
    isSaving: saveMutation.isPending,
    apply: applyMutation.mutate,
    applyAsync: applyMutation.mutateAsync,
    isApplying: applyMutation.isPending,
    delete: deleteMutation.mutate,
    deleteAsync: deleteMutation.mutateAsync,
    isDeleting: deleteMutation.isPending,
  };
}

/**
 * Hook for configuration validation
 */
export function useConfigValidation() {
  const { handleError } = useErrorHandler();

  const validateMutation = useMutation({
    mutationFn: (config: Partial<ConfigData>) => configService.validateConfig(config),
    onError: (error) => handleError(error),
  });

  const diagnoseQuery = useQuery({
    queryKey: ['configDiagnose'],
    queryFn: () => configService.diagnoseConfig(),
    enabled: false, // Only run when explicitly called
  });

  const repairMutation = useMutation({
    mutationFn: (createBackup: boolean = true) => configService.repairConfig(createBackup),
    onError: (error) => handleError(error),
  });

  return {
    validate: validateMutation.mutate,
    validateAsync: validateMutation.mutateAsync,
    isValidating: validateMutation.isPending,
    validationResult: validateMutation.data,
    diagnose: diagnoseQuery.refetch,
    isDiagnosing: diagnoseQuery.isFetching,
    diagnoseResult: diagnoseQuery.data,
    repair: repairMutation.mutate,
    repairAsync: repairMutation.mutateAsync,
    isRepairing: repairMutation.isPending,
    repairResult: repairMutation.data,
  };
}

