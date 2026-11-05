// Màn Thu nhập của nhân viên (/nv/thu-nhap) trên BE thật: điện thoại (dưới 1136px, có chuyển tháng) và máy tính
// (từ 1136px, cột Thu nhập của tháng này). Chạy qua `npm run demo -- test payroll` (bảng tình huống docs/demo-db/payroll.md).
// Số trên màn so với GET /api/v2/me/income của chính người đó và GET /api/v2/payroll của Admin. Chỉ đọc.
// Lỗi đã biết: test.fail(true, 'BUG-payroll-<n>: …').
import { expect, test, type APIRequestContext, type Locator, type Page } from '@playwright/test';
import { ADMIN, apiAs, demoMonths, demoReadyFor, signIn } from './fixtures/demo';

test.skip(!demoReadyFor('payroll'), 'Chạy qua npm run demo -- test payroll');

const M = demoMonths();
const json = { 'Content-Type': 'application/json' };
const NF0 = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 });
const vnd = (n: number) => NF0.format(Math.round(n));
const label = (month: string) => `Tháng ${Number(month.slice(5, 7))}/${month.slice(0, 4)}`;
/** "−630.000" / "6.230.769" / "0" → số. */
const amount = (text: string) => Number(text.replace('₫', '').replace(/\s/g, '').replace('−', '-').replace(/\./g, '')) || 0;
const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1280, height: 900 };

async function apiGet<T = any>(request: APIRequestContext, username: string, path: string): Promise<T> {
  return apiAs(request, username, async () => {
    const r = await request.get(`/api/v2${path}`, { headers: json });
    expect(r.status(), `GET ${path} như ${username}`).toBe(200);
    return (await r.json()) as T;
  });
}
const incomeOf = (request: APIRequestContext, username: string, month: string) => apiGet(request, username, `/me/income?month=${month}`);
const adminSlip = async (request: APIRequestContext, month: string, username: string) =>
  (await apiGet(request, ADMIN, `/payroll/${month}/${username}`)).payslip;

function watch(page: Page): string[] {
  const out: string[] = [];
  page.on('console', m => m.type() === 'error' && out.push(`console: ${m.text()}`));
  page.on('pageerror', e => out.push(`pageerror: ${e.message}`));
  page.on('response', r => r.url().includes('/api/') && r.status() >= 400 && out.push(`${r.status()} ${r.url()}`));
  return out;
}

const monthSwitch = (page: Page) => page.locator('.mon');
const hero = (page: Page) => page.locator('section.hero');
const lines = (page: Page) => page.locator('.ls .ro');
const total = (page: Page) => page.locator('.ls .tot');

async function linesOf(page: Page): Promise<{ label: string; value: number }[]> {
  const out: { label: string; value: number }[] = [];
  for (const row of await lines(page).all()) {
    out.push({ label: (await row.locator('.t').innerText()).trim(), value: amount(await row.locator('.v').innerText()) });
  }
  return out;
}
async function goToMonth(page: Page, month: string) {
  const ml = monthSwitch(page).locator('.ml');
  for (let i = 0; i < 3; i++) {
    const now = await ml.innerText();
    if (now.includes(label(month))) break;
    await page.getByRole('button', { name: 'Tháng trước' }).click();
    await expect(ml).not.toHaveText(now);
  }
  await expect(ml).toHaveText(label(month));
}
const sumOf = async (page: Page) => (await linesOf(page)).reduce((a, l) => a + l.value, 0);

test('phone: the current month is an estimate equal to /me/income, with no insurance or tax line and no "chưa trừ" note (lg-an)', async ({
  page,
  request
}) => {
  const inc = await incomeOf(request, 'lg-an', M.m0);
  expect(inc.state).toBe('estimate');
  const errors = watch(page);
  await page.setViewportSize(PHONE);
  await signIn(page, 'lg-an');
  await page.goto('/nv/thu-nhap');
  await expect(monthSwitch(page)).toContainText(label(M.m0));
  await expect(monthSwitch(page)).toContainText('Tạm tính');
  await expect(hero(page).locator('.amt')).toHaveText(`${vnd(inc.payslip.netIncome)} ₫`);
  await expect(hero(page)).toContainText(vnd(inc.payslip.grossIncome));
  const ls = await linesOf(page);
  expect(ls.map(l => l.label)).not.toContain('Bảo hiểm bắt buộc');
  expect(ls.map(l => l.label)).not.toContain('Thuế TNCN');
  await expect(total(page)).toHaveText(new RegExp(`Thực nhận\\s*${vnd(inc.payslip.netIncome).replace(/\./g, '\\.')} ₫`));
  expect(await sumOf(page), 'các khoản cộng lại = Thực nhận').toBe(inc.payslip.netIncome);
  await expect(page.getByText(/chưa trừ/i)).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Tháng sau' }), 'tháng này: không có tháng sau').toBeDisabled();
  expect(errors).toEqual([]);
});

