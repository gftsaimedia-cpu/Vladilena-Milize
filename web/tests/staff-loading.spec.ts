import { expect, test, type Page } from '@playwright/test';
import { openPhone } from './fixtures/staff-phone';

// Dữ liệu chưa về (mock/respond.ts trả muộn theo window.__mockLatencyMs, không page.route): chỗ nội dung hiện dòng
// "Đang tải…" (role="status") thay vì để trống; dữ liệu về thì dòng đó mất.
const loadingLine = (page: Page) => page.getByRole('status').filter({ hasText: 'Đang tải…' });

async function openSlow(page: Page, path: string, size?: { width: number; height: number }) {
  await page.addInitScript(() => ((window as unknown as { __mockLatencyMs: number }).__mockLatencyMs = 1500));
  return openPhone(page, path, size);
}

const PHONE: [string, string][] = [
  ['/nv/hom-nay', 'Yêu cầu của tôi'],
  ['/nv/cham-cong', 'Gần đây'],
  ['/nv/thu-nhap', 'Các khoản'],
  ['/nv/toi', 'Công việc']
];

for (const [path, heading] of PHONE) {
  test(`${path} says Đang tải… until its data arrives`, async ({ page }) => {
    const calls = await openSlow(page, path);
    await expect(loadingLine(page).first()).toBeVisible();
    await expect(page.getByRole('heading', { name: heading })).toBeVisible();
    await expect(loadingLine(page)).toHaveCount(0);
    expect(calls).toEqual([]);
  });
}

test('the desktop columns say Đang tải… until their data arrives', async ({ page }) => {
  const calls = await openSlow(page, '/nv/hom-nay', { width: 1440, height: 900 });
  await expect(loadingLine(page).first()).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Các khoản' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Gần đây' })).toBeVisible();
  await expect(loadingLine(page)).toHaveCount(0);
  expect(calls).toEqual([]);
});
