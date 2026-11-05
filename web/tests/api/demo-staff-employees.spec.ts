// Mảng staff, phần Nhân sự: danh sách và ngăn kéo /admin/nhan-su, route /api/v2/employees, và hồ sơ đó ở /nv/toi.
// Chạy qua `npm run demo -- test staff`. Bảng tình huống, lỗi và câu hỏi: docs/demo-db/staff.md.
// Chỉ assert (a) luật đã chốt, (b) bất biến, (c) thao tác sai không hiện ra (spec demo-db mục 3).
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { ADMIN, apiAs, demoMonths, demoReadyFor, passwordOf, personNamed, signIn, todayVN } from './fixtures/demo';
import { addMonths, dateIn } from './fixtures/demo';
import { anonymous, dmy, json, sessionOf, tryLogin, watchPage } from './demo-staff-support';

test.skip(!demoReadyFor('staff'), 'Chạy qua npm run demo -- test staff');

const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1280, height: 900 };

const startOf = (username: string) => {
  const p = personNamed(username);
  return dateIn(addMonths(demoMonths().m0, p.start.monthOffset), p.start.day);
};
const fullName = (username: string) => {
  const p = personNamed(username);
  return `${p.familyName} ${p.givenName}`;
};

type Emp = {
  profile: { uuid: string; fullName: string; dependants: number };
  account: { username: string; isLocked: boolean; createdAt: string };
  contract: {
    status: string;
    term: string | null;
    hasInsurance: boolean | null;
    effectiveFrom: string | null;
    resignedOn: string | null;
    position: { type: string; level: number; jobTitle: string | null };
    shift: { type: string; startTime: string; endTime: string; allowancePct: number };
  };
};

async function employees(request: APIRequestContext): Promise<Emp[]> {
  return apiAs(request, ADMIN, async () => (await (await request.get('/api/v2/employees')).json()).employees);
}
async function employee(request: APIRequestContext, username: string): Promise<Emp> {
  return apiAs(request, ADMIN, async () => (await (await request.get(`/api/v2/employees/${username}`)).json()).employee);
}

/** Đang làm vào hôm nay: đã vào làm và chưa nghỉ việc (spec positions-settings 5.1, spec danh sách nhân sự). */
const activeToday = (e: Emp, today: string) => {
  const joined = e.contract.effectiveFrom || e.account.createdAt.slice(0, 10);
  if (joined > today) return false;
  if (e.contract.resignedOn) return e.contract.resignedOn > today;
  return e.contract.status !== 'nghiviec';
};

async function openStaffList(page: Page) {
  await page.setViewportSize(DESKTOP);
  await signIn(page, ADMIN);
  await page.goto('/admin/nhan-su');
  await expect(page.getByRole('heading', { name: 'Danh sách nhân sự' })).toBeVisible();
}

async function openDrawer(page: Page, username: string) {
  await page.goto(`/admin/nhan-su?nv=${username}`);
  const drawer = page.getByRole('dialog', { name: `Hồ sơ của ${fullName(username)}` });
  await expect(drawer).toBeVisible();
  return drawer;
}

const fact = (scope: ReturnType<Page['locator']>, label: string) =>
  scope.locator('.fr').filter({ has: scope.page().locator('dt', { hasText: new RegExp(`^${label}$`) }) }).locator('dd');

const staffFact = (scope: ReturnType<Page['locator']>, label: string) =>
  scope.locator('.kv').filter({ has: scope.page().locator('.k', { hasText: new RegExp(`^${label}$`) }) }).locator('.v');

// ---------- Màn Nhân sự ----------

