// Nhóm 5 — Đồng thời: hai admin cùng duyệt một đơn, nhân viên huỷ lúc admin duyệt (và ngược lại), hai nơi cùng lưu cài đặt (409 stale), hai thiết bị cùng
// Check-in. Bên thua phải nhận câu thân thiện, không lỗi chưa bắt, màn trở về trạng thái đúng sau khi tải lại.
import {
  DESKTOP, OFFICE, PHONE, adminApi, createStaff, expect, savedSetting, signIn, signInAdmin, skipWithoutAdmin, submitRequestUI, test, watchConsole, type Staff
} from './helpers';
import type { APIRequestContext, Browser, Page } from '@playwright/test';
import { REST_DAY_REASON, REST_DAY_TODAY } from '../rest-day';

test.use({ permissions: ['geolocation'], geolocation: OFFICE });

let admin: APIRequestContext;
test.beforeAll(async ({ baseURL }) => {
  skipWithoutAdmin();
  admin = await adminApi(baseURL!);
});
test.afterAll(async () => {
  await admin?.dispose();
});

/** Một trang Admin riêng (ngữ cảnh riêng, đăng nhập riêng) kèm bộ ghi lỗi console. */
async function adminPage(browser: Browser, baseURL: string) {
  const ctx = await browser.newContext({ viewport: DESKTOP, baseURL });
  const page = await ctx.newPage();
  const log = watchConsole(page);
  await signInAdmin(page);
  return { ctx, page, log };
}
async function staffPage(browser: Browser, baseURL: string, s: Staff) {
  const ctx = await browser.newContext({ viewport: PHONE, baseURL, permissions: ['geolocation'], geolocation: OFFICE });
  const page = await ctx.newPage();
  const log = watchConsole(page);
  await signIn(page, s.username, s.password);
  return { ctx, page, log };
}

const approveBtn = (page: Page, name: string) => page.getByRole('button', { name: `Duyệt yêu cầu của ${name}` });
const pendingOf = async (s: Staff) => ((await (await admin.get('/api/v2/requests?status=PENDING&limit=200')).json()).items as any[]);

test('hai admin cùng bấm Duyệt một đơn trên Tổng quan: bên chậm nhận "đã được xử lý", đơn chỉ được duyệt một lần', async ({ browser, baseURL }) => {
  test.skip(REST_DAY_TODAY, REST_DAY_REASON);
  const s = await createStaff(admin, baseURL!, 'cc1');
  await submitRequestUI(browser, baseURL!, s, 'ot', { pick: 5 });
  const a = await adminPage(browser, baseURL!);
  const b = await adminPage(browser, baseURL!);
  try {
    await a.page.goto('/admin/tong-quan');
    await b.page.goto('/admin/tong-quan');
    await expect(approveBtn(a.page, s.name)).toBeVisible();
    await expect(approveBtn(b.page, s.name)).toBeVisible();
    await approveBtn(a.page, s.name).click();
    await expect(a.page.locator('.toast.ok').filter({ hasText: `Đã duyệt yêu cầu của ${s.name}` })).toBeVisible();
    // B vẫn còn thấy nút (chưa tải lại) và bấm.
    await expect(approveBtn(b.page, s.name)).toBeVisible();
    await approveBtn(b.page, s.name).click();
    await expect(b.page.locator('.toast').filter({ hasText: 'Yêu cầu này đã được xử lý.' })).toBeVisible();
    await expect(b.page.locator('.toast.ok')).toHaveCount(0);
    // Tải lại thì dòng biến mất ở cả hai bên; BE chỉ có một lần duyệt.
    await b.page.reload();
    await expect(approveBtn(b.page, s.name)).toHaveCount(0);
    const mine = (await (await admin.get(`/api/v2/requests?employeeId=${s.id}`)).json()).items as any[];
    expect(mine.filter(r => r.status === 'APPROVED')).toHaveLength(1);
    expect(a.log.errors).toEqual([]);
    expect(b.log.errors).toEqual([]);
  } finally {
    await a.ctx.close();
    await b.ctx.close();
  }
});

