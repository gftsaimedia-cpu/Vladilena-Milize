// Luồng "Tạo yêu cầu" của nhân viên (spec staff-requests 4.1–4.5, board J8–J10, K3) trên dữ liệu giả: menu J8, form Đơn nghỉ,
// gửi, đóng. Hôm nay là 28/10/2026; Nam còn 11 ngày phép năm. Đơn tạo trong phiên nằm trong bộ nhớ của trang.
import { expect, test, type Locator, type Page } from '@playwright/test';
import { openDesktop } from './fixtures/staff-desktop';
import { openPhone } from './fixtures/staff-phone';

const KINDS = ['Đơn nghỉ', 'Nghỉ có làm bù', 'Làm thêm giờ', 'Đổi ca', 'Giải trình', 'Tạm ứng'];
const LEAVE_TYPES = [
  'Phép năm',
  'Việc riêng có lương',
  'Việc riêng không lương',
  'Chế độ BHXH',
  'Phúc lợi nội bộ',
  'Không lương'
];

const rowsOf = (dialog: Locator) => dialog.getByRole('group', { name: 'Loại yêu cầu' }).getByRole('button');
const kindRow = (dialog: Locator, name: string) =>
  rowsOf(dialog).filter({ has: dialog.page().getByText(name, { exact: true }) });
const dayOptions = (select: Locator) => select.locator('option:not([value=""])');
const menuSheet = (page: Page) => page.getByRole('dialog', { name: 'Tạo yêu cầu' });
const leaveSheet = (page: Page) => page.getByRole('dialog', { name: 'Đơn nghỉ' });
const sendButton = (dialog: Locator) => dialog.getByRole('button', { name: 'Gửi yêu cầu' });
const phoneRows = (page: Page) => page.getByRole('tabpanel').getByRole('link');
const sentToast = (page: Page) => page.getByRole('status').filter({ hasText: 'Đã gửi yêu cầu' });
const summaryBox = (dialog: Locator) => dialog.locator('.nr-sum');
const sendErrorLine = (dialog: Locator) => dialog.locator('.nr-send + [role="alert"]');

// "Máy khác" gửi Việc riêng có lương 03/11 vào cùng kho dữ liệu giả: trang tải lại đúng module mock mà app đang dùng
// (cùng URL của Vite), nên lần gửi sau của form đụng ngày đã bị giữ, như hai thiết bị gửi cùng lúc (spec 4.5).
const otherDeviceTakes0311 = (page: Page) =>
  page.evaluate(`import('/src/mock/staff-requests.ts').then(m => m.createRequest('leave', {
    leaveType: 'PERSONAL_PAID', startDate: '2026-11-03', endDate: '2026-11-03', reason: 'Máy khác'
  }).ok)`);
// Móc của dịch vụ khi chạy dữ liệu giả: request-context bị từ chối với câu này, như mất mạng.
const failContext = (page: Page, message: string) =>
  page.evaluate(m => ((window as unknown as { __mockRequestContextError: string }).__mockRequestContextError = m), message);

// Điền Phép năm 02/11–03/11 kèm lý do và chờ lần xem trước bật nút Gửi.
async function fillLeave(dialog: Locator, from = 'T2 02/11', to = 'T3 03/11') {
  await dialog.getByLabel('Hình thức nghỉ').selectOption({ label: 'Phép năm' });
  await dialog.getByLabel('Từ ngày').selectOption({ label: from });
  await dialog.getByLabel('Đến ngày').selectOption({ label: to });
  await dialog.getByLabel('Lý do').fill('Việc gia đình');
  await expect(sendButton(dialog)).toBeEnabled();
}

async function openLeaveOnPhone(page: Page) {
  await page.getByRole('button', { name: 'Tạo yêu cầu' }).click();
  await kindRow(menuSheet(page), 'Đơn nghỉ').click();
  await expect(page).toHaveURL(/\/nv\/yeu-cau\?tao=nghi$/);
  return leaveSheet(page);
}

