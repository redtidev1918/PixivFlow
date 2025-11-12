/**
 * Environment detection utilities
 */

/**
 * Check if we're running in an Electron environment
 * Uses type-safe utility from type-guards
 */
export function isElectronEnvironment(): boolean {
  const { isElectronEnvironment: checkElectron } = require('../utils/type-guards');
  return checkElectron();
}

/**
 * Check if Puppeteer is available and can actually launch a browser
 * In Electron environments, Puppeteer might not be able to launch a browser
 */
export async function checkPuppeteerAvailable(): Promise<boolean> {
  try {
    // Check if we're in an Electron environment
    if (isElectronEnvironment()) {
      console.log('[Puppeteer] Detected Electron environment - Puppeteer may not work properly');
      console.log('[Puppeteer] In Electron apps, it\'s recommended to use Electron\'s built-in login window instead');
      // In Electron, we'll still try, but expect it might fail
      // The actual availability will be tested when we try to launch
    }
    
    // Try to import puppeteer
    // Use dynamic import to handle cases where module might not be available
    const puppeteer = await import('puppeteer');
    
    // Verify that puppeteer has the expected exports
    if (!puppeteer || typeof puppeteer.launch !== 'function') {
      console.warn('[Puppeteer] Module imported but missing expected exports');
      return false;
    }
    
    // In Electron environments, we might not be able to launch a separate browser
    // So we just check if the module can be imported and has the expected API
    // The actual browser launch will be tested during login
    return true;
  } catch (error: any) {
    // Log the error for debugging
    const errorMessage = error?.message || String(error);
    const errorCode = error?.code;
    
    // Check if it's a module not found error
    if (errorCode === 'MODULE_NOT_FOUND' || errorMessage.includes('Cannot find module')) {
      console.error('[Puppeteer] Module not found. Please ensure puppeteer is installed:', errorMessage);
    } else {
      console.error('[Puppeteer] Import failed:', errorMessage, errorCode);
    }
    
    return false;
  }
}
























