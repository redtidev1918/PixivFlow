/**
 * Authorization code extraction utilities
 */

import { Page } from 'puppeteer';

/**
 * Wait for authorization code from redirect URL
 */
export async function waitForAuthCode(page: Page, timeoutMs: number): Promise<string | null> {
  return new Promise((resolve) => {
    let resolved = false;
    let pollInterval: NodeJS.Timeout | null = null;
    
    // Cleanup function to ensure all listeners are removed
    const cleanup = () => {
      if (resolved) return;
      resolved = true;
      try {
        page.off('response', onResponse);
        page.off('framenavigated', onFrameNavigated);
        if (pollInterval) {
          clearInterval(pollInterval);
          pollInterval = null;
        }
      } catch (e) {
        // Ignore cleanup errors
      }
    };

    const timeout = setTimeout(() => {
      if (!resolved) {
        cleanup();
        console.log('[!]: Timeout waiting for authorization code');
        resolve(null);
      }
    }, timeoutMs);

    // Function to check and extract code from URL
    const checkUrlForCode = (url: string): string | null => {
      try {
        const urlObj = new URL(url);
        const code = urlObj.searchParams.get('code');
        if (code) {
          console.log('[+]: Found authorization code in URL');
          return code;
        }
      } catch (e) {
        // Invalid URL, ignore
      }
      return null;
    };

    // Check current URL immediately
    try {
      const currentUrl = page.url();
      const currentCode = checkUrlForCode(currentUrl);
      if (currentCode) {
        cleanup();
        clearTimeout(timeout);
        resolve(currentCode);
        return;
      }
    } catch (e) {
      // Continue with listeners if immediate check fails
    }

    // Listen for navigation events
    const onResponse = async (response: any) => {
      if (resolved) return;
      
      try {
        const url = response.url();
        const code = checkUrlForCode(url);
        if (code) {
          cleanup();
          clearTimeout(timeout);
          resolve(code);
        }
      } catch (e) {
        // Ignore errors
      }
    };

    const onFrameNavigated = async (frame: any) => {
      if (resolved || frame !== page.mainFrame()) return;
      
      try {
        const url = frame.url();
        const code = checkUrlForCode(url);
        if (code) {
          cleanup();
          clearTimeout(timeout);
          resolve(code);
        }
      } catch (e) {
        // Ignore errors
      }
    };

    // Also poll the URL periodically as a fallback
    pollInterval = setInterval(async () => {
      if (resolved) {
        if (pollInterval) {
          clearInterval(pollInterval);
        }
        return;
      }

      try {
        const url = page.url();
        const code = checkUrlForCode(url);
        if (code) {
          cleanup();
          clearTimeout(timeout);
          resolve(code);
        }
      } catch (e) {
        // Ignore errors
      }
    }, 1000); // Check every second

    // Set up listeners
    page.on('response', onResponse);
    page.on('framenavigated', onFrameNavigated);

    // Also wait for the specific redirect URI as before (for compatibility)
    // Use a shorter timeout for waitForFunction to avoid conflicts
    const waitForFunctionTimeout = Math.min(timeoutMs, 60000);
    page.waitForFunction(
      () => {
        // @ts-ignore - This code runs in browser context
        const url = window.location.href;
        // Check if URL contains code parameter
        try {
          return new URL(url).searchParams.has('code');
        } catch {
          return false;
        }
      },
      { timeout: waitForFunctionTimeout }
    ).then(() => {
      if (!resolved) {
        try {
          const url = page.url();
          const code = checkUrlForCode(url);
          if (code) {
            cleanup();
            clearTimeout(timeout);
            resolve(code);
          }
        } catch (e) {
          // If we reach here but no code found, continue waiting
        }
      }
    }).catch(() => {
      // Timeout or error - will be handled by the main timeout
      // Don't resolve here, let the main timeout handle it
    });
  });
}




























