test('the staff list has one row per employee, one value per cell, and the active count matches the data', async ({ page, request }) => {
  const all = await employees(request);
  const w = watchPage(page);
  await openStaffList(page);

  // (b) tổng hồ sơ = số dòng = số người BE trả.
  await expect(page.locator('.lc-h span')).toHaveText(`${all.length} hồ sơ`);
  await expect(page.locator('table.stbl tbody tr')).toHaveCount(all.length);

  // (b) "Nhân sự đang làm" = số người đang làm hôm nay tính từ chính dữ liệu đó.
  const active = all.filter(e => activeToday(e, todayVN())).length;
  await expect(page.getByRole('article', { name: 'Nhân sự đang làm' }).locator('.kc-v')).toHaveText(new RegExp(`^\\s*${active}\\s*người\\s*$`));

  // (a) spec danh sách nhân sự, quyết định 2: mỗi ô một giá trị, trên một dòng.
  for (const username of ['ns-an', 'ns-binh', 'ns-chau', 'ns-dung', 'ns-giang', 'ns-khoa']) {
    const row = page.locator('table.stbl tbody tr').filter({ has: page.getByRole('link', { name: fullName(username), exact: true }) });
    await expect(row, username).toHaveCount(1);
    // Chữ người dùng thấy trong từng ô. Không tính chữ tắt của ảnh đại diện (.stav, trang trí) và chữ chỉ cho
    // trình đọc màn hình (.sr-only, ví dụ ", chưa kích hoạt tài khoản"); ô chọn (.ck) không có chữ.
    const cells = await row.locator('th, td:not(.ck)').evaluateAll(els =>
      els.map(el => {
        const hidden = [...el.querySelectorAll<HTMLElement>('.stav, .sr-only')];
        const was = hidden.map(h => h.style.display);
        hidden.forEach(h => (h.style.display = 'none'));
        const text = (el as HTMLElement).innerText;
        hidden.forEach((h, i) => (h.style.display = was[i]));
        return text;
      })
    );
    for (const text of cells) expect(text.trim(), `${username}: "${text}"`).not.toContain('\n');
  }
  w.check();
});

test('the profile drawer shows type, level, contract, insurance and shift as saved', async ({ page }) => {
  const w = watchPage(page);
  await openStaffList(page);

  const an = await openDrawer(page, 'ns-an');
  await expect(fact(an, 'Chức danh')).toHaveText('Kế toán viên');
  await expect(fact(an, 'Loại · bậc')).toHaveText('NV · Bậc 2');
  await expect(fact(an, 'Loại hợp đồng')).toHaveText('HĐLĐ từ 3 tháng');
  await expect(fact(an, 'Đóng bảo hiểm')).toHaveText('Có');
  await expect(fact(an, 'Ngày vào làm')).toContainText(dmy(startOf('ns-an')));

  const binh = await openDrawer(page, 'ns-binh');
  await expect(fact(binh, 'Loại · bậc')).toHaveText('TTS · Bậc 1');
  await expect(fact(binh, 'Loại hợp đồng')).toHaveText('HĐLĐ dưới 3 tháng');
  await expect(fact(binh, 'Đóng bảo hiểm')).toHaveText('Không');

  const chau = await openDrawer(page, 'ns-chau');
  await expect(fact(chau, 'Loại · bậc')).toHaveText('CTV · Bậc 1');
  await expect(fact(chau, 'Ca làm')).toHaveText('Linh hoạt · 06:00–15:00');
  await expect(fact(chau, 'Đóng bảo hiểm')).toHaveText('—');
  w.check();
});

test('a probation employee shows Thử việc in the Admin list and in their own app', async ({ page }) => {
  await openStaffList(page);
  const row = page.locator('table.stbl tbody tr').filter({ has: page.getByRole('link', { name: fullName('ns-dung'), exact: true }) });
  await expect(row).toContainText('Thử việc');

  await page.context().clearCookies();
  await page.setViewportSize(PHONE);
  await signIn(page, 'ns-dung');
  await page.goto('/nv/toi');
  await expect(page.locator('.ident .st')).toHaveText('Thử việc');
});

test('a resigned employee reads back as nghỉ việc and the list says Đã nghỉ việc', async ({ page, request }) => {
  test.fail(true, 'BUG-staff-2: staff.contract_status chỉ lưu probation/official, nghiviec đọc lại thành nv');
  const giang = await employee(request, 'ns-giang');
  expect(giang.account.isLocked).toBe(true);
  expect(giang.contract.resignedOn).toBeTruthy();
  await openStaffList(page);
  const row = page.locator('table.stbl tbody tr').filter({ has: page.getByRole('link', { name: fullName('ns-giang'), exact: true }) });
  await expect(row).toContainText('Đã nghỉ việc', { timeout: 3000 });
  expect(giang.contract.status).toBe('nghiviec');
});

