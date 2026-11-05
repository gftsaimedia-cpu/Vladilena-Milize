// Mảng staff, phần Cài đặt: Chế độ theo loại, Chức vụ và bậc (+ route /positions), Phân quyền (vai trò, tài khoản,
// xử lý yêu cầu), Tất cả cài đặt, Nhật ký (+ route /system/audit) và route /system/settings.
// Luật (a): spec 2026-11-05-positions-settings-design.md (P1–P9, mục 3–5), 2026-11-05-audit-log-design.md (mục 5, 7),
// 2026-11-05-fe-be-auth-foundation-design.md (mục 5). Ghi chức vụ chỉ từ tháng thứ 6 tính từ tháng này, để không đổi
// lương của ba tháng demo mà các mảng khác đang dùng.
// Chạy qua `npm run demo -- test staff`. Bảng tình huống, lỗi và câu hỏi: docs/demo-db/staff.md.
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { ADMIN, addMonths, apiAs, demoMonths, demoReadyFor, passwordOf, signIn, todayVN } from './fixtures/demo';
import { anonymous, json, sessionOf, tryLogin, watchPage } from './demo-staff-support';

test.skip(!demoReadyFor('staff'), 'Chạy qua npm run demo -- test staff');

const DESKTOP = { width: 1440, height: 900 };
const { m0, m1 } = demoMonths();
/** Tháng cuối trong 6 tháng mà màn cho chọn (P1, mục 5.2). */
const FAR = addMonths(m0, 5);
/** Nhãn tháng trong hộp chọn tháng áp dụng: "Tháng 04/2027" (tháng có số 0 đứng trước). */
const monthText = (ym: string) => `Tháng ${ym.slice(5, 7)}/${ym.slice(0, 4)}`;

type Version = { code: string; effective_month: string; rev: number; flex_pct: number; levels: Array<{ level_no: number; effective_month: string; rev: number }> };

async function catalog(request: APIRequestContext): Promise<Version[]> {
  return apiAs(request, ADMIN, async () => (await (await request.get('/api/v2/employees/meta/positions')).json()).positions);
}
/** Phiên bản có hiệu lực ở tháng `ym`: mới nhất có tháng áp dụng ≤ ym (spec positions-settings 3.3). */
const inEffect = (rows: Version[], code: string, ym: string) =>
  rows.filter(r => r.code === code && r.effective_month <= ym).sort((a, b) => b.effective_month.localeCompare(a.effective_month))[0];
/** Bậc lớn nhất của một loại có ở tháng `ym`. */
const maxLevel = (rows: Version[], code: string, ym: string) =>
  Math.max(...rows.filter(r => r.code === code).flatMap(r => r.levels.filter(l => l.effective_month <= ym).map(l => l.level_no)));

const signedIn = new WeakSet<Page>();
/** Mở `url` như Admin trên màn rộng; mỗi trang chỉ đăng nhập một lần (đã đăng nhập thì /dang-nhap tự chuyển đi). */
async function admin(page: Page, url: string) {
  if (!signedIn.has(page)) {
    await page.setViewportSize(DESKTOP);
    await signIn(page, ADMIN);
    signedIn.add(page);
  }
  await page.goto(url);
}

// ---------- Chế độ theo loại nhân sự ----------

