import { test, expect } from '@playwright/test';

test('mobile capture flow loads', async ({ page }) => {
  await page.goto('/?token=demo-token');
  await expect(page.getByRole('heading', { name: 'AB12 CDE' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Take photo/i }).first()).toBeVisible();
});

