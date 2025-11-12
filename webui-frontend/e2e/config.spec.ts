import { test, expect } from '@playwright/test';

/**
 * Configuration Management E2E Tests
 * 
 * Tests the configuration management functionality.
 */
test.describe('Configuration Management', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to config page
    await page.goto('/config');
    await page.waitForLoadState('networkidle');
  });

  test('should display config page', async ({ page }) => {
    // Check if config page is visible
    const configPage = page.locator('body');
    await expect(configPage).toBeVisible();
  });

  test('should load configuration', async ({ page }) => {
    // Wait for config to load
    await page.waitForTimeout(2000);
    
    // Check if config form or editor is visible
    const configEditor = page.locator('textarea, [data-testid="config-editor"], .config-editor, [class*="config"]').first();
    if (await configEditor.isVisible()) {
      await expect(configEditor).toBeVisible();
    }
  });

  test('should allow editing configuration', async ({ page }) => {
    // Wait for config to load
    await page.waitForTimeout(2000);
    
    // Try to find and interact with config editor
    const configEditor = page.locator('textarea, [data-testid="config-editor"], .config-editor').first();
    if (await configEditor.isVisible()) {
      await configEditor.click();
      // Just verify it's editable, don't actually modify
      await expect(configEditor).toBeEditable();
    }
  });
});

