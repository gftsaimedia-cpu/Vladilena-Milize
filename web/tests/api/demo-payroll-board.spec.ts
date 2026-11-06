// Màn Bảng lương của Admin (/admin/bang-luong) trên BE thật: bảng, ô chỉ số, ngăn kéo phiếu, điểm KPI, duyệt / từ chối,
// tính lại, và các đường dẫn KPI cũ. Chạy qua `npm run demo -- test payroll` (bảng tình huống docs/demo-db/payroll.md).
// Số trên màn so với GET /api/v2/payroll của cùng tháng, không viết cứng. Lỗi đã biết: test.fail(true, 'BUG-payroll-<n>: …').
// Test này ghi: điểm Đồng nghiệp của lg-em m1, duyệt phiếu lg-nam m1, tính lại cả kỳ m0.
import { expect, test, type APIRequestContext, type Locator, type Page } from '@playwright/test';
import { ADMIN, apiAs, demoMonths, demoReadyFor, signIn } from './fixtures/demo';

test.skip(!demoReadyFor('payroll'), 'Chạy qua npm run demo -- test payroll');

const M = demoMonths();
const json = { 'Content-Type': 'application/json' };
const NF0 = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 });
const vnd = (n: number) => NF0.format(Math.round(n));
/** Ô tiền của bảng lương: số 0 hiện "—". */
const cell = (n: number) => (n === 0 ? '—' : vnd(n));
const board = (month: string, slip?: string) => `/admin/bang-luong?thang=${month}${slip ? `&phieu=${slip}` : ''}`;

type Slip = { username: string; status: string; gross: number; insurance: number; tax: number; advance: number; net: number; details: any };

async function apiGet<T = any>(request: APIRequestContext, username: string, path: string): Promise<T> {
  return apiAs(request, username, async () => {
    const r = await request.get(`/api/v2${path}`, { headers: json });
    expect(r.status(), `GET ${path}`).toBe(200);
    return (await r.json()) as T;
  });
}
const slipsOf = async (request: APIRequestContext, month: string): Promise<Slip[]> =>
  (await apiGet<{ items: Slip[] }>(request, ADMIN, `/payroll/${month}`)).items;

/** Lỗi console và phản hồi API ≥ 400 của trang, gom từ lúc gọi tới hết test. */
function watch(page: Page): string[] {
  const out: string[] = [];
  page.on('console', m => m.type() === 'error' && out.push(`console: ${m.text()}`));
  page.on('pageerror', e => out.push(`pageerror: ${e.message}`));
  page.on('response', r => r.url().includes('/api/') && r.status() >= 400 && out.push(`${r.status()} ${r.request().method()} ${r.url()}`));
  return out;
}

const rowOf = (page: Page, username: string): Locator => page.locator('tbody tr').filter({ has: page.locator(`a.nn[data-id="${username}"]`) });
const drawer = (page: Page) => page.locator('.drw');
// Cột của một dòng sau ô tên: Ngày công, Tiền ngày công, Lương KPI, Phụ cấp, Làm thêm, Trừ giờ, Tổng thu nhập, Bảo hiểm,
// Thuế TNCN, Tạm ứng, Thực nhận, Trạng thái.
const STATUS: Record<string, string> = { draft: 'Nháp', approved: 'Đã duyệt', rejected: 'Từ chối' };
const COL = { days: 0, workPay: 1, kpi: 2, allowance: 3, ot: 4, cut: 5, gross: 6, insurance: 7, tax: 8, advance: 9, net: 10, status: 11 };

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await signIn(page, ADMIN);
});