test('Chế độ shows one row per type, the six request ticks, and headcounts that match the staff data', async ({ page, request }) => {
  // (a) spec positions-settings 5.1: số người = người đang làm (chưa nghỉ việc) theo contract.position.type.
  const today = todayVN();
  const all = await apiAs(request, ADMIN, async () => (await (await request.get('/api/v2/employees')).json()).employees);
  const count = (code: string) =>
    all.filter((e: any) => {
      const joined = e.contract.effectiveFrom || e.account.createdAt.slice(0, 10);
      const working = e.contract.resignedOn ? e.contract.resignedOn > today : e.contract.status !== 'nghiviec';
      return e.contract.position.type === code && joined <= today && working;
    }).length;

  const w = watchPage(page);
  for (const [path, code] of [
    ['/admin/cai-dat/che-do', 'tts'],
    ['/admin/cai-dat/che-do/chuyen-trach', 'ctv'],
    ['/admin/cai-dat/che-do/nhan-vien', 'nv']
  ] as const) {
    await admin(page, path);
    const tables = page.locator('table.ql');
    await expect(tables.first().locator('tbody tr'), path).toHaveCount(1); // (a) P2
    await expect(page.locator('.tabs.in .tab.on, .tabs.in .router-link-exact-active').first().locator('small')).toHaveText(String(count(code)));
    await expect(page.getByRole('columnheader', { name: 'Bậc', exact: true })).toHaveCount(0); // (a) P2
    await expect(page.getByRole('columnheader', { name: 'Nghỉ được duyệt' })).toHaveCount(0); // (a) P4
    await expect(tables.nth(1).locator('thead th')).toHaveText(['Nghỉ phép năm', 'iSAT', 'OT', 'Làm bù']); // (a) 5.4
    await expect(page.getByText('Theo từng người')).toHaveCount(code === 'nv' ? 1 : 0); // (a) P9
  }
  w.check();
});

test('Chế độ: Lưu stays off until a value changes; saving from a later month leaves this month alone', async ({ page, request }) => {
  const before = await catalog(request);
  const now = inEffect(before, 'nv', m0);
  const w = watchPage(page);
  await admin(page, '/admin/cai-dat/che-do/nhan-vien');
  const save = page.locator('.savebar').getByRole('button', { name: 'Lưu', exact: true });
  const flex = page.getByLabel('Phụ cấp Flex · Nhân viên');
  await expect(flex).toHaveValue(String(now.flex_pct));
  await expect(save).toBeDisabled(); // (c) P8
  const next = now.flex_pct + 3;
  await flex.fill(String(next));
  await expect(save).toBeEnabled();
  await flex.fill(String(now.flex_pct));
  await expect(save).toBeDisabled(); // sửa rồi sửa lại về số cũ = chưa đổi
  await flex.fill(String(next));
  await save.click();

  const dlg = page.getByRole('dialog', { name: 'Lưu chế độ' });
  const month = dlg.getByLabel('Áp dụng từ tháng');
  await expect(month.locator('option')).toHaveCount(6); // (a) P1 + 5.2
  await expect(month.locator('option').first()).toHaveText(monthText(m0));
  await month.selectOption({ label: monthText(FAR) });
  await expect(dlg.getByText(`Phụ cấp Flex: ${now.flex_pct}% → ${next}%`)).toBeVisible();
  await dlg.getByRole('button', { name: 'Lưu', exact: true }).click();
  await expect(dlg).toHaveCount(0);

  const after = await catalog(request);
  expect(inEffect(after, 'nv', FAR).flex_pct).toBe(next);
  expect(inEffect(after, 'nv', m0)).toMatchObject({ flex_pct: now.flex_pct, effective_month: now.effective_month }); // (a) P1
  w.check();
});

// ---------- Chức vụ và bậc ----------

test('Chức vụ và bậc: months start this month, NV night is by person, Lưu is off until a change, the next level is added', async ({ page, request }) => {
  const w = watchPage(page);
  await admin(page, '/admin/cai-dat/chuc-vu-bac');
  await page.getByRole('button', { name: 'Sửa chức vụ Nhân viên' }).click();
  const dlg = page.getByRole('dialog', { name: 'Sửa chức vụ' });
  const month = dlg.getByLabel('Áp dụng từ tháng');
  await expect(month.locator('option')).toHaveCount(6);
  await expect(month.locator('option').first()).toHaveText(monthText(m0)); // (a) P1
  await expect(dlg.getByText('Theo từng người')).toBeVisible(); // (a) P9
  await expect(dlg.getByLabel('Phụ cấp Night')).toHaveCount(0);
  await expect(dlg.getByRole('button', { name: 'Lưu', exact: true })).toBeDisabled(); // (c) P8
  await dlg.getByRole('button', { name: 'Huỷ' }).click();

  const before = await catalog(request);
  const level = maxLevel(before, 'nv', FAR) + 1;
  const nv = page.locator('section.card').filter({ has: page.getByRole('heading', { name: 'Nhân viên', exact: true }) });
  await nv.getByRole('button', { name: 'Thêm bậc' }).click();
  const add = page.getByRole('dialog', { name: 'Thêm bậc' });
  const addButton = add.getByRole('button', { name: 'Thêm bậc' });
  await expect(addButton).toBeDisabled(); // (c) P8: tên và lương trống
  await add.getByLabel('Áp dụng từ tháng').selectOption({ label: monthText(FAR) });
  await add.getByLabel('Tên bậc').fill(`Bậc ${level}`);
  await add.getByLabel('Lương cơ bản').fill('9000000');
  await expect(addButton).toBeEnabled();
  await addButton.click();
  await expect(add).toHaveCount(0);
  expect(maxLevel(await catalog(request), 'nv', FAR)).toBe(level);
  expect(maxLevel(await catalog(request), 'nv', m0)).toBe(maxLevel(before, 'nv', m0)); // (a) 3.3 bước 7
  w.check();
});

