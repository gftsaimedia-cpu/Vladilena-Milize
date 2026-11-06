// Nghỉ giữa ca (yêu cầu FE của BE, docs half-shift-leave): form của nhân viên, form Làm thêm giờ dùng để bù, Đổi ca giữ ngày
// nửa ca. Dữ liệu giả: hôm nay 28/10/2026, Nam làm ca 08–17 thứ Hai – thứ Bảy, có quyền lợi ot và makeup. Hai nửa ca, số giờ
// cần bù và nợ của tháng đều do "BE" (mock) đưa; FE chỉ hiện.
import { expect, test, type Locator, type Page } from '@playwright/test';
import { staffRequestsClient } from '../src/builders/api/staff-requests';
import { requestDetailOf, requestRowOf, type MeRequest } from '../src/builders/api/staff-phone';
import { openPhone } from './fixtures/staff-phone';

const rowsOf = (dialog: Locator) => dialog.getByRole('group', { name: 'Loại yêu cầu' }).getByRole('button');
const kindRow = (dialog: Locator, name: string) =>
  rowsOf(dialog).filter({ has: dialog.page().getByText(name, { exact: true }) });
const choices = (select: Locator) => select.locator('option:not([value=""])');
// Chữ của các lựa chọn, sau khi danh sách đã có (form vẽ lựa chọn khi request-context tải xong).
async function optionsOf(select: Locator) {
  await expect(choices(select).first()).toBeAttached();
  return choices(select).allTextContents();
}
const sheetOf = (page: Page, name: string) => page.getByRole('dialog', { name });
const sendButton = (dialog: Locator) => dialog.getByRole('button', { name: 'Gửi yêu cầu' });
const phoneRows = (page: Page) => page.getByRole('tabpanel').getByRole('link');
const sentToast = (page: Page) => page.getByRole('status').filter({ hasText: 'Đã gửi yêu cầu' });
const summaryBox = (dialog: Locator) => dialog.locator('.nr-sum');
const sendErrorLine = (dialog: Locator) => dialog.locator('.nr-send + [role="alert"]');

const HALVES = ['Làm 08:00–12:00, nghỉ 13:00–17:00', 'Làm 13:00–17:00, nghỉ 08:00–12:00'];

// "Máy khác" nộp đơn vào cùng kho dữ liệu giả mà app đang dùng; trả id đơn (hoặc false khi bị từ chối).
const otherDevice = (page: Page, kind: string, draft: Record<string, unknown>) =>
  page.evaluate(
    `import('/src/mock/staff-requests.ts').then(m => { const r = m.createRequest('${kind}', ${JSON.stringify(draft)}); return r.ok ? r.id : false; })`
  ) as Promise<string | false>;
// Admin duyệt đơn (dữ liệu giả): đơn thành Đã duyệt.
const approve = (page: Page, id: string) =>
  page.evaluate(
    `import('/src/mock/staff-phone.ts').then(m => m.updateRequest('${id}', { status: 'done', statusText: 'Đã duyệt' }))`
  );

async function openKind(page: Page, kind: string) {
  await page.getByRole('button', { name: 'Tạo yêu cầu' }).click();
  await kindRow(sheetOf(page, 'Tạo yêu cầu'), kind).click();
  return sheetOf(page, kind);
}