test('the payroll table shows every payslip with the API amounts, and the footer and tiles add them up', async ({ page, request }) => {
  const errors = watch(page);
  for (const month of [M.m1, M.m2, M.m0]) {
    const slips = await slipsOf(request, month);
    await page.goto(board(month));
    await expect(page.locator('tbody tr'), `${month}: một dòng mỗi phiếu`).toHaveCount(slips.length);
    for (const s of slips.filter(x => x.username.startsWith('lg-'))) {
      const td = rowOf(page, s.username).locator('td');
      const d = s.details;
      const who = `${s.username} ${month}`;
      await expect(td.nth(COL.days), who).toHaveText(`${d.actualWorkDays} / ${d.standardWorkdays}`);
      await expect(td.nth(COL.workPay), who).toHaveText(cell(d.baseSalaryActual));
      await expect(td.nth(COL.kpi), who).toContainText(cell(d.kpiActualPay));
      await expect(td.nth(COL.allowance), who).toHaveText(cell(d.totalAllowanceActual));
      await expect(td.nth(COL.ot), who).toHaveText(cell(d.otPayTotal));
      await expect(td.nth(COL.gross), who).toHaveText(cell(s.gross));
      await expect(td.nth(COL.insurance), who).toHaveText(cell(s.insurance));
      await expect(td.nth(COL.tax), who).toHaveText(cell(s.tax));
      await expect(td.nth(COL.advance), who).toHaveText(cell(s.advance));
      await expect(td.nth(COL.net), who).toHaveText(cell(s.net));
      await expect(td.nth(COL.status), who).toHaveText(STATUS[s.status]);
      // Chấm cam khi thiếu điểm KPI (người có KPI).
      const missing = d.kpiApplicable && Object.values(d.kpiScores).some(v => v == null);
      await expect(td.nth(COL.kpi).locator('.kt'), `${who}: chấm cam thiếu điểm`).toHaveCount(missing ? 1 : 0);
    }
    const foot = page.locator('tfoot td');
    const sum = (k: 'gross' | 'insurance' | 'tax' | 'advance' | 'net') => slips.reduce((a, s) => a + s[k], 0);
    await expect(foot.nth(COL.gross), `${month}: tổng thu nhập cuối bảng`).toHaveText(cell(sum('gross')));
    await expect(foot.nth(COL.insurance), month).toHaveText(cell(sum('insurance')));
    await expect(foot.nth(COL.tax), month).toHaveText(cell(sum('tax')));
    await expect(foot.nth(COL.advance), month).toHaveText(cell(sum('advance')));
    await expect(foot.nth(COL.net), `${month}: thực nhận cuối bảng`).toHaveText(cell(sum('net')));
    const approved = slips.filter(s => s.status === 'approved').length;
    await expect(page.getByRole('article', { name: 'Phiếu đã duyệt' }), `${month}: ô Phiếu đã duyệt`).toHaveText(
      new RegExp(`${approved}\\s*/\\s*${slips.length}`)
    );
  }
  expect(errors, 'không lỗi console, không phản hồi lỗi').toEqual([]);
});

test('the late-cut cell shows one minus sign (lg-binh)', async ({ page, request }) => {
  test.fail(true, 'BUG-payroll-7: ô Trừ giờ hiện "−-41.563" (BE trả số âm, FE thêm dấu trừ)');
  const binh = (await slipsOf(request, M.m1)).find(s => s.username === 'lg-binh')!;
  const cut = Math.abs(binh.details.lateEarlyDeductionAmount);
  expect(cut, 'lg-binh m1 có trừ giờ').toBeGreaterThan(0);
  await page.goto(board(M.m1));
  await expect(rowOf(page, 'lg-binh').locator('td').nth(COL.cut)).toHaveText(`−${vnd(cut)}`);
});

test('the payslip drawer shows the API amounts, and an approved payslip offers no decision buttons (lg-an)', async ({ page, request }) => {
  const errors = watch(page);
  const an = (await slipsOf(request, M.m1)).find(s => s.username === 'lg-an')!;
  expect(an.status).toBe('approved');
  await page.goto(board(M.m1, 'lg-an'));
  const drw = drawer(page);
  await expect(drw.getByRole('heading', { name: /Phiếu lương tháng/ })).toBeVisible();
  await expect(drw.locator('tr', { hasText: 'Tổng thu nhập (đ)' })).toContainText(vnd(an.gross));
  await expect(drw.locator('tr', { hasText: 'Lương cơ bản (đ)' })).toContainText(vnd(an.details.baseSalaryActual));
  await expect(drw.locator('tr', { hasText: 'Tổng phụ cấp (đ)' })).toContainText(vnd(an.details.totalAllowanceActual));
  await expect(drw.locator('tr', { hasText: 'Lương KPI (đề xuất → thực tế)' })).toContainText(vnd(an.details.kpiActualPay));
  await expect(drw.locator('tr.net')).toHaveText(new RegExp(`Thực nhận\\s*${vnd(an.net).replace(/\./g, '\\.')} ₫`));
  await expect(drw.getByRole('status')).toHaveText(/Đã duyệt phiếu lương của Lương Văn An\./);
  await expect(drw.getByRole('button', { name: 'Duyệt phiếu' }), 'phiếu đã duyệt: không có nút Duyệt').toHaveCount(0);
  await expect(drw.getByRole('button', { name: 'Từ chối' }), 'phiếu đã duyệt: không có nút Từ chối').toHaveCount(0);
  // Phiếu Nháp thì có hai nút.
  await page.goto(board(M.m1, 'lg-giang'));
  await expect(drawer(page).getByRole('button', { name: 'Duyệt phiếu' })).toBeVisible();
  await expect(drawer(page).getByRole('button', { name: 'Từ chối' })).toBeVisible();
  expect(errors, 'không lỗi console, không phản hồi lỗi').toEqual([]);
});