test('/positions refuses bad saves with the spec’s codes, never a 500', async ({ request }) => {
  const rows = await catalog(request);
  const nv = inEffect(rows, 'nv', FAR);
  const later = addMonths(m0, 4);
  await apiAs(request, ADMIN, async () => {
    const put = (path: string, data: unknown) => request.put(`/api/v2${path}`, { headers: json, data });
    const cases: Array<[string, Promise<any>, number, string]> = [
      ['tháng trước tháng này (P1)', put('/positions', { effectiveMonth: m1, items: [{ code: 'nv', expectedRev: nv.rev, changes: { flexPct: 21 } }] }), 400, 'BAD_REQUEST'],
      ['ca đêm của NV (P9)', put('/positions', { effectiveMonth: later, items: [{ code: 'nv', expectedRev: nv.rev, changes: { nightPct: 50 } }] }), 400, 'BAD_REQUEST'],
      ['% ngoài 0–100', put('/positions', { effectiveMonth: later, items: [{ code: 'nv', expectedRev: nv.rev, changes: { flexPct: 101 } }] }), 400, 'BAD_REQUEST'],
      ['ô lạ', put('/positions', { effectiveMonth: later, items: [{ code: 'nv', expectedRev: nv.rev, changes: { bonus: 1 } }] }), 400, 'BAD_REQUEST'],
      ['loại lạ', put('/positions', { effectiveMonth: later, items: [{ code: 'ql', expectedRev: 0, changes: { flexPct: 1 } }] }), 400, 'BAD_REQUEST'],
      ['rev cũ', put('/positions', { effectiveMonth: later, items: [{ code: 'nv', expectedRev: nv.rev + 99, changes: { flexPct: 22 } }] }), 409, 'POSITION_STALE'],
      ['lương âm', put('/positions/nv/levels/1', { effectiveMonth: later, expectedRev: 0, changes: { baseSalary: -1 } }), 400, 'BAD_REQUEST'],
      ['bậc không có', put('/positions/nv/levels/99', { effectiveMonth: later, expectedRev: 0, changes: { baseSalary: 1 } }), 404, 'LEVEL_NOT_FOUND'],
      [
        'thêm bậc nhảy cóc',
        request.post('/api/v2/positions/nv/levels', {
          headers: json,
          data: { effectiveMonth: later, level: maxLevel(rows, 'nv', later) + 2, values: { name: 'Bậc xa', baseSalary: 1, kpiMax: null, nightPct: null } }
        }),
        409,
        'LEVEL_STALE'
      ]
    ];
    for (const [what, call, status, code] of cases) {
      const r = await call;
      expect(r.status(), `${what}: ${await r.text()}`).toBe(status);
      expect((await r.json()).code, what).toBe(code);
    }
  });
  // Không lần lưu hỏng nào để lại phiên bản mới.
  expect(await catalog(request)).toEqual(rows);
});

// ---------- Phân quyền ----------