test.describe('form Nghỉ giữa ca', () => {
  test('the menu lists it after Nghỉ có làm bù and opens ?tao=nghi-giua-ca', async ({ page }) => {
    const calls = await openPhone(page, '/nv/yeu-cau?tao=chon');
    const menu = sheetOf(page, 'Tạo yêu cầu');
    await expect(rowsOf(menu).locator('b')).toHaveText([
      'Đơn nghỉ',
      'Nghỉ có làm bù',
      'Nghỉ giữa ca',
      'Làm thêm giờ',
      'Đổi ca',
      'Giải trình',
      'Tạm ứng'
    ]);
    const row = kindRow(menu, 'Nghỉ giữa ca');
    await expect(row).toHaveAccessibleDescription('Làm nửa ca, nửa còn lại bù bằng làm thêm giờ trong tháng');
    await row.click();
    await expect(page).toHaveURL(/\?tao=nghi-giua-ca$/);
    await expect(sheetOf(page, 'Nghỉ giữa ca').getByRole('heading', { name: 'Nghỉ giữa ca' })).toBeVisible();
    expect(calls).toEqual([]);
  });

  test('a position type without the benefit sees it locked with the server reason', async ({ page }) => {
    await page.addInitScript(() => ((globalThis as { __mockPositionType?: string }).__mockPositionType = 'tts'));
    await openPhone(page, '/nv/yeu-cau?tao=nghi-giua-ca');
    const menu = sheetOf(page, 'Tạo yêu cầu');
    await expect(page).toHaveURL(/\?tao=chon$/);
    const row = kindRow(menu, 'Nghỉ giữa ca');
    await expect(row).toHaveAttribute('aria-disabled', 'true');
    await expect(row).toHaveAccessibleDescription('Loại nhân sự này chưa dùng được nghỉ giữa ca');
  });

  test('offers only working days, then the two halves of that day from the server', async ({ page }) => {
    const calls = await openPhone(page, '/nv/yeu-cau?tao=nghi-giua-ca');
    const sheet = sheetOf(page, 'Nghỉ giữa ca');
    const dates = await optionsOf(sheet.getByLabel('Ngày'));
    expect(dates.slice(0, 4)).toEqual(['T4 28/10', 'T5 29/10', 'T6 30/10', 'T7 31/10']);
    expect(dates).not.toContain('CN 01/11');
    await expect(sheet.getByLabel('Nửa ca')).toBeDisabled();
    await sheet.getByLabel('Ngày').selectOption({ label: 'T5 29/10' });
    await expect(choices(sheet.getByLabel('Nửa ca'))).toHaveText(HALVES);
    expect(calls).toEqual([]);
  });

  test('the summary says how many hours are owed; Gửi waits for the reason; the sent request tops the list', async ({ page }) => {
    const calls = await openPhone(page, '/nv/yeu-cau');
    let sheet = await openKind(page, 'Nghỉ giữa ca');
    await sheet.getByLabel('Ngày').selectOption({ label: 'T5 29/10' });
    await sheet.getByLabel('Nửa ca').selectOption({ label: HALVES[0] });
    await expect(sendButton(sheet)).toBeDisabled();
    await expect(summaryBox(sheet)).toHaveCount(0);
    await sheet.getByLabel('Lý do').fill('Việc gia đình');
    await expect(sendButton(sheet)).toBeEnabled();
    await expect(summaryBox(sheet)).toContainText('Còn 4 giờ cần bù');
    await expect(summaryBox(sheet)).toContainText('Bù bằng Làm thêm giờ trong tháng 10');
    await sendButton(sheet).click();
    await expect(sentToast(page)).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(phoneRows(page).first()).toHaveAccessibleName('Nghỉ giữa ca 29/10, làm 08–12h, Chờ duyệt');

    sheet = await openKind(page, 'Nghỉ giữa ca');
    expect(await optionsOf(sheet.getByLabel('Ngày'))).not.toContain('T5 29/10');
    expect(calls).toEqual([]);
  });

  test('a day taken from another device: the error stays under Gửi and the day is no longer offered', async ({ page }) => {
    await openPhone(page, '/nv/yeu-cau?tao=nghi-giua-ca');
    const sheet = sheetOf(page, 'Nghỉ giữa ca');
    await sheet.getByLabel('Ngày').selectOption({ label: 'T5 29/10' });
    await sheet.getByLabel('Nửa ca').selectOption({ label: HALVES[1] });
    await sheet.getByLabel('Lý do').fill('Việc gia đình');
    await expect(sendButton(sheet)).toBeEnabled();
    const leave = { leaveType: 'PERSONAL_PAID', startDate: '2026-10-29', endDate: '2026-10-29', reason: 'Máy khác' };
    expect(await otherDevice(page, 'leave', leave)).toBeTruthy();
    await sendButton(sheet).click();
    await expect(sendErrorLine(sheet)).toHaveText('Ngày 29/10 đã có đơn nghỉ');
    await expect(sentToast(page)).toHaveCount(0);
    await expect(sheet.getByLabel('Ngày')).toHaveValue('');
    expect(await optionsOf(sheet.getByLabel('Ngày'))).not.toContain('T5 29/10');
    await expect(sheet.getByLabel('Lý do')).toHaveValue('Việc gia đình');
  });

  test('a half-shift day is not offered for Đơn nghỉ', async ({ page }) => {
    await openPhone(page, '/nv/yeu-cau');
    expect(await otherDevice(page, 'half-shift-leave', { date: '2026-10-29', half: 'FIRST', reason: 'Máy khác' })).toBeTruthy();
    const sheet = await openKind(page, 'Đơn nghỉ');
    expect(await optionsOf(sheet.getByLabel('Từ ngày'))).not.toContain('T5 29/10');
  });
});