test('the payslip drawer shows the position type and level of the person (lg-an nv 1, lg-em ctv 2)', async ({ page }) => {
  test.fail(true, 'BUG-payroll-6: ngăn kéo ghi "NV · Bậc 0" cho mọi người');
  await page.goto(board(M.m1, 'lg-an'));
  await expect(drawer(page)).toContainText('NV · Bậc 1');
  await page.goto(board(M.m1, 'lg-em'));
  await expect(drawer(page)).toContainText('CTV · Bậc 2');
});

test('a tts payslip offers no KPI score inputs (lg-hoa)', async ({ page }) => {
  test.fail(true, 'BUG-payroll-8: ngăn kéo vẫn cho nhập 5 điểm KPI cho tts');
  await page.goto(board(M.m1, 'lg-hoa'));
  await expect(drawer(page).getByRole('heading', { name: /Phiếu lương tháng/ })).toBeVisible();
  await expect(drawer(page).getByRole('textbox', { name: /^Điểm .* của Lương Mai Hoa, phần trăm$/ })).toHaveCount(0);
});

test('typing a missing KPI score in the drawer saves it and updates the KPI pay on the drawer and the table (lg-em)', async ({ page, request }) => {
  const errors = watch(page);
  await page.goto(board(M.m1, 'lg-em'));
  const box = drawer(page).getByRole('textbox', { name: 'Điểm Đồng nghiệp của Lương Thu Em, phần trăm' });
  await expect(box).toHaveValue('');
  const saved = page.waitForResponse(r => r.url().includes(`/payroll/${M.m1}/kpi/lg-em`) && r.request().method() === 'PUT');
  const recalculated = page.waitForResponse(r => r.url().includes(`/payroll/${M.m1}/calculate`) && r.request().method() === 'POST');
  await box.click();
  await box.pressSequentially('90');
  await box.press('Tab');
  expect((await saved).status(), 'PUT điểm KPI').toBe(200);
  expect((await recalculated).status(), 'tính lại lg-em').toBe(201);

  const em = (await slipsOf(request, M.m1)).find(s => s.username === 'lg-em')!;
  // Plan seed: Wework 80, Người dùng 70, mức đề xuất 3.000.000; vừa nhập Đồng nghiệp 90; Quản lý, Tự đánh giá còn thiếu (tính 0).
  expect(em.details.kpiScores).toEqual({ wework: 80, user: 70, peer: 90, manager: null, self: null });
  const pct = 0.4 * 80 + 0.24 * 70 + 0.18 * 90;
  expect(Math.abs(em.details.kpiActualPay - (pct / 100) * 3_000_000), 'lương KPI theo trọng số').toBeLessThanOrEqual(1);
  await expect(drawer(page).locator('tr', { hasText: 'Lương KPI (đề xuất → thực tế)' })).toContainText(vnd(em.details.kpiActualPay));
  await expect(drawer(page).locator('tr.net')).toContainText(`${vnd(em.net)} ₫`);
  const kpiCell = rowOf(page, 'lg-em').locator('td').nth(COL.kpi);
  await expect(kpiCell).toContainText(vnd(em.details.kpiActualPay));
  await expect(kpiCell.locator('.kt'), 'còn thiếu điểm: vẫn chấm cam').toHaveCount(1);
  await expect(kpiCell).not.toContainText('Đồng nghiệp');
  await expect(rowOf(page, 'lg-em').locator('td').nth(COL.net)).toHaveText(cell(em.net));
  expect(errors, 'không lỗi console, không phản hồi lỗi').toEqual([]);
});

test('Admin approves a draft payslip in the drawer (lg-nam): the buttons go, the row is approved, the staff app shows it as official', async ({
  page,
  request
}) => {
  const errors = watch(page);
  await page.goto(board(M.m1, 'lg-nam'));
  await drawer(page).getByRole('button', { name: 'Duyệt phiếu' }).click();
  await expect(drawer(page).getByRole('status')).toHaveText(/Đã duyệt phiếu lương của Lương Hải Nam\./);
  await expect(drawer(page).getByRole('button', { name: 'Duyệt phiếu' })).toHaveCount(0);
  await expect(drawer(page).getByRole('button', { name: 'Từ chối' })).toHaveCount(0);
  await expect(rowOf(page, 'lg-nam').locator('td').nth(COL.status)).toHaveText('Đã duyệt');

  const nam = (await slipsOf(request, M.m1)).find(s => s.username === 'lg-nam')!;
  expect(nam.status).toBe('approved');
  const mine = await apiGet(request, 'lg-nam', `/me/income?month=${M.m1}`);
  expect(mine.state, 'app nhân viên: chính thức').toBe('official');
  expect(mine.payslip, 'phiếu chính thức = phiếu Admin vừa duyệt').toEqual(nam.details);
  expect(errors, 'không lỗi console, không phản hồi lỗi').toEqual([]);
});