test('Phân quyền › Tài khoản lists every account; my own row cannot lock itself', async ({ page, request }) => {
  const all = await apiAs(request, ADMIN, async () => (await (await request.get('/api/v2/employees')).json()).employees);
  const w = watchPage(page);
  await admin(page, '/admin/cai-dat/phan-quyen/tai-khoan');
  await expect(page.locator('.foot')).toContainText(`trên ${all.length} tài khoản`); // (b) cùng số với Nhân sự
  const me = page.locator('tbody tr').filter({ has: page.locator('td.u', { hasText: new RegExp(`^${ADMIN}$`) }) });
  await expect(me).toContainText('Bạn');
  await expect(me.getByRole('button', { name: 'Khoá' })).toHaveCount(0); // (c) không tự khoá mình
  await expect(page.locator('tbody tr').count()).resolves.toBeLessThanOrEqual(10);
  w.check();
});

const accountRow = (page: Page, username: string) => page.locator('tbody tr').filter({ has: page.locator('td.u', { hasText: new RegExp(`^${username}$`) }) });

async function findAccount(page: Page, name: string, username: string) {
  await page.getByLabel('Tìm tên').fill(name);
  const row = accountRow(page, username);
  await expect(row).toHaveCount(1);
  return row;
}

test('locking an account from Tài khoản cuts its sessions and blocks sign-in until it is unlocked', async ({ page }) => {
  const mo = await sessionOf('ns-mo');
  const w = watchPage(page);
  await admin(page, '/admin/cai-dat/phan-quyen/tai-khoan');
  let row = await findAccount(page, 'Mơ', 'ns-mo');
  await row.getByRole('button', { name: 'Khoá' }).click();
  await expect(page.getByText('Đã khoá tài khoản ns-mo')).toBeVisible();
  row = accountRow(page, 'ns-mo');
  await expect(row).toContainText('Đã khoá');

  // (a) spec fe-be-auth-foundation 5.4, 5.7.
  expect((await mo.get('/api/v2/me/profile')).status()).toBe(401);
  await mo.dispose();
  const anon = await anonymous();
  expect(await tryLogin(anon, 'ns-mo', passwordOf('ns-mo'))).toMatchObject({ status: 403, body: { code: 'ACCOUNT_LOCKED' } });

  await row.getByRole('button', { name: 'Mở khoá' }).click();
  await expect(page.getByText('Đã mở khoá tài khoản ns-mo')).toBeVisible();
  await expect(accountRow(page, 'ns-mo')).toContainText('Đang dùng');
  expect((await tryLogin(anon, 'ns-mo', passwordOf('ns-mo'))).ok).toBe(true);
  await anon.dispose();
  w.check();
});

test('Admin resets a password from Tài khoản: old sessions end, only the new password works', async ({ page, request }) => {
  const old = passwordOf('ns-datlai');
  const next = 'DatLai@2026';
  const lai = await sessionOf('ns-datlai');
  const w = watchPage(page);
  await admin(page, '/admin/cai-dat/phan-quyen/tai-khoan');
  const row = await findAccount(page, 'Lại', 'ns-datlai');
  await row.getByRole('button', { name: 'Đặt lại mật khẩu' }).click();
  const dlg = page.getByRole('dialog', { name: 'Đặt lại mật khẩu' });
  await dlg.getByLabel('Mật khẩu mới').fill(next);
  await dlg.getByLabel('Lý do').fill('Nhân viên quên mật khẩu');
  await dlg.getByRole('button', { name: 'Đặt lại mật khẩu' }).click();
  await expect(dlg).toHaveCount(0);

  expect((await lai.get('/api/v2/me/profile')).status()).toBe(401); // (a) 5.4
  await lai.dispose();
  const anon = await anonymous();
  expect((await tryLogin(anon, 'ns-datlai', old)).status).toBe(401);
  expect((await tryLogin(anon, 'ns-datlai', next)).ok).toBe(true);
  await anon.dispose();
  // Trả lại mật khẩu cũ.
  await apiAs(request, ADMIN, async () => {
    const r = await request.put('/api/v2/employees/ns-datlai', { headers: json, data: { account: { password: old } } });
    expect(r.status()).toBe(200);
  });
  w.check();
});