test('TTS and CTV contracts read back as saved and the staff app labels them', async ({ page, request }) => {
  test.fail(true, 'BUG-staff-2: staff.contract_status chỉ lưu probation/official, tts/ctv đọc lại thành nv');
  expect((await employee(request, 'ns-binh')).contract.status).toBe('tts');
  expect((await employee(request, 'ns-chau')).contract.status).toBe('ctv');
  await page.setViewportSize(PHONE);
  await signIn(page, 'ns-binh');
  await page.goto('/nv/toi');
  await expect(page.locator('.ident .st')).toHaveText('Thực tập', { timeout: 3000 });
});

test('Admin drawer and the staff app show the same facts, on the phone and on the desktop', async ({ page }) => {
  await openStaffList(page);
  const drawer = await openDrawer(page, 'ns-an');
  const admin = {
    type: (await fact(drawer, 'Loại · bậc').innerText()).trim(),
    title: (await fact(drawer, 'Chức danh').innerText()).trim(),
    joined: (await fact(drawer, 'Ngày vào làm').innerText()).trim().slice(0, 10)
  };

  await page.context().clearCookies();
  const w = watchPage(page);
  await page.setViewportSize(PHONE);
  await signIn(page, 'ns-an');
  await page.goto('/nv/toi');
  const phone = page.locator('.ph.toi');
  await expect(phone.locator('.ident .nm')).toHaveText(fullName('ns-an'));
  await expect(staffFact(phone, 'Loại · bậc')).toHaveText(admin.type);
  await expect(staffFact(phone, 'Chức danh')).toHaveText(admin.title);
  await expect(staffFact(phone, 'Ngày vào làm')).toHaveText(admin.joined);
  await expect(staffFact(phone, 'Tên đăng nhập')).toHaveText('ns-an');

  await page.setViewportSize(DESKTOP);
  const menu = page.getByRole('region', { name: 'Tài khoản của tôi' });
  await expect(menu).toBeVisible();
  await expect(menu.locator('.sd-nm2')).toHaveText(fullName('ns-an'));
  await expect(staffFact(menu, 'Loại · bậc')).toHaveText(admin.type);
  await expect(staffFact(menu, 'Ngày vào làm')).toHaveText(admin.joined);
  w.check();
});

// ---------- API /api/v2/employees ----------

test('POST /employees with profile.name creates a person that GET by username and by uuid agree on', async ({ request }) => {
  const body = {
    username: 'ns-moi-a',
    password: 'NsMoiA@123',
    profile: { name: { familyName: 'Phan Văn', givenName: 'Mới' } },
    account: { username: 'ns-moi-a', roles: ['staff'] },
    contract: { status: 'nv', effectiveFrom: dateIn(demoMonths().m0, 1), position: { type: 'tts', level: 2 } }
  };
  const created = await apiAs(request, ADMIN, async () => {
    const r = await request.post('/api/v2/employees', { headers: json, data: body });
    expect(r.status(), await r.text()).toBe(201);
    return (await r.json()).employee as Emp;
  });
  expect(created.profile.fullName).toBe('Phan Văn Mới');
  const byName = await employee(request, 'ns-moi-a');
  const byUuid = await employee(request, created.profile.uuid);
  expect(byUuid).toEqual(byName);
  expect(byName.contract.position).toMatchObject({ type: 'tts', level: 2 });

  const self = await sessionOf('ns-moi-a', 'NsMoiA@123');
  const me = await (await self.get('/api/v2/auth/me')).json();
  expect(me.user).toMatchObject({ username: 'ns-moi-a', name: 'Phan Văn Mới', role: 'staff' });
  expect(me.caps).toEqual([]);
  await self.dispose();
});

test('POST /employees with the profile shape that GET returns keeps the name', async ({ request }) => {
  test.fail(true, 'BUG-staff-1: BE chỉ đọc profile.name; profile.familyName/givenName bị bỏ qua, tên rơi về username');
  await apiAs(request, ADMIN, async () => {
    const r = await request.post('/api/v2/employees', {
      headers: json,
      data: {
        username: 'ns-moi-b',
        password: 'NsMoiB@123',
        profile: { familyName: 'Phan Thị', givenName: 'Hai' },
        account: { username: 'ns-moi-b', roles: ['staff'] },
        contract: { status: 'nv', position: { type: 'nv', level: 1 } }
      }
    });
    expect(r.status()).toBe(201);
  });
  expect((await employee(request, 'ns-moi-b')).profile.fullName).toBe('Phan Thị Hai');
});