test('Admin rejects a draft payslip in the drawer with a reason (lg-binh): the buttons go and the row is rejected', async ({ page, request }) => {
  const errors = watch(page);
  await page.goto(board(M.m1, 'lg-binh'));
  await drawer(page).getByRole('button', { name: 'Từ chối' }).click();
  await drawer(page).locator('#pd-reason').fill('Thiếu giải trình ngày trễ');
  await drawer(page).getByRole('button', { name: 'Xác nhận từ chối' }).click();
  await expect(drawer(page).getByRole('status')).toContainText('Đã từ chối phiếu lương của Lương Thị Bình.');
  await expect(drawer(page).getByRole('button', { name: 'Duyệt phiếu' }), 'phiếu đã từ chối: không còn nút').toHaveCount(0);
  await expect(drawer(page).getByRole('button', { name: 'Từ chối' })).toHaveCount(0);
  await expect(rowOf(page, 'lg-binh').locator('td').nth(COL.status)).toHaveText('Từ chối');
  const binh = (await slipsOf(request, M.m1)).find(s => s.username === 'lg-binh')!;
  expect([binh.status, (binh as Slip & { note?: string }).note], 'BE lưu trạng thái và lý do').toEqual(['rejected', 'Thiếu giải trình ngày trễ']);
  expect(errors, 'không lỗi console, không phản hồi lỗi').toEqual([]);
});

test('the drawer of a rejected payslip shows the reason typed when rejecting (lg-binh)', async ({ page }) => {
  test.fail(true, 'BUG-payroll-9: ngăn kéo không hiện lý do từ chối (BE trả note, FE không đọc)');
  await page.goto(board(M.m1, 'lg-binh'));
  await expect(drawer(page).getByRole('status')).toContainText('Đã từ chối phiếu lương của Lương Thị Bình.');
  await expect(drawer(page).getByRole('status')).toContainText('Lý do: Thiếu giải trình ngày trễ');
});

test('"In tất cả" is off when the month has no approved payslip, and on when it has some', async ({ page, request }) => {
  for (const month of [M.m0, M.m1]) {
    const approved = (await slipsOf(request, month)).filter(s => s.status === 'approved').length;
    await page.goto(board(month));
    const btn = page.getByRole('button', { name: 'In tất cả' });
    if (approved) await expect(btn, `${month}: ${approved} phiếu đã duyệt`).toBeEnabled();
    else await expect(btn, `${month}: chưa có phiếu đã duyệt`).toBeDisabled();
  }
});

test('"Tính lại lương" on the current month recalculates every payslip without an error', async ({ page, request }) => {
  test.fail(true, 'BUG-payroll-1: tài khoản admin (loại ql) nằm trong danh sách tính lương, mỗi lần tính báo 1 người lỗi');
  const count = (await slipsOf(request, M.m0)).length;
  await page.goto(board(M.m0));
  await page.getByRole('button', { name: 'Tính lại lương' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Đã tính' })).toHaveText(`Đã tính ${count} phiếu lương.`);
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('/admin/kpi and /admin/kpi/lich-su open the payroll board, keeping the month', async ({ page }) => {
  await page.goto(`/admin/kpi?thang=${M.m1}`);
  await expect(page).toHaveURL(new RegExp(`/admin/bang-luong\\?thang=${M.m1}$`));
  await expect(page.getByRole('heading', { name: 'Bảng lương' })).toBeVisible();
  await page.goto('/admin/kpi/lich-su');
  await expect(page).toHaveURL(/\/admin\/bang-luong$/);
  await expect(page.getByRole('heading', { name: 'Bảng lương' })).toBeVisible();
});

test('the KPI rules settings page (/admin/cai-dat/kpi) loads without a failed request', async ({ page }) => {
  test.fail(true, 'BUG-payroll-12: trang Quy tắc KPI gọi /settings/params và /settings/first-run, BE v2 trả 404, trang trống');
  const errors = watch(page);
  await page.goto('/admin/cai-dat/kpi');
  await expect(page.getByRole('heading', { name: 'Cài đặt' })).toBeVisible();
  await page.waitForLoadState('networkidle');
  expect(errors).toEqual([]);
});
