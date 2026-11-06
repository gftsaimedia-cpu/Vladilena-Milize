// Trang in phiếu lương A4 (/in/phieu-luong/:month và /in/phieu-luong/:month/:username) trên BE thật.
// Chạy qua `npm run demo -- test payroll` (bảng tình huống docs/demo-db/payroll.md). Bất biến: bản in = phiếu trong ngăn
// kéo = GET /api/v2/payroll/:month/:username. Chỉ đọc. Lỗi đã biết: test.fail(true, 'BUG-payroll-<n>: …').
// Bố cục A4 mới (spec 2026-11-05-payslip-a4-redesign-design.md) còn chờ duyệt: test chỉ so tên, tháng và Thực nhận.
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { ADMIN, apiAs, demoMonths, demoReadyFor, signIn } from './fixtures/demo';

test.skip(!demoReadyFor('payroll'), 'Chạy qua npm run demo -- test payroll');

const M = demoMonths();
const json = { 'Content-Type': 'application/json' };
const NF0 = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 });
const vnd = (n: number) => NF0.format(Math.round(n));

type Slip = { username: string; status: string; net: number; details: { fullName: string } };

async function slipsOf(request: APIRequestContext, month: string): Promise<Slip[]> {
  return apiAs(request, ADMIN, async () => {
    const r = await request.get(`/api/v2/payroll/${month}`, { headers: json });
    expect(r.status()).toBe(200);
    return (await r.json()).items as Slip[];
  });
}

function watch(page: Page): string[] {
  const out: string[] = [];
  page.on('console', m => m.type() === 'error' && out.push(`console: ${m.text()}`));
  page.on('response', r => r.url().includes('/api/') && r.status() >= 400 && out.push(`${r.status()} ${r.url()}`));
  return out;
}

test.beforeEach(async ({ page }) => {
  await signIn(page, ADMIN);
});

test('printing one approved payslip shows that person and the same Thực nhận as the drawer (lg-an)', async ({ page, request }) => {
  test.fail(true, 'BUG-payroll-10: trang in một phiếu hiện dữ liệu mẫu ("NV thử nghiệm"), không đọc phiếu thật');
  const an = (await slipsOf(request, M.m1)).find(s => s.username === 'lg-an')!;
  expect(an.status).toBe('approved');
  const errors = watch(page);
  await page.goto(`/in/phieu-luong/${M.m1}/lg-an`);
  await expect(page.getByText('Đang chuẩn bị bản in…')).toHaveCount(0);
  await expect(page.getByText(an.details.fullName).first()).toBeVisible();
  await expect(page.getByText(`${vnd(an.net)} ₫`).first()).toBeVisible();
  await expect(page.getByText('NV thử nghiệm')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('printing the month shows every approved payslip and nothing else', async ({ page, request }) => {
  test.fail(true, 'BUG-payroll-11: trang in cả kỳ gọi /api/v2/periods/:month/payslips (v1), BE v2 trả 404: "Không tải được phiếu lương."');
  const slips = await slipsOf(request, M.m1);
  const approved = slips.filter(s => s.status === 'approved');
  expect(approved.length, 'm1 có phiếu đã duyệt').toBeGreaterThan(0);
  const errors = watch(page);
  await page.goto(`/in/phieu-luong/${M.m1}`);
  await expect(page.getByText('Không tải được phiếu lương.')).toHaveCount(0);
  for (const s of approved) await expect(page.getByText(s.details.fullName).first(), s.username).toBeVisible();
  for (const s of slips.filter(x => x.status !== 'approved' && x.username.startsWith('lg-'))) {
    await expect(page.getByText(s.details.fullName), `${s.username} chưa duyệt: không in`).toHaveCount(0);
  }
  expect(errors).toEqual([]);
});
