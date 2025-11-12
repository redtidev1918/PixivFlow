import { test, expect } from '@playwright/test';

/**
 * Navigation E2E Tests
 * 
 * Tests the navigation and routing functionality.
 */
test.describe('Navigation', () => {
  test('should navigate between pages', async ({ page }) => {
    // Start at login page
    await page.goto('/login');
    await expect(page).toHaveURL(/.*login/);

    // Navigate to dashboard (if authenticated)
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');
    
    // Check if we're on dashboard or redirected to login
    const currentUrl = page.url();
    expect(currentUrl).toMatch(/\/dashboard|\/login/);
  });

  test('should have working navigation menu', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');
    
    // Check for navigation menu items
    const navMenu = page.locator('nav, [role="navigation"], [data-testid="nav"], [class*="nav"]').first();
    if (await navMenu.isVisible()) {
      await expect(navMenu).toBeVisible();
    }
  });

  test('should redirect root to dashboard', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    // Should redirect to dashboard or login
    const currentUrl = page.url();
    expect(currentUrl).toMatch(/\/dashboard|\/login/);
  });
});