test('changing a role from Tài khoản moves the person between the Admin and staff areas', async ({ page, request }) => {
  test.fail(true, "BUG-staff-8: FE gửi roles ['staff','admin'], BE lưu staff.role = roles[0] = 'staff': màn báo đã đổi nhưng người đó vẫn là nhân viên");
  try {
    await changeRoleThereAndBack(page);
  } finally {
    // Trả ns-vaitro về Nhân viên dù test dừng giữa chừng, để DB demo không còn vai trò nửa vời.
    await apiAs(request, ADMIN, () => request.put('/api/v2/employees/ns-vaitro', { headers: json, data: { account: { roles: ['staff'] } } }));
  }
});

async function changeRoleThereAndBack(page: Page) {
  const w = watchPage(page);
  await admin(page, '/admin/cai-dat/phan-quyen/tai-khoan');
  let row = await findAccount(page, 'Trò', 'ns-vaitro');
  const select = () => accountRow(page, 'ns-vaitro').getByLabel('Vai trò của Đinh Văn Trò');
  await select().selectOption({ label: 'Quản trị viên (Admin)' });
  await expect(page.getByText('Đã đổi vai trò của Đinh Văn Trò')).toBeVisible();

  // (a) spec fe-be-auth-foundation D3, 5.2: admin có mọi năng lực, staff không có.
  const asAdmin = await sessionOf('ns-vaitro');
  const me = await (await asAdmin.get('/api/v2/auth/me')).json();
  expect(me.user.role).toBe('admin');
  expect(me.caps).toContain('staff.manage');
  expect((await asAdmin.get('/api/v2/employees')).status()).toBe(200);
  await asAdmin.dispose();

  row = accountRow(page, 'ns-vaitro');
  await select().selectOption({ label: 'Nhân viên (Staff)' });
  await expect(page.getByText('Đã đổi vai trò của Đinh Văn Trò thành Nhân viên (Staff)')).toBeVisible();
  const asStaff = await sessionOf('ns-vaitro');
  expect((await (await asStaff.get('/api/v2/auth/me')).json()).caps).toEqual([]);
  expect((await asStaff.get('/api/v2/employees')).status()).toBe(403);
  await asStaff.dispose();
  void row;
  w.check();
}

test('the Tạo tài khoản button does something when clicked', async ({ page }) => {
  test.fail(true, 'BUG-staff-5: nút "Tạo tài khoản" ở Phân quyền › Tài khoản không có hành động (nút giả)');
  await admin(page, '/admin/cai-dat/phan-quyen/tai-khoan');
  const before = page.url();
  await page.getByRole('button', { name: 'Tạo tài khoản' }).click();
  await expect(page.getByRole('dialog')).toBeVisible({ timeout: 3000 });
  expect(page.url()).not.toBe(before);
});

test('screens waiting for settings-store and the roles API load without a crash or a 500', async ({ page }) => {
  // Vai trò: BE v2 chưa có API ma trận vai trò (getRoles báo chưa nối). Xử lý yêu cầu, Tất cả cài đặt và số đếm của
  // menu Cài đặt đọc /settings/* mà BE v2 chưa có (phiên settings-store). Chỉ kiểm bất biến (b).
  const w = watchPage(page);
  for (const url of ['/admin/cai-dat/phan-quyen', '/admin/cai-dat/phan-quyen/xu-ly-yeu-cau', '/admin/cai-dat/tat-ca']) {
    await admin(page, url);
    await expect(page.getByRole('link', { name: 'Phân quyền' }).first()).toBeVisible();
    await page.waitForLoadState('networkidle');
  }
  w.check();
});

// ---------- Nhật ký ----------