test('hai admin cùng mở một đơn trong chuông: người sau bấm Từ chối nhận câu "đã được xử lý", đơn giữ trạng thái của người trước', async ({ browser, baseURL }) => {
  const s = await createStaff(admin, baseURL!, 'cc2');
  await submitRequestUI(browser, baseURL!, s, 'ot', { pick: 6 });
  const a = await adminPage(browser, baseURL!);
  const b = await adminPage(browser, baseURL!);
  try {
    for (const p of [a.page, b.page]) {
      await p.getByRole('button', { name: /Thông báo/ }).click();
      await p.getByRole('dialog', { name: 'Thông báo' }).getByRole('button', { name: new RegExp(`Làm thêm.*${s.name}`) }).click();
    }
    await a.page.getByRole('button', { name: 'Duyệt', exact: true }).click();
    await expect(a.page.getByRole('dialog', { name: 'Thông báo' }).locator('[aria-live=polite]')).toHaveText(`Đã duyệt yêu cầu của ${s.name}.`);
    await b.page.getByPlaceholder(/Ví dụ: ngày này/).fill('Không phù hợp');
    await b.page.getByRole('button', { name: 'Từ chối', exact: true }).click();
    await expect(b.page.getByRole('dialog', { name: 'Thông báo' }).locator('[aria-live=polite]')).toHaveText('Yêu cầu này đã được xử lý.');
    const mine = (await (await admin.get(`/api/v2/requests?employeeId=${s.id}`)).json()).items as any[];
    expect(mine.map(r => r.status)).toEqual(['APPROVED']);
    expect(a.log.errors).toEqual([]);
    expect(b.log.errors).toEqual([]);
  } finally {
    await a.ctx.close();
    await b.ctx.close();
  }
});

test('nhân viên huỷ đơn trong lúc admin đang mở đơn đó: admin bấm Duyệt nhận "đã được xử lý"; đơn ở trạng thái đã huỷ', async ({ browser, baseURL }) => {
  const s = await createStaff(admin, baseURL!, 'cc3');
  await submitRequestUI(browser, baseURL!, s, 'ot', { pick: 7 });
  const a = await adminPage(browser, baseURL!);
  const sp = await staffPage(browser, baseURL!, s);
  try {
    await a.page.goto('/admin/tong-quan');
    await expect(approveBtn(a.page, s.name)).toBeVisible();
    // Nhân viên huỷ bằng giao diện.
    await sp.page.goto('/nv/yeu-cau');
    await sp.page.getByRole('link', { name: /Làm thêm/ }).first().click();
    await sp.page.getByRole('button', { name: 'Huỷ đơn', exact: true }).click();
    await sp.page.getByRole('button', { name: 'Huỷ đơn', exact: true }).last().click();
    await expect(sp.page.locator('.toast.ok').filter({ hasText: 'Đã huỷ đơn' })).toBeVisible();
    // Admin bấm Duyệt trên bản chưa tải lại.
    await approveBtn(a.page, s.name).click();
    await expect(a.page.locator('.toast').filter({ hasText: 'Yêu cầu này đã được xử lý.' })).toBeVisible();
    const mine = (await (await admin.get(`/api/v2/requests?employeeId=${s.id}`)).json()).items as any[];
    expect(mine.map(r => r.status)).toEqual(['CANCELLED']);
    expect(a.log.errors).toEqual([]);
    expect(sp.log.errors).toEqual([]);
  } finally {
    await a.ctx.close();
    await sp.ctx.close();
  }
});

