import { test, expect, type Page } from '@playwright/test';

async function openCapture(page: Page): Promise<void> {
  await page.goto('/#capture=demo');
  await expect(page.getByRole('heading', { name: 'AB12 CDE' })).toBeVisible();
}

async function denyCameraAccess(page: Page): Promise<void> {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: async () => {
          throw new DOMException('Camera access denied by the test.', 'NotAllowedError');
        }
      }
    });
  });
}

test('mobile shell exposes the capture checklist with accessible controls', async ({ page }) => {
  await openCapture(page);

  await expect(page.getByRole('img', { name: 'Collision Engineers' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Photo capture' })).toBeVisible();
  await expect(page.getByText('0 of 2 complete')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Vehicle overview' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Main damage close-up' })).toBeVisible();

  const captureButtons = page.getByRole('button', { name: 'Take photo' });
  await expect(captureButtons).toHaveCount(10);
  await expect(page.getByRole('button', { name: 'Choose File' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Send photos' })).toBeDisabled();

  const firstCaptureButton = captureButtons.first();
  const bounds = await firstCaptureButton.boundingBox();
  expect(bounds?.height).toBeGreaterThanOrEqual(44);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('camera dialog traps keyboard focus, closes with Escape, and restores focus', async ({ page }) => {
  await denyCameraAccess(page);
  await openCapture(page);

  const firstCaptureButton = page.getByRole('button', { name: 'Take photo' }).first();
  await page.keyboard.press('Tab');
  await expect(firstCaptureButton).toBeFocused();
  await page.keyboard.press('Enter');

  const dialog = page.getByRole('dialog', { name: 'Vehicle overview' });
  await expect(dialog).toBeVisible();
  await expect(page.getByRole('alert')).toContainText('Camera permission was denied');

  const closeButton = page.getByRole('button', { name: 'Close camera' });
  const fallbackButton = page.getByRole('button', { name: 'Use phone camera' });
  await expect(closeButton).toBeFocused();

  await page.keyboard.press('Shift+Tab');
  await expect(fallbackButton).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(closeButton).toBeFocused();

  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(firstCaptureButton).toBeFocused();
});

test('camera denial retains a working phone-camera file fallback', async ({ page }) => {
  await denyCameraAccess(page);
  await openCapture(page);

  await page.getByRole('button', { name: 'Take photo' }).first().click();
  await expect(page.getByRole('alert')).toContainText('Camera permission was denied');

  const fileChooserPromise = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Use phone camera' }).click();
  const fileChooser = await fileChooserPromise;
  await fileChooser.setFiles({
    name: 'vehicle-overview__fallback.png',
    mimeType: 'image/png',
    buffer: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
      'base64'
    )
  });

  const review = page.getByRole('dialog', { name: 'Check Vehicle overview' });
  await expect(review).toBeVisible();
  await expect(review.getByRole('img', { name: 'Preview of Vehicle overview' })).toBeVisible();
  await expect(review.getByText(/This checks only brightness, contrast and sharpness/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Retake' }).first()).toBeHidden();

  await review.getByRole('button', { name: 'Use photo', exact: true }).click();
  await expect(review).toBeHidden();
  await expect(page.getByRole('button', { name: 'Retake' }).first()).toBeVisible();
});

test('phone-camera review can be cancelled without queueing the photo', async ({ page }) => {
  await denyCameraAccess(page);
  await openCapture(page);

  await page.getByRole('button', { name: 'Take photo' }).first().click();
  const fileChooserPromise = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Use phone camera' }).click();
  const fileChooser = await fileChooserPromise;
  await fileChooser.setFiles({
    name: 'vehicle-overview__fallback.png',
    mimeType: 'image/png',
    buffer: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
      'base64'
    )
  });

  const review = page.getByRole('dialog', { name: 'Check Vehicle overview' });
  await expect(review).toBeVisible();
  await review.getByRole('button', { name: 'Cancel', exact: true }).click();

  await expect(review).toBeHidden();
  await expect(page.getByRole('button', { name: 'Take photo' }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Retake' })).toHaveCount(0);
});