test.describe('Làm thêm giờ để bù', () => {
  // Đơn nghỉ giữa ca 05/11 (nửa đầu) đã duyệt: tháng 11 nợ 4 giờ.
  async function owe(page: Page) {
    const id = await otherDevice(page, 'half-shift-leave', { date: '2026-11-05', half: 'FIRST', reason: 'Máy khác' });
    expect(id).toBeTruthy();
    await approve(page, id as string);
  }

  test('a month with debt shows how much is registered and how it is paid; other months do not', async ({ page }) => {
    const calls = await openPhone(page, '/nv/yeu-cau');
    await owe(page);
    const sheet = await openKind(page, 'Làm thêm giờ');
    await sheet.getByLabel('Ngày').selectOption({ label: 'T6 06/11' });
    await expect(summaryBox(sheet)).toContainText('Nợ nghỉ giữa ca tháng 11: đã đăng ký bù 0 / 4 giờ, còn 4 giờ');
    await expect(summaryBox(sheet)).toContainText('Giờ làm thêm trong tháng trả nợ trước: ×1, không phụ cấp');
    await sheet.getByLabel('Ngày').selectOption({ label: 'T5 29/10' });
    await expect(summaryBox(sheet)).not.toContainText('Nợ nghỉ giữa ca');
    expect(calls).toEqual([]);
  });

  test('in a month with Nghỉ có làm bù, OT opens only up to the hours still owed', async ({ page }) => {
    const calls = await openPhone(page, '/nv/yeu-cau');
    const makeup = {
      startDate: '2026-11-09',
      endDate: '2026-11-09',
      slots: [
        { date: '2026-11-10', startTime: '18:00', endTime: '22:00' },
        { date: '2026-11-11', startTime: '18:00', endTime: '22:00' }
      ],
      reason: 'Máy khác'
    };
    expect(await otherDevice(page, 'leave-with-makeup', makeup)).toBeTruthy();
    await owe(page);
    const ot = { otDate: '2026-11-06', startTime: '18:00', endTime: '20:00', reason: 'Máy khác' };
    expect(await otherDevice(page, 'overtime', ot)).toBeTruthy();

    const sheet = await openKind(page, 'Làm thêm giờ');
    const dates = await optionsOf(sheet.getByLabel('Ngày'));
    expect(dates).not.toContain('T3 03/11'); // trước ngày nghỉ giữa ca: không trả được nợ
    await sheet.getByLabel('Ngày').selectOption({ label: 'T7 07/11' });
    await expect(summaryBox(sheet)).toContainText('Nợ nghỉ giữa ca tháng 11: đã đăng ký bù 2 / 4 giờ, còn 2 giờ');
    await sheet.getByLabel('Giờ bắt đầu').selectOption({ label: '18:00' });
    await expect(choices(sheet.getByLabel('Giờ kết thúc'))).toHaveText(['19:00', '20:00']);
    await sheet.getByLabel('Lý do').fill('Bù nghỉ giữa ca');
    await expect(sendButton(sheet)).toBeEnabled();
    expect(calls).toEqual([]);
  });
});