test('admin duyệt trong lúc nhân viên đang mở đơn: nhân viên bấm Huỷ thì nhận câu của máy chủ, đơn vẫn Đã duyệt, danh sách tải lại đúng', async ({ browser, baseURL }) => {
  const s = await createStaff(admin, baseURL!, 'cc4');
  await submitRequestUI(browser, baseURL!, s, 'ot', { pick: 8 });
  const sp = await staffPage(browser, baseURL!, s);
  try {
    await sp.page.goto('/nv/yeu-cau');
    await sp.page.getByRole('link', { name: /Làm thêm/ }).first().click();
    await sp.page.getByRole('button', { name: 'Huỷ đơn', exact: true }).click(); // hỏi lại "Huỷ đơn này?"
    // Admin duyệt ngay lúc đó.
    const id = (await pendingOf(s)).find(r => r.employeeId === s.id).id;
    const ok = await admin.patch(`/api/v2/requests/${id}/review`, { headers: { 'Content-Type': 'application/json' }, data: { action: 'APPROVE' } });
    expect(ok.ok(), await ok.text()).toBeTruthy();
    await sp.page.getByRole('button', { name: 'Huỷ đơn', exact: true }).last().click();
    await expect(sp.page.getByRole('alert').filter({ hasText: /\S/ })).toBeVisible();
    const msg = await sp.page.getByRole('alert').first().innerText();
    expect(msg).not.toMatch(/^[A-Za-z .,:'-]+$/); // không phải câu tiếng Anh thô của lỗi nội bộ
    // Danh sách phía sau đã tải lại: đơn nằm ở Đã duyệt.
    await expect(sp.page.getByRole('tab', { name: /Đã duyệt/ })).toContainText('1');
    await expect(sp.page.getByRole('tab', { name: /Chờ duyệt/ })).toContainText('0');
    expect(sp.log.errors).toEqual([]);
  } finally {
    await sp.ctx.close();
  }
});

test('hai nơi cùng sửa một nhóm cài đặt: nơi lưu sau nhận 409 "Có người vừa lưu trước, đã tải lại" và thấy số của người trước', async ({ browser, baseURL }) => {
  const a = await adminPage(browser, baseURL!);
  const b = await adminPage(browser, baseURL!);
  try {
    const cur = (await savedSetting(a.page, 'attendance')).lateGraceMinutes as number;
    const va = cur === 21 ? 22 : 21;
    const vb = va + 1;
    for (const p of [a.page, b.page]) await p.goto('/admin/cai-dat/tat-ca?group=khau-tru');
    const box = (p: Page) => p.getByRole('textbox', { name: 'Đi trễ vẫn hợp lệ', exact: true });
    await expect(box(b.page)).toBeVisible();
    await box(a.page).fill(String(va));
    await a.page.getByRole('button', { name: 'Lưu', exact: true }).click();
    await a.page.getByRole('dialog', { name: 'Lưu thay đổi' }).getByRole('button', { name: 'Lưu', exact: true }).click();
    await expect(a.page.locator('.toast.ok').filter({ hasText: 'Đã lưu' })).toBeVisible({ timeout: 30_000 }); // lưu từ tháng cũ trên DB lớn có thể mất vài giây

    await box(b.page).fill(String(vb));
    await b.page.getByRole('button', { name: 'Lưu', exact: true }).click();
    await b.page.getByRole('dialog', { name: 'Lưu thay đổi' }).getByRole('button', { name: 'Lưu', exact: true }).click();
    await expect(b.page.locator('.toast').filter({ hasText: 'Có người vừa lưu trước, đã tải lại' })).toBeVisible({ timeout: 30_000 });
    // Bản của người trước đã được ghi, bản của người sau không ghi đè.
    expect((await savedSetting(b.page, 'attendance')).lateGraceMinutes).toBe(va);
    expect(a.log.errors).toEqual([]);
    expect(b.log.errors).toEqual([]);
  } finally {
    await a.ctx.close();
    await b.ctx.close();
  }
});

test('hai thiết bị cùng Check-in: không treo, cả hai về cùng trạng thái đúng sau khi tải lại, chỉ một lượt vào ca', async ({ browser, baseURL }) => {
  test.skip(REST_DAY_TODAY, REST_DAY_REASON);
  const s = await createStaff(admin, baseURL!, 'cc5');
  const one = await staffPage(browser, baseURL!, s);
  const two = await staffPage(browser, baseURL!, s);
  try {
    const card = (p: Page) => p.getByRole('region', { name: 'Ca hôm nay' });
    await expect(card(one.page)).toContainText('Chưa check-in');
    await expect(card(two.page)).toContainText('Chưa check-in');
    await card(one.page).getByRole('button', { name: /Check-in/ }).click();
    await expect(card(one.page)).toContainText('Đang trong ca');
    await card(two.page).getByRole('button', { name: /Check-in/ }).click();
    await two.page.waitForTimeout(800);
    await two.page.reload();
    await expect(card(two.page)).toContainText('Đang trong ca');
    const today = await (await two.page.request.get('/api/v2/me/today')).json();
    expect(today.punches.in).toBeTruthy();
    await expect(card(two.page)).toContainText(today.punches.in);
    expect(one.log.errors).toEqual([]);
    expect(two.log.errors).toEqual([]);
  } finally {
    await one.ctx.close();
    await two.ctx.close();
  }
});