test('POST /employees with an existing username does not overwrite that person', async ({ request }) => {
  const before = await employee(request, 'ns-trung');
  const status = await apiAs(request, ADMIN, async () => {
    const r = await request.post('/api/v2/employees', {
      headers: json,
      data: {
        username: 'ns-trung',
        password: 'KhacHan@999',
        profile: { name: { familyName: 'Người', givenName: 'Khác' } },
        account: { username: 'ns-trung', roles: ['staff'] },
        contract: { status: 'nv', position: { type: 'nv', level: 1 } }
      }
    });
    return r.status();
  });
  const after = await employee(request, 'ns-trung');
  expect(after.profile.uuid, 'uuid của người đã có không đổi').toBe(before.profile.uuid);
  expect(after.profile.fullName).toBe(before.profile.fullName);
  expect(status, 'tạo trùng tên đăng nhập bị từ chối').toBeGreaterThanOrEqual(400);
  expect(status).toBeLessThan(500);
  // Mật khẩu cũng không bị ghi đè.
  const anon = await anonymous();
  expect((await tryLogin(anon, 'ns-trung', 'KhacHan@999')).status).toBe(401);
  expect((await tryLogin(anon, 'ns-trung', passwordOf('ns-trung'))).ok).toBe(true);
  await anon.dispose();
});

test('PUT /employees edits read back on the API and the drawer, and keep the person signed in', async ({ page, request }) => {
  const self = await sessionOf('ns-sua');
  await apiAs(request, ADMIN, async () => {
    const r = await request.put('/api/v2/employees/ns-sua', {
      headers: json,
      data: {
        profile: { dependants: 2 },
        contract: {
          term: 'short',
          hasInsurance: false,
          position: { type: 'nv', level: 3, jobTitle: 'Thủ quỹ' },
          shift: { type: 'NIGHT', startTime: '22:00', endTime: '07:00', allowancePct: 40 }
        }
      }
    });
    expect(r.status(), await r.text()).toBe(200);
  });
  const after = await employee(request, 'ns-sua');
  expect(after.profile.fullName).toBe(fullName('ns-sua'));
  expect(after.profile.dependants).toBe(2);
  expect(after.contract).toMatchObject({
    term: 'short',
    hasInsurance: false,
    position: { type: 'nv', level: 3, jobTitle: 'Thủ quỹ' },
    shift: { type: 'NIGHT', startTime: '22:00', endTime: '07:00', allowancePct: 40 }
  });
  // (a) spec fe-be-auth-foundation 5.4: sửa hồ sơ (không đổi mật khẩu) không cắt phiên của người đó.
  expect((await self.get('/api/v2/me/profile')).status()).toBe(200);
  await self.dispose();

  const w = watchPage(page);
  await openStaffList(page);
  const drawer = await openDrawer(page, 'ns-sua');
  await expect(fact(drawer, 'Loại · bậc')).toHaveText('NV · Bậc 3');
  await expect(fact(drawer, 'Chức danh')).toHaveText('Thủ quỹ');
  await expect(fact(drawer, 'Ca làm')).toHaveText('Ca đêm · 22:00–07:00');
  await expect(fact(drawer, 'Loại hợp đồng')).toHaveText('HĐLĐ dưới 3 tháng');
  await expect(fact(drawer, 'Đóng bảo hiểm')).toHaveText('Không');
  await expect(fact(drawer, 'Người phụ thuộc')).toHaveText('2');
  w.check();
});

test('DELETE /employees ends the person’s sessions and blocks their sign-in', async ({ request }) => {
  const self = await sessionOf('ns-xoa');
  expect((await self.get('/api/v2/me/profile')).status()).toBe(200);
  await apiAs(request, ADMIN, async () => {
    const r = await request.delete('/api/v2/employees/ns-xoa', { headers: json, data: {} });
    expect(r.status(), await r.text()).toBe(200);
    expect(await r.json()).toMatchObject({ deactivated: true, username: 'ns-xoa' });
  });
  // (a) spec fe-be-auth-foundation 5.4 và 5.7: tài khoản khoá thì phiên cũ hết hiệu lực, đăng nhập đúng mật khẩu báo khoá.
  expect((await self.get('/api/v2/me/profile')).status()).toBe(401);
  await self.dispose();
  const anon = await anonymous();
  const login = await tryLogin(anon, 'ns-xoa', 'x'.repeat(4));
  expect(login.status).toBe(401);
  const right = await tryLogin(anon, 'ns-xoa', passwordOf('ns-xoa'));
  expect(right.status).toBe(403);
  expect(right.body).toMatchObject({ code: 'ACCOUNT_LOCKED' });
  await anon.dispose();
  const after = await employee(request, 'ns-xoa');
  expect(after.account.isLocked).toBe(true);
  expect(after.contract.resignedOn).toBeTruthy();
});

