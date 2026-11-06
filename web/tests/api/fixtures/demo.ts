// Fixture cho test đầu-cuối trên DB demo (web/tests/api/demo-*.spec.ts). Chạy qua `npm run demo -- test <mảng>`:
// lệnh đó đặt DEMO_ACCOUNTS_FILE (file tài khoản) và DEMO_AREAS (các mảng đã seed trong DB đang chạy).
// Chạy thẳng `npm run test:api` thì demoReady = false và các spec demo tự bỏ qua.
import { readFileSync } from 'node:fs';
import { expect, type APIRequestContext, type Page } from '@playwright/test';
import { parseAccounts, type DemoAccounts } from '../../../../scripts/demo/accounts-format';
import { peopleOf, personNamed, type Area, type DemoPerson, type PersonArea } from '../../../../scripts/demo/people/index';

export { addMonths, dateIn, datesOf, demoMonths, todayVN, weekday } from '../../../../scripts/demo/dates';
export { personNamed, type Area, type DemoPerson };

const file = process.env.DEMO_ACCOUNTS_FILE;
const accounts: DemoAccounts | null = file ? parseAccounts(readFileSync(file, 'utf8')) : null;
const seededAreas = (process.env.DEMO_AREAS ?? '').split(',').filter(Boolean) as PersonArea[];
const json = { 'Content-Type': 'application/json' };

/** true khi đang chạy trên một DB demo đã seed. */
export const demoReady = accounts !== null;
/** true khi DB đang chạy có dữ liệu của mảng `area`: `test.skip(!demoReadyFor('payroll'), '…')`. */
export const demoReadyFor = (area: Area): boolean => demoReady && seededAreas.includes(area);

export const ADMIN = accounts?.adminUser ?? 'admin';

export function passwordOf(username: string): string {
  if (!accounts) throw new Error('Chưa có DEMO_ACCOUNTS_FILE: chạy qua npm run demo -- test');
  return username === accounts.adminUser ? accounts.adminPassword : accounts.staffPassword;
}

/** Người đã có trong DB đang chạy (phần nền + các mảng đã seed). */
export const seededPeople = (): DemoPerson[] => peopleOf(seededAreas);

/** Đăng nhập trên trang /dang-nhap, chờ rời trang đăng nhập. */
export async function signIn(page: Page, username: string): Promise<void> {
  await page.goto('/dang-nhap');
  await page.locator('#lg-user').fill(username);
  await page.locator('#lg-pass').fill(passwordOf(username));
  await page.getByRole('button', { name: /đăng nhập/i }).click();
  await expect(page).not.toHaveURL(/\/dang-nhap/);
}

/** Gọi API như `username` bằng `request` của Playwright, rồi đăng xuất. */
export async function apiAs<T>(request: APIRequestContext, username: string, fn: () => Promise<T>): Promise<T> {
  const login = await request.post('/api/v2/auth/login', { headers: json, data: { username, password: passwordOf(username) } });
  expect(login.ok(), `đăng nhập ${username}`).toBeTruthy();
  try {
    return await fn();
  } finally {
    await request.post('/api/v2/auth/logout', { headers: json, data: {} });
  }
}