test.describe('phone', () => {
  test('Tạo yêu cầu opens the J8 menu with six kinds and Tạm ứng locked', async ({ page }) => {
    const calls = await openPhone(page, '/nv/yeu-cau');
    await page.getByRole('button', { name: 'Tạo yêu cầu' }).click();
    await expect(page).toHaveURL(/\/nv\/yeu-cau\?tao=chon$/);
    const sheet = menuSheet(page);
    await expect(sheet).toContainText('Chọn loại để điền đơn');
    await expect(rowsOf(sheet)).toHaveCount(6);
    await expect(rowsOf(sheet).locator('b')).toHaveText(KINDS);
    const advance = kindRow(sheet, 'Tạm ứng');
    await expect(advance).toBeDisabled();
    await expect(advance).toContainText('Chỉ nộp ngày 16 và 17');
    await expect(kindRow(sheet, 'Đơn nghỉ')).toBeEnabled();
    await expect(kindRow(sheet, 'Đơn nghỉ')).toContainText('Phép năm còn 11 ngày');
    await expect(page.locator('.ph-sheet')).toHaveCount(1);
    expect(calls).toEqual([]);
  });

  test('locked rows stay reachable by keyboard, read their reason and open nothing', async ({ page }) => {
    await openPhone(page, '/nv/yeu-cau?tao=chon');
    const sheet = menuSheet(page);
    const advance = kindRow(sheet, 'Tạm ứng');
    await expect(advance).toHaveAttribute('aria-disabled', 'true');
    await expect(advance).not.toHaveAttribute('disabled', /.*/);
    await expect(advance).toHaveAccessibleName('Tạm ứng');
    await expect(advance).toHaveAccessibleDescription('Chỉ nộp ngày 16 và 17');
    await expect(kindRow(sheet, 'Đơn nghỉ')).toHaveAccessibleDescription('Phép năm còn 11 ngày');
    await kindRow(sheet, 'Đơn nghỉ').focus();
    await page.keyboard.press('Tab', { delay: 0 });
    await expect(kindRow(sheet, 'Nghỉ có làm bù')).toBeFocused();
    for (let i = 0; i < 4; i++) await page.keyboard.press('Tab');
    await expect(advance).toBeFocused();
    await page.keyboard.press('Enter');
    // Bấm "force" bỏ qua chờ ổn định: chờ hộp trượt lên xong (hiệu ứng mở chạy chậm khi máy bận) để dòng nằm trong màn hình.
    await expect(advance).toBeInViewport();
    await advance.click({ force: true }); // Playwright coi aria-disabled là không bấm được; bấm thẳng để thấy không có gì mở
    await expect(page).toHaveURL(/\/nv\/yeu-cau\?tao=chon$/);
    await expect(rowsOf(menuSheet(page))).toHaveCount(6);
  });

  for (const tao of ['tam-ung', 'xyz']) {
    test(`?tao=${tao} lands on the menu, never on a form`, async ({ page }) => {
      await openPhone(page, `/nv/yeu-cau?tao=${tao}`);
      const sheet = menuSheet(page);
      await expect(rowsOf(sheet)).toHaveCount(6);
      await expect(page).toHaveURL(/\/nv\/yeu-cau\?tao=chon$/);
      await expect(sheet.getByLabel('Từ ngày')).toHaveCount(0);
      await expect(sendButton(sheet)).toHaveCount(0);
    });
  }

  test('Đơn nghỉ offers six types and only valid days; Gửi stays off until the form is valid', async ({ page }) => {
    await openPhone(page, '/nv/yeu-cau');
    const sheet = await openLeaveOnPhone(page);
    await expect(sheet.getByRole('heading', { name: 'Đơn nghỉ' })).toBeVisible();
    await expect(sheet.getByLabel('Hình thức nghỉ').locator('option')).toHaveText(LEAVE_TYPES);
    const from = sheet.getByLabel('Từ ngày');
    await expect(from).toHaveValue('');
    await expect(dayOptions(from).first()).toHaveText('T4 28/10');
    const labels = await dayOptions(from).allTextContents();
    expect(labels.length).toBeGreaterThan(20);
    expect(labels.filter(l => l.startsWith('CN '))).toEqual([]);
    expect(labels).not.toContain('CN 01/11');
    await expect(sheet.getByLabel('Đến ngày')).toBeDisabled();
    await expect(sendButton(sheet)).toBeDisabled();
    await from.selectOption({ label: 'T2 02/11' });
    await expect(sheet.getByLabel('Đến ngày')).toHaveValue('2026-11-02');
    await expect(sendButton(sheet)).toBeDisabled();
    await sheet.getByLabel('Lý do').fill('   ');
    await page.waitForTimeout(500); // quá 300ms debounce: lý do chỉ có dấu cách vẫn chưa hợp lệ
    await expect(sendButton(sheet)).toBeDisabled();
    await sheet.getByLabel('Lý do').fill('Việc gia đình');
    await expect(sendButton(sheet)).toBeEnabled();
    await sheet.getByLabel('Lý do').fill('');
    await expect(sendButton(sheet)).toBeDisabled();
  });

  test('sending Phép năm 02–03/11 shows the summary, the toast and the new row on top', async ({ page }) => {
    const calls = await openPhone(page, '/nv/yeu-cau');
    const sheet = await openLeaveOnPhone(page);
    await fillLeave(sheet);
    await expect(sheet).toContainText('2 ngày làm việc: 02 và 03/11');
    await expect(sheet).toContainText('Phép năm còn 11 ngày, sau đơn này còn 9');
    await sendButton(sheet).click();
    await expect(sentToast(page)).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page).toHaveURL(/\/nv\/yeu-cau$/);
    await expect(page).not.toHaveURL(/tao=/);
    await expect(phoneRows(page).first()).toHaveAccessibleName('Phép năm 02–03/11, Chờ duyệt');
    await expect(phoneRows(page).first()).toContainText('Chờ duyệt');
    await expect(page.getByRole('tab', { name: 'Tất cả 5' })).toBeVisible();
    expect(calls).toEqual([]);
  });

  test('the summary sits between the dates and Lý do and stays while typing (J9)', async ({ page }) => {
    await openPhone(page, '/nv/yeu-cau?tao=nghi');
    const sheet = leaveSheet(page);
    await sheet.getByLabel('Từ ngày').selectOption({ label: 'T2 02/11' });
    await sheet.getByLabel('Đến ngày').selectOption({ label: 'T3 03/11' });
    // Chưa có lý do: dòng tóm tắt do máy đếm đã hiện, như board J9.
    await expect(summaryBox(sheet)).toHaveText(/2 ngày làm việc: 02 và 03\/11\s*Phép năm còn 11 ngày, sau đơn này còn 9/);
    const order = await sheet.evaluate(el => {
      const to = el.querySelectorAll('select')[2];
      const sum = el.querySelector('.nr-sum')!;
      const reason = el.querySelector('textarea')!;
      const follows = (a: Node, b: Node) => !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
      return { summaryAfterDates: follows(to, sum), reasonAfterSummary: follows(sum, reason) };
    });
    expect(order).toEqual({ summaryAfterDates: true, reasonAfterSummary: true });
    const box = summaryBox(sheet);
    for (const text of ['V', 'Vi', 'Việc', 'Việc gia', 'Việc gia đình']) {
      await sheet.getByLabel('Lý do').fill(text);
      await expect(box).toBeVisible({ timeout: 50 });
      await expect(box).toContainText('Phép năm còn 11 ngày, sau đơn này còn 9', { timeout: 50 });
    }
    await expect(sendButton(sheet)).toBeEnabled();
  });

  test('too many Phép năm days: the summary says why and Gửi stays off; the reason stays while editing', async ({ page }) => {
    await openPhone(page, '/nv/yeu-cau?tao=nghi');
    const sheet = leaveSheet(page);
    await sheet.getByLabel('Từ ngày').selectOption({ label: 'T2 02/11' });
    await sheet.getByLabel('Đến ngày').selectOption({ label: 'T7 14/11' });
    await sheet.getByLabel('Lý do').fill('Du lịch');
    await expect(summaryBox(sheet)).toContainText('12 ngày làm việc');
    await expect(summaryBox(sheet)).toContainText('Phép năm chỉ còn 11 ngày');
    await expect(summaryBox(sheet)).not.toContainText('sau đơn này');
    await expect(sendButton(sheet)).toBeDisabled();
    await sheet.getByLabel('Lý do').fill('Du lịch xa');
    await expect(summaryBox(sheet)).toContainText('Phép năm chỉ còn 11 ngày', { timeout: 50 });
    await sheet.getByLabel('Hình thức nghỉ').selectOption({ label: 'Không lương' });
    await expect(sendButton(sheet)).toBeEnabled();
    await expect(summaryBox(sheet)).not.toContainText('Phép năm');
  });

  test('a refused send keeps the form, shows the error under Gửi and reloads the choices', async ({ page }) => {
    const calls = await openPhone(page, '/nv/yeu-cau?tao=nghi');
    const sheet = leaveSheet(page);
    await fillLeave(sheet);
    expect(await otherDeviceTakes0311(page)).toBe(true);
    await sendButton(sheet).click();
    await expect(sendErrorLine(sheet)).toHaveText('Ngày 03/11 đã có đơn nghỉ');
    await expect(page.getByRole('dialog', { name: 'Đơn nghỉ' })).toBeVisible();
    await expect(sentToast(page)).toHaveCount(0);
    // Form giữ nguyên; request-context đã tải lại nên 03/11 không còn chọn được và "Đến ngày" về 02/11.
    await expect(sheet.getByLabel('Hình thức nghỉ')).toHaveValue('ANNUAL');
    await expect(sheet.getByLabel('Từ ngày')).toHaveValue('2026-11-02');
    await expect(sheet.getByLabel('Lý do')).toHaveValue('Việc gia đình');
    await expect(dayOptions(sheet.getByLabel('Đến ngày'))).toHaveText(['T2 02/11']);
    await expect(sheet.getByLabel('Đến ngày')).toHaveValue('2026-11-02');
    await expect(summaryBox(sheet)).toContainText('1 ngày làm việc: 02/11');
    await expect(sendButton(sheet)).toBeEnabled();
    await expect(sendErrorLine(sheet)).toHaveText('Ngày 03/11 đã có đơn nghỉ');
    // Người dùng sửa form thì câu lỗi cũ mất.
    await sheet.getByLabel('Lý do').fill('Việc gia đình gấp');
    await expect(sendErrorLine(sheet)).toHaveCount(0);
    expect(calls).toEqual([]);
  });

  test('a refused send whose context reload also fails keeps the form, the input and the error line', async ({ page }) => {
    await openPhone(page, '/nv/yeu-cau?tao=nghi');
    const sheet = leaveSheet(page);
    await fillLeave(sheet);
    expect(await otherDeviceTakes0311(page)).toBe(true);
    await failContext(page, 'Mất kết nối, chưa tải lại được.');
    await sendButton(sheet).click();
    await expect(sendErrorLine(sheet)).toHaveText('Ngày 03/11 đã có đơn nghỉ');
    await expect(sheet).not.toContainText('Mất kết nối, chưa tải lại được.');
    await expect(sheet.getByLabel('Hình thức nghỉ')).toHaveValue('ANNUAL');
    await expect(sheet.getByLabel('Từ ngày')).toHaveValue('2026-11-02');
    await expect(sheet.getByLabel('Đến ngày')).toHaveValue('2026-11-03');
    await expect(sheet.getByLabel('Lý do')).toHaveValue('Việc gia đình');
    // Xem trước chạy lại trên máy chủ: ngày 03/11 đã bị giữ nên Gửi tắt và hộp tóm tắt nói vì sao.
    await expect(summaryBox(sheet)).toContainText('Ngày 03/11 đã có đơn nghỉ');
    await expect(sendButton(sheet)).toBeDisabled();
    await expect(sendErrorLine(sheet)).toHaveText('Ngày 03/11 đã có đơn nghỉ');
  });

  test('a first context load that fails shows its message and still closes', async ({ page }) => {
    await page.addInitScript(() => {
      (window as unknown as { __mockRequestContextError: string }).__mockRequestContextError = 'Mất kết nối.';
    });
    await openPhone(page, '/nv/yeu-cau?tao=chon');
    const sheet = menuSheet(page);
    await expect(sheet.getByRole('alert')).toContainText('Mất kết nối.');
    await expect(sheet.getByRole('alert').getByRole('button', { name: 'Thử lại' })).toBeVisible(); // có nút tải lại, không chỉ đóng
    await expect(rowsOf(sheet)).toHaveCount(0);
    await sheet.getByRole('button', { name: 'Đóng' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page).toHaveURL(/\/nv\/yeu-cau$/);
  });

  test('held days are no longer offered and Đến ngày stops before them', async ({ page }) => {
    await openPhone(page, '/nv/yeu-cau');
    let sheet = await openLeaveOnPhone(page);
    await fillLeave(sheet);
    await sendButton(sheet).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);

    sheet = await openLeaveOnPhone(page);
    const labels = await dayOptions(sheet.getByLabel('Từ ngày')).allTextContents();
    expect(labels).not.toContain('T2 02/11');
    expect(labels).not.toContain('T3 03/11');
    expect(labels).toContain('T4 04/11');
    await sheet.getByLabel('Từ ngày').selectOption({ label: 'T6 30/10' });
    await expect(dayOptions(sheet.getByLabel('Đến ngày'))).toHaveText(['T6 30/10', 'T7 31/10']);
    await sheet.getByRole('button', { name: 'Quay lại chọn loại' }).click();
    await expect(kindRow(menuSheet(page), 'Đơn nghỉ')).toContainText('Phép năm còn 9 ngày');
  });

  test('changing Từ ngày past the chosen Đến ngày resets Đến ngày', async ({ page }) => {
    await openPhone(page, '/nv/yeu-cau');
    const sheet = await openLeaveOnPhone(page);
    const from = sheet.getByLabel('Từ ngày');
    const to = sheet.getByLabel('Đến ngày');
    await from.selectOption({ label: 'T2 02/11' });
    await to.selectOption({ label: 'T5 05/11' });
    await from.selectOption({ label: 'T6 30/10' });
    await expect(to).toHaveValue('2026-11-05'); // vẫn hợp lệ: giữ nguyên
    await from.selectOption({ label: 'T6 06/11' });
    await expect(to).toHaveValue('2026-11-06');
    const ends = await dayOptions(to).allTextContents();
    expect(ends[0]).toBe('T6 06/11');
    expect(ends).not.toContain('T5 05/11');
  });

  test('a double click on Gửi creates exactly one request; the button is off while sending', async ({ page }) => {
    await openPhone(page, '/nv/yeu-cau');
    const sheet = await openLeaveOnPhone(page);
    await fillLeave(sheet);
    // Độ trễ đặt trong trang (mock/respond.ts đọc __mockLatencyMs), không chặn mạng.
    await page.evaluate(() => ((window as unknown as { __mockLatencyMs: number }).__mockLatencyMs = 600));
    await sendButton(sheet).dblclick();
    await expect(sendButton(sheet)).toBeDisabled();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByRole('tab', { name: 'Tất cả 5' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Phép năm 02–03/11, Chờ duyệt' })).toHaveCount(1);
  });

  for (const how of ['Esc', '✕', 'scrim'] as const) {
    test(`${how} closes the flow, drops tao and ngay, and reopening starts empty`, async ({ page }) => {
      await openPhone(page, '/nv/yeu-cau?tao=nghi&ngay=2026-10-24');
      const sheet = leaveSheet(page);
      await sheet.getByLabel('Từ ngày').selectOption({ label: 'T2 02/11' });
      await sheet.getByLabel('Lý do').fill('Việc gia đình');
      if (how === 'Esc') await page.keyboard.press('Escape');
      if (how === '✕') await sheet.getByRole('button', { name: 'Đóng' }).click();
      if (how === 'scrim') await page.locator('.ph-sheet-scrim').click({ position: { x: 10, y: 10 } });
      await expect(page.getByRole('dialog')).toHaveCount(0);
      await expect(page).toHaveURL(/\/nv\/yeu-cau$/);

      await page.getByRole('button', { name: 'Tạo yêu cầu' }).click();
      await expect(rowsOf(menuSheet(page))).toHaveCount(6);
      await kindRow(menuSheet(page), 'Đơn nghỉ').click();
      await expect(leaveSheet(page).getByLabel('Từ ngày')).toHaveValue('');
      await expect(leaveSheet(page).getByLabel('Lý do')).toHaveValue('');
      await expect(sendButton(leaveSheet(page))).toBeDisabled();
    });
  }

  test('‹ goes back from the form to the menu', async ({ page }) => {
    await openPhone(page, '/nv/yeu-cau');
    const sheet = await openLeaveOnPhone(page);
    await sheet.getByRole('button', { name: 'Quay lại chọn loại' }).click();
    await expect(page).toHaveURL(/\/nv\/yeu-cau\?tao=chon$/);
    await expect(rowsOf(menuSheet(page))).toHaveCount(6);
    await expect(kindRow(menuSheet(page), 'Đơn nghỉ')).toBeFocused();
  });

  // Thông báo "Đã gửi yêu cầu" nổi trên thanh tab, không che và không chặn thanh tab, không bóng (thanh tab cấm bóng).
  for (const size of [
    { width: 320, height: 640 },
    { width: 390, height: 844 }
  ]) {
    test(`the sent toast floats above the tab bar at ${size.width}px`, async ({ page }) => {
      await openPhone(page, '/nv/yeu-cau', size);
      const sheet = await openLeaveOnPhone(page);
      await fillLeave(sheet);
      await sendButton(sheet).click();
      const toast = sentToast(page);
      await expect(toast).toBeVisible();
      const bar = (await page.getByRole('navigation', { name: 'Điều hướng' }).boundingBox())!;
      const box = (await toast.boundingBox())!;
      expect(box.y + box.height).toBeLessThanOrEqual(bar.y - 8);
      const hit = await page.evaluate(
        ([x, y]) => !!document.elementFromPoint(x, y)?.closest('nav[aria-label="Điều hướng"]'),
        [bar.x + bar.width / 2, bar.y + bar.height / 2]
      );
      expect(hit).toBe(true);
      await expect(toast).toHaveCSS('box-shadow', 'none');
    });
  }

  test('fields have 8px corners and no shadow', async ({ page }) => {
    await openPhone(page, '/nv/yeu-cau?tao=nghi');
    const sheet = leaveSheet(page);
    for (const label of ['Hình thức nghỉ', 'Từ ngày', 'Đến ngày', 'Lý do']) {
      await expect(sheet.getByLabel(label)).toHaveCSS('border-radius', '8px');
      await expect(sheet.getByLabel(label)).toHaveCSS('box-shadow', 'none');
    }
    await expect(sendButton(sheet)).toHaveCSS('border-radius', '8px');
  });
});

test.describe('desktop', () => {
  test('Tạo yêu cầu in the Today column opens the K3 drawer; ‹ returns from the form to the menu', async ({ page }) => {
    const calls = await openDesktop(page, '/nv/hom-nay');
    await page.getByRole('button', { name: 'Tạo yêu cầu' }).click();
    await expect(page).toHaveURL(/\/nv\/yeu-cau\?tao=chon$/);
    const drawer = menuSheet(page);
    await expect(page.locator('.sd-drawer')).toHaveCount(1);
    await expect(page.locator('.ph-sheet')).toHaveCount(0);
    await expect(drawer).toContainText('Chọn loại để điền đơn');
    await expect(rowsOf(drawer).locator('b')).toHaveText(KINDS);
    await expect(kindRow(drawer, 'Tạm ứng')).toBeDisabled();
    await expect(kindRow(drawer, 'Tạm ứng')).toContainText('Chỉ nộp ngày 16 và 17');
    await kindRow(drawer, 'Đơn nghỉ').click();
    await expect(page).toHaveURL(/\/nv\/yeu-cau\?tao=nghi$/);
    const form = leaveSheet(page);
    await expect(form.getByLabel('Hình thức nghỉ').locator('option')).toHaveText(LEAVE_TYPES);
    await expect(dayOptions(form.getByLabel('Từ ngày')).first()).toHaveText('T4 28/10');
    await form.getByRole('button', { name: 'Quay lại chọn loại' }).click();
    await expect(page).toHaveURL(/\/nv\/yeu-cau\?tao=chon$/);
    await expect(rowsOf(menuSheet(page))).toHaveCount(6);
    expect(calls).toEqual([]);
  });

  test('sending from K3 closes the drawer and puts the request on top of the Today list', async ({ page }) => {
    await openDesktop(page, '/nv/yeu-cau?tao=nghi');
    const form = leaveSheet(page);
    await fillLeave(form);
    await expect(form).toContainText('2 ngày làm việc: 02 và 03/11');
    await expect(form).toContainText('Phép năm còn 11 ngày, sau đơn này còn 9');
    await sendButton(form).click();
    await expect(sentToast(page)).toBeVisible();
    await expect(sentToast(page)).toHaveCSS('box-shadow', 'none');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page).not.toHaveURL(/tao=/);
    const list = page.getByRole('tabpanel', { name: 'Danh sách yêu cầu, cuộn để xem thêm' });
    await expect(list.getByRole('link').first()).toHaveAccessibleName('Phép năm 02–03/11, Chờ duyệt');
  });

  for (const how of ['Esc', '✕', 'scrim'] as const) {
    test(`${how} closes K3, drops tao and ngay, and reopening starts empty`, async ({ page }) => {
      await openDesktop(page, '/nv/yeu-cau?tao=nghi&ngay=2026-10-24');
      const form = leaveSheet(page);
      await form.getByLabel('Từ ngày').selectOption({ label: 'T2 02/11' });
      await form.getByLabel('Lý do').fill('Việc gia đình');
      if (how === 'Esc') await page.keyboard.press('Escape');
      if (how === '✕') await form.getByRole('button', { name: 'Đóng' }).click();
      if (how === 'scrim') await page.locator('.sd-scrim').click({ position: { x: 10, y: 10 } });
      await expect(page.getByRole('dialog')).toHaveCount(0);
      await expect(page).toHaveURL(/\/nv\/yeu-cau$/);

      await page.getByRole('button', { name: 'Tạo yêu cầu' }).click();
      await expect(rowsOf(menuSheet(page))).toHaveCount(6);
      await kindRow(menuSheet(page), 'Đơn nghỉ').click();
      await expect(leaveSheet(page).getByLabel('Từ ngày')).toHaveValue('');
      await expect(leaveSheet(page).getByLabel('Lý do')).toHaveValue('');
    });
  }
});
