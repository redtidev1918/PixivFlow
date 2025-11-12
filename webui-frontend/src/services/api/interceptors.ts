import { AxiosInstance, InternalAxiosRequestConfig, AxiosResponse, AxiosError } from 'axios';
import { handleApiError } from './error-handler';

/**
 * Setup request interceptor
 * Handles request configuration, authentication tokens, etc.
 */
export function setupRequestInterceptor(axiosInstance: AxiosInstance): void {
  axiosInstance.interceptors.request.use(
    (config: InternalAxiosRequestConfig) => {
      // Add any auth tokens here if needed in the future
      // Example:
      // const token = getAuthToken();
      // if (token) {
      //   config.headers.Authorization = `Bearer ${token}`;
      // }
      
      return config;
    },
    (error: AxiosError) => {
      // Handle request error
      return Promise.reject(handleApiError(error));
    }
  );
}

/**
 * Setup response interceptor
 * Handles common response processing and error handling
 */
export function setupResponseInterceptor(axiosInstance: AxiosInstance): void {
  axiosInstance.interceptors.response.use(
    (response: AxiosResponse) => {
      // You can process successful responses here if needed
      // For example, logging, data transformation, etc.
      return response;
    },
    (error: AxiosError) => {
      // Handle response errors
      // Convert to ApiError for consistent error handling
      const apiError = handleApiError(error);
      
      // Log error for debugging (only in development)
      if (process.env.NODE_ENV === 'development') {
        console.error('[API Error]', {
          code: apiError.code,
          message: apiError.message,
          statusCode: apiError.statusCode,
          details: apiError.details,
        });
      }
      
      return Promise.reject(apiError);
    }
  );
}