test('bad employee input is a 400 or 404 with a code, never a 500', async ({ request }) => {
  await apiAs(request, ADMIN, async () => {
    const post = (data: unknown) => request.post('/api/v2/employees', { headers: json, data });
    const base = { password: 'Bad@12345', contract: { status: 'nv', position: { type: 'nv', level: 1 } } };
    const cases: Array<[string, Promise<{ status: () => number; json: () => Promise<any> }>, number, string]> = [
      ['thiếu tên đăng nhập', post({}), 400, 'BAD_EMPLOYEE_INPUT'],
      ['ngày vào làm sai dạng', post({ ...base, username: 'ns-bad-1', contract: { ...base.contract, effectiveFrom: '05/11/2026' } }), 400, 'BAD_EMPLOYEE_INPUT'],
      ['bậc 0', post({ ...base, username: 'ns-bad-2', contract: { status: 'nv', position: { type: 'nv', level: 0 } } }), 400, 'BAD_EMPLOYEE_INPUT'],
      ['trạng thái lạ', post({ ...base, username: 'ns-bad-3', contract: { status: 'abc', position: { type: 'nv', level: 1 } } }), 400, 'BAD_EMPLOYEE_INPUT'],
      ['bảo hiểm không phải có/không', post({ ...base, username: 'ns-bad-4', insured: 'yes' }), 400, 'BAD_EMPLOYEE_INPUT'],
      ['GET người không có', request.get('/api/v2/employees/ns-khong-co'), 404, 'EMPLOYEE_NOT_FOUND'],
      ['PUT người không có', request.put('/api/v2/employees/ns-khong-co', { headers: json, data: { profile: { dependants: 1 } } }), 404, 'EMPLOYEE_NOT_FOUND'],
      ['DELETE người không có', request.delete('/api/v2/employees/ns-khong-co', { headers: json, data: {} }), 404, 'EMPLOYEE_NOT_FOUND']
    ];
    for (const [what, call, status, code] of cases) {
      const r = await call;
      expect(r.status(), what).toBe(status);
      expect((await r.json()).code, what).toBe(code);
    }
    // Người tạo hỏng không được nằm lại trong DB.
    for (const u of ['ns-bad-1', 'ns-bad-2', 'ns-bad-3', 'ns-bad-4']) expect((await request.get(`/api/v2/employees/${u}`)).status(), u).toBe(404);
  });
});

test('catalog routes answer Admin: positions with benefits per version, shifts, roles', async ({ request }) => {
  await apiAs(request, ADMIN, async () => {
    const { positions } = await (await request.get('/api/v2/employees/meta/positions')).json();
    expect(positions.map((p: { code: string }) => p.code)).toEqual(expect.arrayContaining(['tts', 'ctv', 'nv']));
    for (const p of positions) {
      // (a) spec positions-settings 3.2: mỗi phiên bản chức vụ có benefits { mã: boolean } và danh sách bậc.
      expect(Object.values(p.benefits).length, p.code).toBeGreaterThan(0);
      for (const v of Object.values(p.benefits)) expect(typeof v).toBe('boolean');
      expect(Array.isArray(p.levels)).toBe(true);
    }
    const { shifts } = await (await request.get('/api/v2/employees/meta/shifts')).json();
    expect(shifts.length).toBeGreaterThan(0);
    for (const s of shifts) expect(['normal', 'flex', 'night']).toContain(s.kind);
    const { roles } = await (await request.get('/api/v2/roles')).json();
    expect(roles.map((r: { code: string }) => r.code)).toEqual(expect.arrayContaining(['admin', 'staff']));
  });
});