test('phone: an approved month is official and equal to the Admin payslip, and its lines add up to Thực nhận (lg-an m1, lg-khanh m1)', async ({
  page,
  request
}) => {
  for (const u of ['lg-an', 'lg-khanh']) {
    const admin = await adminSlip(request, M.m1, u);
    expect(admin.status, `${u} m1 đã duyệt`).toBe('approved');
    const errors = watch(page);
    await page.setViewportSize(PHONE);
    await signIn(page, u);
    await page.goto('/nv/thu-nhap');
    await goToMonth(page, M.m1);
    await expect(monthSwitch(page), u).toContainText('Chính thức');
    await expect(hero(page).locator('.amt'), u).toHaveText(`${vnd(admin.net)} ₫`);
    const ls = await linesOf(page);
    expect(ls.find(l => l.label === 'Bảo hiểm bắt buộc')?.value, `${u}: dòng BH`).toBe(-admin.insurance || 0);
    expect(ls.find(l => l.label === 'Thuế TNCN')?.value, `${u}: dòng thuế`).toBe(-admin.tax || 0);
    expect(await sumOf(page), `${u}: các khoản cộng lại = Thực nhận`).toBe(admin.net);
    await expect(total(page), u).toContainText(`${vnd(admin.net)} ₫`);
    expect(errors, u).toEqual([]);
    await page.context().clearCookies();
  }
});

test('phone: an official payslip is not labelled "dự kiến" (lg-an m1)', async ({ page }) => {
  test.fail(true, 'BUG-payroll-14: thẻ Thực nhận luôn ghi "Thực nhận dự kiến", kể cả phiếu chính thức');
  await page.setViewportSize(PHONE);
  await signIn(page, 'lg-an');
  await page.goto('/nv/thu-nhap');
  await goToMonth(page, M.m1);
  await expect(monthSwitch(page)).toContainText('Chính thức');
  await expect(hero(page)).not.toContainText('dự kiến');
});

test('phone: the month switch stops at the first month the person can see and at the current month (lg-lan joined in m1)', async ({
  page,
  request
}) => {
  const errors = watch(page);
  const range = (await incomeOf(request, 'lg-lan', M.m0)).range;
  expect(range, 'lg-lan xem được từ tháng vào làm').toEqual({ from: M.m1, to: M.m0 });
  await page.setViewportSize(PHONE);
  await signIn(page, 'lg-lan');
  await page.goto('/nv/thu-nhap');
  await expect(page.getByRole('button', { name: 'Tháng sau' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Tháng trước' })).toBeEnabled();
  await goToMonth(page, M.m1);
  await expect(page.getByRole('button', { name: 'Tháng trước' }), 'không có tháng trước ngày vào làm').toBeDisabled();
  await expect(page.getByRole('button', { name: 'Tháng sau' })).toBeEnabled();
  expect(errors).toEqual([]);
});

test('phone: the income lines add up to Thực nhận when the month has OT and an advance (lg-chi m1)', async ({ page, request }) => {
  test.fail(true, 'BUG-payroll-13: các khoản của app nhân viên bỏ sót OT, trừ giờ và tạm ứng, cộng lại không ra Thực nhận');
  const inc = await incomeOf(request, 'lg-chi', M.m1);
  expect(inc.payslip.otPayTotal, 'lg-chi m1 có OT').toBeGreaterThan(0);
  expect(inc.payslip.advanceDeduction, 'lg-chi m1 có tạm ứng').toBeGreaterThan(0);
  await page.setViewportSize(PHONE);
  await signIn(page, 'lg-chi');
  await page.goto('/nv/thu-nhap');
  await goToMonth(page, M.m1);
  await expect(hero(page).locator('.amt')).toHaveText(`${vnd(inc.payslip.netIncome)} ₫`);
  expect(await sumOf(page), 'các khoản cộng lại = Thực nhận').toBe(inc.payslip.netIncome);
});

test('desktop (from 1136px): the income column shows the current-month estimate equal to /me/income (lg-khanh)', async ({ page, request }) => {
  const inc = await incomeOf(request, 'lg-khanh', M.m0);
  expect(inc.state).toBe('estimate');
  const errors = watch(page);
  await page.setViewportSize(DESKTOP);
  await signIn(page, 'lg-khanh');
  await page.goto('/nv/thu-nhap');
  const col: Locator = page.locator('.sd-col').filter({ has: page.getByRole('heading', { name: 'Thu nhập', exact: true }) });
  await expect(col).toContainText(`${label(M.m0)} · tạm tính`);
  await expect(col.locator('section.hero .amt')).toHaveText(`${vnd(inc.payslip.netIncome)} ₫`);
  await expect(col.locator('.ls .tot')).toContainText(`${vnd(inc.payslip.netIncome)} ₫`);
  await expect(col.getByText(/chưa trừ/i)).toHaveCount(0);
  await expect(col.locator('.mon'), 'cột Thu nhập trên máy tính: không có chuyển tháng').toHaveCount(0);
  expect(errors).toEqual([]);
});