test('Nhật ký: the check button reports the same count as the API, and Lọc is off when Từ ngày is after Đến ngày', async ({ page, request }) => {
  const { verify, list } = await apiAs(request, ADMIN, async () => ({
    verify: await (await request.get('/api/v2/system/audit/verify')).json(),
    list: await (await request.get('/api/v2/system/audit')).json()
  }));
  const w = watchPage(page);
  await admin(page, '/admin/cai-dat/nhat-ky');
  // (b) chân bảng theo tổng thật của API (spec audit-log mục 7).
  await expect(page.locator('.foot, .ft').first()).toContainText(list.total ? `trên ${list.total}` : 'Không có dòng nào');
  await page.getByRole('button', { name: 'Kiểm tra nhật ký không bị sửa' }).click();
  await expect(page.getByRole('button', { name: `Nhật ký nguyên vẹn · đã kiểm tra ${verify.checked} dòng` })).toBeVisible();

  // (c) spec audit-log mục 7: Từ ngày sau Đến ngày thì nút Lọc bị khoá.
  const d = (offset: number) => {
    const t = new Date(Date.parse(`${todayVN()}T00:00:00Z`) + offset * 86400000).toISOString().slice(0, 10);
    return `${t.slice(8, 10)}/${t.slice(5, 7)}/${t.slice(0, 4)}`;
  };
  await page.getByLabel('Từ ngày').fill(d(0));
  await page.getByLabel('Từ ngày').blur();
  await page.getByLabel('Đến ngày').fill(d(-3));
  await page.getByLabel('Đến ngày').blur();
  await expect(page.getByRole('button', { name: 'Lọc', exact: true })).toBeDisabled();
  await page.getByLabel('Đến ngày').fill(d(3));
  await page.getByLabel('Đến ngày').blur();
  await expect(page.getByRole('button', { name: 'Lọc', exact: true })).toBeEnabled();
  w.check();
});

test('/system/audit answers with the spec’s shape and refuses bad filters with 400, never a 500', async ({ request }) => {
  await apiAs(request, ADMIN, async () => {
    const get = (q: string) => request.get(`/api/v2/system/audit${q}`);
    const page1 = await (await get('')).json();
    expect(page1).toMatchObject({ limit: 25, offset: 0 }); // (a) A3, 5.1
    for (const k of ['items', 'people', 'actions']) expect(Array.isArray(page1[k]), k).toBe(true);
    expect(typeof page1.total).toBe('number');
    expect((await (await get('?limit=500')).json()).limit).toBe(200);
    for (const q of ['?limit=0', '?offset=-1', '?from=2026-13-01', '?from=2026-02-30', `?from=${todayVN()}&to=2000-01-01`]) {
      const r = await get(q);
      expect(r.status(), q).toBe(400);
    }
    const verify = await (await request.get('/api/v2/system/audit/verify')).json();
    expect(verify).toMatchObject({ ok: true, firstBadId: null, reason: null });
  });
});

test('/system/audit with a far-future end date is not a 500', async ({ request }) => {
  test.fail(true, 'BUG-staff-6: to=9999-12-31 qua kiểm ngày nhưng vnDayStart(ngày kế tiếp) ra năm 10000, toISOString ném RangeError → 500');
  await apiAs(request, ADMIN, async () => {
    const r = await request.get('/api/v2/system/audit?to=9999-12-31');
    expect(r.status()).toBeLessThan(500);
  });
});

// ---------- /system/settings ----------

test('/system/settings: Admin reads and writes a key; the write reads back', async ({ request }) => {
  await apiAs(request, ADMIN, async () => {
    const { settings } = await (await request.get('/api/v2/system/settings')).json();
    expect(settings.map((s: { key: string }) => s.key)).toContain('insurance_rates');
    const put = await request.put('/api/v2/system/settings/demo_staff_probe', { headers: json, data: { value: '"thử"' } });
    expect(put.status()).toBe(200);
    const again = (await (await request.get('/api/v2/system/settings')).json()).settings;
    expect(again).toContainEqual({ key: 'demo_staff_probe', value: '"thử"' });
  });
});

test('/system/settings refuses a write without a value with a 400, not a 500', async ({ request }) => {
  test.fail(true, 'BUG-staff-7: PUT /system/settings/:key không kiểm body.value; thiếu value thì INSERT hỏng cú pháp SQL → 500');
  await apiAs(request, ADMIN, async () => {
    const r = await request.put('/api/v2/system/settings/demo_staff_empty', { headers: json, data: {} });
    expect(r.status(), await r.text()).toBe(400);
  });
});