test.describe('Đổi ca qua ngày nghỉ giữa ca', () => {
  test('the half-shift day keeps its shift and the summary says why', async ({ page }) => {
    await openPhone(page, '/nv/yeu-cau');
    expect(await otherDevice(page, 'half-shift-leave', { date: '2026-11-04', half: 'SECOND', reason: 'Máy khác' })).toBeTruthy();
    const sheet = await openKind(page, 'Đổi ca');
    await sheet.getByLabel('Từ ngày').selectOption({ label: 'T2 02/11' });
    await sheet.getByLabel('Đến ngày').selectOption({ label: 'T7 07/11' });
    await sheet.getByRole('radio', { name: 'Flex 06–15' }).check();
    await sheet.getByLabel('Lý do').fill('Đưa đón con tuần này');
    await expect(sendButton(sheet)).toBeEnabled();
    await expect(summaryBox(sheet)).toContainText('5 ngày đổi sang Flex 06–15: 02, 03, 05, 06 và 07/11');
    await expect(summaryBox(sheet)).toContainText('Ngày 04/11 đã có đơn nghỉ giữa ca, giữ nguyên, không đổi ca.');
  });
});

test.describe('máy chủ thật', () => {
  // Đơn nghỉ giữa ca như BE trả (SystemRequestDTO): ngày, nửa làm, hai khung, số phút cần bù; tiêu đề do server đặt.
  const dto: MeRequest = {
    id: 'r-1',
    employeeId: 'e-1',
    type: 'HALF_SHIFT_LEAVE',
    status: 'PENDING',
    reason: 'Việc gia đình',
    createdAt: '2026-11-06T02:00:00.000Z',
    halfShiftDate: '2026-11-12',
    halfShift: 'FIRST',
    halfShiftWork: { start: '08:00', end: '12:00' },
    halfShiftLeave: { start: '13:00', end: '17:00' },
    owedMinutes: 240,
    dates: ['2026-11-12']
  };

  test('a half-shift request reads as Nghỉ giữa ca with its day, halves and owed hours', () => {
    expect(requestRowOf(dto)).toMatchObject({ icon: 'leave', title: 'Nghỉ giữa ca 12/11', status: 'pend', month: '2026-11' });
    const detail = requestDetailOf(dto, [{ label: 'Đã gửi', at: '2026-11-06T02:00:00.000Z', state: 'done' }]);
    expect(detail.kindLabel).toBe('Nghỉ giữa ca');
    expect(detail.facts).toEqual([
      ['Ngày', '12/11/2026'],
      ['Làm', '08:00–12:00'],
      ['Nghỉ', '13:00–17:00'],
      ['Cần bù', '4 giờ'],
      ['Lý do', '“Việc gia đình”']
    ]);
    expect(detail.dates).toEqual(['2026-11-12']);
  });

  test('preview and send post {date, half, reason} to the half-shift-leave route, nothing else', async () => {
    const calls: [string, unknown][] = [];
    const api = {
      get: async () => ({}),
      post: async (path: string, body: unknown) => {
        calls.push([path, body]);
        return path.endsWith('/preview') ? { ok: true } : { request: { id: 'r-9' } };
      },
      patch: async () => ({})
    };
    const client = staffRequestsClient(api);
    const draft = { date: '2026-11-12', half: 'SECOND' as const, reason: 'Việc gia đình' };
    await client.previewRequest('half-shift-leave', draft);
    expect(await client.createRequest('half-shift-leave', draft)).toEqual({ id: 'r-9' });
    expect(calls).toEqual([
      ['/me/requests/half-shift-leave/preview', draft],
      ['/me/requests/half-shift-leave', draft]
    ]);
  });
});
