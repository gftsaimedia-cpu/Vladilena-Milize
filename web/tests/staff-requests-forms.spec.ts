// Năm form còn lại của luồng "Tạo yêu cầu" (spec staff-requests 4.4–4.5, board J14–J18) trên dữ liệu giả: Nghỉ có làm bù,
// Làm thêm giờ, Đổi ca, Giải trình, Tạm ứng. Hôm nay là 28/10/2026, Nam làm ca 08–17 thứ Hai – thứ Bảy; tháng 10 đã có 9 giờ
// OT nên Nghỉ có làm bù chỉ nộp được cho tháng 11. Ngày cần giải trình: 24/10 (thiếu giờ ra) và 09/10 (vào muộn).
// Đơn tạo trong phiên nằm trong bộ nhớ của trang.
import { expect, test, type Locator, type Page } from '@playwright/test';
import { openDesktop } from './fixtures/staff-desktop';
import { openPhone } from './fixtures/staff-phone';

const FRAMES = ['Normal 08–17', 'Normal 10–19', 'Flex 06–15', 'Flex 13–22', 'Night 22–07', 'Night 21–06'];

const rowsOf = (dialog: Locator) => dialog.getByRole('group', { name: 'Loại yêu cầu' }).getByRole('button');
const kindRow = (dialog: Locator, name: string) =>
  rowsOf(dialog).filter({ has: dialog.page().getByText(name, { exact: true }) });
const choices = (select: Locator) => select.locator('option:not([value=""])');
const sheetOf = (page: Page, name: string) => page.getByRole('dialog', { name });
const sendButton = (dialog: Locator) => dialog.getByRole('button', { name: 'Gửi yêu cầu' });
const phoneRows = (page: Page) => page.getByRole('tabpanel').getByRole('link');
const sentToast = (page: Page) => page.getByRole('status').filter({ hasText: 'Đã gửi yêu cầu' });
const summaryBox = (dialog: Locator) => dialog.locator('.nr-sum');
const controls = (dialog: Locator) => dialog.locator('.nr-form').locator('input, select, textarea');

// "Máy khác" tạo đơn nghỉ vào cùng kho dữ liệu giả mà app đang dùng (cùng URL module của Vite), trước khi form tải request-context.
const otherDevice = (page: Page, kind: string, draft: Record<string, string>) =>
  page.evaluate(
    `import('/src/mock/staff-requests.ts').then(m => m.createRequest('${kind}', ${JSON.stringify(draft)}).ok)`
  );
const otherDeviceLeave = (page: Page, date: string) =>
  otherDevice(page, 'leave', { leaveType: 'PERSONAL_PAID', startDate: date, endDate: date, reason: 'Máy khác' });
const sendErrorLine = (dialog: Locator) => dialog.locator('.nr-send + [role="alert"]');

async function openKind(page: Page, kind: string) {
  await page.getByRole('button', { name: 'Tạo yêu cầu' }).click();
  await kindRow(sheetOf(page, 'Tạo yêu cầu'), kind).click();
  return sheetOf(page, kind);
}

async function expectSent(page: Page, title: string) {
  await expect(sentToast(page)).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page).not.toHaveURL(/tao=/);
  await expect(phoneRows(page).first()).toHaveAccessibleName(`${title}, Chờ duyệt`);
}

test.describe('menu', () => {
  test('every kind the server allows opens its own form; no row is left without one', async ({ page }) => {
    const calls = await openPhone(page, '/nv/yeu-cau?tao=chon');
    const menu = sheetOf(page, 'Tạo yêu cầu');
    await expect(rowsOf(menu)).toHaveCount(7);
    await expect(menu).not.toContainText('Chưa có trong bản mockup');
    const hints: [string, string, string][] = [
      ['Nghỉ có làm bù', 'Nghỉ 1 ngày thì bù đủ 8 giờ trong tháng', 'nghi-bu'],
      ['Nghỉ giữa ca', 'Làm nửa ca, nửa còn lại bù bằng làm thêm giờ trong tháng', 'nghi-giua-ca'],
      ['Làm thêm giờ', 'Ngoài ca, cách ca ít nhất 1 giờ', 'ot'],
      ['Đổi ca', 'Normal, Flex hoặc Night cho một khoảng ngày', 'doi-ca'],
      ['Giải trình', 'Cho một ngày chấm công chưa hợp lệ', 'giai-trinh']
    ];
    for (const [kind, hint, slug] of hints) {
      const row = kindRow(sheetOf(page, 'Tạo yêu cầu'), kind);
      await expect(row).not.toHaveAttribute('aria-disabled', /.*/);
      await expect(row).toHaveAccessibleDescription(hint);
      await row.click();
      await expect(page).toHaveURL(new RegExp(`\\?tao=${slug}$`));
      await expect(sheetOf(page, kind).getByRole('heading', { name: kind })).toBeVisible();
      await expect(sendButton(sheetOf(page, kind))).toBeDisabled();
      await sheetOf(page, kind).getByRole('button', { name: 'Quay lại chọn loại' }).click();
    }
    expect(calls).toEqual([]);
  });

  for (const slug of ['nghi-bu', 'ot', 'doi-ca', 'giai-trinh']) {
    test(`?tao=${slug} opens the form straight away`, async ({ page }) => {
      await openPhone(page, `/nv/yeu-cau?tao=${slug}`);
      await expect(sendButton(page.getByRole('dialog'))).toBeVisible();
      await expect(page).toHaveURL(new RegExp(`\\?tao=${slug}$`));
    });
  }
});

test.describe('Làm thêm giờ', () => {
  test('offers only days with hours, and only valid round hours', async ({ page }) => {
    const calls = await openPhone(page, '/nv/yeu-cau');
    expect(await otherDeviceLeave(page, '2026-11-02')).toBe(true);
    const sheet = await openKind(page, 'Làm thêm giờ');
    const day = sheet.getByLabel('Ngày');
    await expect(day).toHaveValue('');
    const days = await choices(day).allTextContents();
    expect(days[0]).toBe('T4 28/10');
    expect(days).toContain('CN 01/11'); // không có ca: cả ngày 06–22
    expect(days).not.toContain('T2 02/11'); // đang nghỉ: không còn giờ
    expect(days).toContain('T3 03/11');
    await expect(sheet.getByLabel('Giờ bắt đầu')).toBeDisabled();
    await expect(sheet.getByLabel('Giờ kết thúc')).toBeDisabled();

    await day.selectOption({ label: 'T5 29/10' });
    await expect(choices(sheet.getByLabel('Giờ bắt đầu'))).toHaveText(['06:00', '18:00', '19:00', '20:00', '21:00']);
    await expect(summaryBox(sheet)).toContainText('Đã đăng ký tháng 10: 9 / 40 giờ');
    await sheet.getByLabel('Giờ bắt đầu').selectOption({ label: '18:00' });
    await expect(choices(sheet.getByLabel('Giờ kết thúc'))).toHaveText(['19:00', '20:00', '21:00', '22:00']);
    await sheet.getByLabel('Giờ bắt đầu').selectOption({ label: '06:00' });
    await expect(choices(sheet.getByLabel('Giờ kết thúc'))).toHaveText(['07:00']);
    await expect(sheet.getByLabel('Giờ kết thúc')).toHaveValue('07:00');
    await expect(sendButton(sheet)).toBeDisabled();
    expect(calls).toEqual([]);
  });

  test('sending 29/10 18–20h adds "Làm thêm 29/10 18–20h"; its hours are then taken', async ({ page }) => {
    const calls = await openPhone(page, '/nv/yeu-cau');
    let sheet = await openKind(page, 'Làm thêm giờ');
    await sheet.getByLabel('Ngày').selectOption({ label: 'T5 29/10' });
    await sheet.getByLabel('Giờ bắt đầu').selectOption({ label: '18:00' });
    await sheet.getByLabel('Giờ kết thúc').selectOption({ label: '20:00' });
    await expect(summaryBox(sheet)).toContainText('2 giờ làm thêm, sau ca 08–17');
    await expect(summaryBox(sheet)).toContainText('Đã đăng ký tháng 10: 9 / 40 giờ');
    await expect(sendButton(sheet)).toBeDisabled();
    await sheet.getByLabel('Lý do').fill('Chạy bảng lương cuối tháng');
    await expect(sendButton(sheet)).toBeEnabled();
    await sendButton(sheet).click();
    await expectSent(page, 'Làm thêm 29/10 18–20h');

    sheet = await openKind(page, 'Làm thêm giờ');
    await sheet.getByLabel('Ngày').selectOption({ label: 'T5 29/10' });
    await expect(choices(sheet.getByLabel('Giờ bắt đầu'))).toHaveText(['06:00', '20:00', '21:00']);
    await expect(summaryBox(sheet)).toContainText('Đã đăng ký tháng 10: 11 / 40 giờ');
    expect(calls).toEqual([]);
  });

  test('a refused send keeps the form and the error line while the hours reload', async ({ page }) => {
    await openPhone(page, '/nv/yeu-cau?tao=ot');
    const sheet = sheetOf(page, 'Làm thêm giờ');
    await sheet.getByLabel('Ngày').selectOption({ label: 'T5 29/10' });
    await sheet.getByLabel('Giờ bắt đầu').selectOption({ label: '18:00' });
    await sheet.getByLabel('Giờ kết thúc').selectOption({ label: '20:00' });
    await sheet.getByLabel('Lý do').fill('Chạy bảng lương cuối tháng');
    await expect(sendButton(sheet)).toBeEnabled();
    const ot = { otDate: '2026-10-29', startTime: '18:00', endTime: '20:00', reason: 'Máy khác' };
    expect(await otherDevice(page, 'overtime', ot)).toBe(true);
    await sendButton(sheet).click();
    await expect(sendErrorLine(sheet)).toHaveText('Giờ làm thêm 29/10 không chọn được');
    await expect(sentToast(page)).toHaveCount(0);
    // request-context đã tải lại: 18–20 đã bị máy khác lấy nên "Từ" về trống, ngày và lý do giữ nguyên.
    await expect(sheet.getByLabel('Ngày')).toHaveValue('2026-10-29');
    await expect(sheet.getByLabel('Giờ bắt đầu')).toHaveValue('');
    await expect(choices(sheet.getByLabel('Giờ bắt đầu'))).toHaveText(['06:00', '20:00', '21:00']);
    await expect(sheet.getByLabel('Lý do')).toHaveValue('Chạy bảng lương cuối tháng');
    await expect(sendErrorLine(sheet)).toHaveText('Giờ làm thêm 29/10 không chọn được');
    await sheet.getByLabel('Giờ bắt đầu').selectOption({ label: '20:00' });
    await expect(sendErrorLine(sheet)).toHaveCount(0);
    await expect(sendButton(sheet)).toBeEnabled();
  });
});

test.describe('Nghỉ có làm bù', () => {
  test('offers no October day, because October has OT', async ({ page }) => {
    const calls = await openPhone(page, '/nv/yeu-cau?tao=nghi-bu');
    const sheet = sheetOf(page, 'Nghỉ có làm bù');
    const from = sheet.getByLabel('Từ ngày');
    await expect(from).toHaveValue('');
    const days = await choices(from).allTextContents();
    expect(days[0]).toBe('T2 02/11');
    expect(days.filter(d => d.endsWith('/10'))).toEqual([]);
    expect(days).not.toContain('T2 30/11'); // sau đó không còn ngày trong tháng để bù
    await expect(sheet.getByText('Khung bù', { exact: true })).toHaveCount(0);
    expect(calls).toEqual([]);
  });

  test('after the leave days come the slot rows; Gửi waits until 8 hours are planned', async ({ page }) => {
    const calls = await openPhone(page, '/nv/yeu-cau?tao=nghi-bu');
    const sheet = sheetOf(page, 'Nghỉ có làm bù');
    await sheet.getByLabel('Từ ngày').selectOption({ label: 'T2 02/11' });
    await expect(sheet.getByLabel('Đến ngày')).toHaveValue('2026-11-02');
    await expect(summaryBox(sheet)).toContainText('1 ngày làm việc: 02/11');
    await expect(summaryBox(sheet)).toContainText('Cần bù 8 giờ, sau ngày nghỉ cuối và trong tháng 11');
    await expect(sheet.getByText('Đã xếp 0 / 8 giờ')).toBeVisible();
    const date = sheet.getByLabel('Ngày bù, khung 1');
    await expect(date).toHaveValue('');
    const dates = await choices(date).allTextContents();
    expect(dates[0]).toBe('T3 03/11'); // sau ngày nghỉ cuối
    expect(dates).not.toContain('T2 02/11');
    expect(dates.every(d => d.endsWith('/11'))).toBe(true);
    await sheet.getByLabel('Lý do').fill('Việc gia đình buổi sáng');
    await page.waitForTimeout(500); // quá 300ms debounce: chưa có khung bù nào
    await expect(sendButton(sheet)).toBeDisabled();

    await date.selectOption({ label: 'CN 08/11' });
    await sheet.getByLabel('Từ giờ, khung 1').selectOption({ label: '08:00' });
    // Không đưa ra quá số giờ còn phải bù: từ 08:00 chỉ tới 16:00.
    const ends = await choices(sheet.getByLabel('Đến giờ, khung 1')).allTextContents();
    expect(ends.at(-1)).toBe('16:00');
    await sheet.getByLabel('Đến giờ, khung 1').selectOption({ label: '12:00' });
    await expect(sheet.getByText('Đã xếp 4 / 8 giờ')).toBeVisible();
    await expect(summaryBox(sheet)).toContainText('Còn thiếu 4 giờ bù');
    await expect(sendButton(sheet)).toBeDisabled();
    await expect(sheet.getByText('Xếp đủ 8 giờ bù thì mới gửi được')).toBeVisible();
    await expect(sheet.getByRole('button', { name: 'Thêm khung bù' })).toBeEnabled();

    await sheet.getByLabel('Đến giờ, khung 1').selectOption({ label: '16:00' });
    await expect(sheet.getByText('Đã xếp 8 / 8 giờ')).toBeVisible();
    await expect(sendButton(sheet)).toBeEnabled();
    await expect(sheet.getByText('Xếp đủ 8 giờ bù thì mới gửi được')).toHaveCount(0);
    await expect(sheet.getByRole('button', { name: 'Thêm khung bù' })).toBeDisabled();
    await sendButton(sheet).click();
    await expectSent(page, 'Nghỉ có làm bù 02/11');
    expect(calls).toEqual([]);
  });

  test('a slot hour already used in another row of the same day is not offered', async ({ page }) => {
    await openPhone(page, '/nv/yeu-cau?tao=nghi-bu');
    const sheet = sheetOf(page, 'Nghỉ có làm bù');
    await sheet.getByLabel('Từ ngày').selectOption({ label: 'T2 02/11' });
    await sheet.getByLabel('Ngày bù, khung 1').selectOption({ label: 'T3 03/11' });
    await sheet.getByLabel('Từ giờ, khung 1').selectOption({ label: '18:00' });
    await sheet.getByLabel('Đến giờ, khung 1').selectOption({ label: '20:00' });
    await expect(sheet.getByText('Đã xếp 2 / 8 giờ')).toBeVisible();

    await sheet.getByRole('button', { name: 'Thêm khung bù' }).click();
    await expect(sheet.getByLabel('Ngày bù, khung 2')).toBeFocused();
    await sheet.getByLabel('Ngày bù, khung 2').selectOption({ label: 'T3 03/11' });
    await expect(choices(sheet.getByLabel('Từ giờ, khung 2'))).toHaveText(['06:00', '20:00', '21:00']);
    await sheet.getByLabel('Từ giờ, khung 2').selectOption({ label: '20:00' });
    await sheet.getByLabel('Đến giờ, khung 2').selectOption({ label: '22:00' });
    await expect(sheet.getByText('Đã xếp 4 / 8 giờ')).toBeVisible();
    // Dòng 1 không còn được lấn sang 20–22 của dòng 2.
    await expect(choices(sheet.getByLabel('Từ giờ, khung 1'))).toHaveText(['06:00', '18:00', '19:00']);
    await expect(choices(sheet.getByLabel('Đến giờ, khung 1'))).toHaveText(['19:00', '20:00']);

    // Còn thiếu 4 giờ: dòng 3 ngày Chủ nhật từ 08:00 chỉ tới 12:00.
    await sheet.getByRole('button', { name: 'Thêm khung bù' }).click();
    await sheet.getByLabel('Ngày bù, khung 3').selectOption({ label: 'CN 08/11' });
    await sheet.getByLabel('Từ giờ, khung 3').selectOption({ label: '08:00' });
    await expect(choices(sheet.getByLabel('Đến giờ, khung 3'))).toHaveText(['09:00', '10:00', '11:00', '12:00']);
    await sheet.getByRole('button', { name: 'Bỏ khung 3' }).click();
    await expect(sheet.getByLabel('Ngày bù, khung 3')).toHaveCount(0);
    await expect(sheet.getByText('Đã xếp 4 / 8 giờ')).toBeVisible();
  });

  test('changing the leave days drops slots that are no longer after the last leave day', async ({ page }) => {
    await openPhone(page, '/nv/yeu-cau?tao=nghi-bu');
    const sheet = sheetOf(page, 'Nghỉ có làm bù');
    await sheet.getByLabel('Từ ngày').selectOption({ label: 'T2 02/11' });
    await sheet.getByLabel('Ngày bù, khung 1').selectOption({ label: 'T3 03/11' });
    await sheet.getByLabel('Từ giờ, khung 1').selectOption({ label: '18:00' });
    await sheet.getByLabel('Đến giờ, khung 1').selectOption({ label: '22:00' });
    await sheet.getByLabel('Đến ngày').selectOption({ label: 'T3 03/11' });
    await expect(sheet.getByText('Đã xếp 0 / 16 giờ')).toBeVisible();
    await expect(sheet.getByLabel('Ngày bù, khung 1')).toHaveValue('');
    await expect(choices(sheet.getByLabel('Ngày bù, khung 1')).first()).toHaveText('T4 04/11');
  });
});

test.describe('Đổi ca', () => {
  test('six frames, then the summary with the kept leave day, then send', async ({ page }) => {
    const calls = await openPhone(page, '/nv/yeu-cau');
    expect(await otherDeviceLeave(page, '2026-11-04')).toBe(true);
    const sheet = await openKind(page, 'Đổi ca');
    const frames = sheet.getByRole('radiogroup', { name: 'Ca mới' }).getByRole('radio');
    await expect(frames).toHaveCount(6);
    for (const [i, name] of FRAMES.entries()) await expect(frames.nth(i)).toHaveAccessibleName(name);
    for (let i = 0; i < 6; i++) await expect(frames.nth(i)).not.toBeChecked();

    await sheet.getByLabel('Từ ngày').selectOption({ label: 'T2 02/11' });
    await sheet.getByLabel('Đến ngày').selectOption({ label: 'T7 07/11' });
    await sheet.getByRole('radio', { name: 'Flex 06–15' }).check();
    await expect(summaryBox(sheet)).toContainText('5 ngày đổi sang Flex 06–15: 02, 03, 05, 06 và 07/11');
    await expect(sendButton(sheet)).toBeDisabled();
    await sheet.getByLabel('Lý do').fill('Đưa đón con tuần này');
    await expect(sendButton(sheet)).toBeEnabled();
    await expect(summaryBox(sheet)).toContainText('Ngày 04/11 đang nghỉ, giữ nguyên ngày nghỉ, không đổi ca.');
    await sendButton(sheet).click();
    await expectSent(page, 'Đổi ca Flex 06–15, 02–07/11');
    expect(calls).toEqual([]);
  });

  test('days of a filed shift change are not offered again, and ends stop before them', async ({ page }) => {
    const calls = await openPhone(page, '/nv/yeu-cau');
    let sheet = await openKind(page, 'Đổi ca');
    await sheet.getByLabel('Từ ngày').selectOption({ label: 'T2 02/11' });
    await sheet.getByLabel('Đến ngày').selectOption({ label: 'T7 07/11' });
    await sheet.getByRole('radio', { name: 'Flex 06–15' }).check();
    await sheet.getByLabel('Lý do').fill('Đưa đón con tuần này');
    await expect(sendButton(sheet)).toBeEnabled();
    await sendButton(sheet).click();
    await expectSent(page, 'Đổi ca Flex 06–15, 02–07/11');

    sheet = await openKind(page, 'Đổi ca');
    const from = sheet.getByLabel('Từ ngày');
    const starts = await choices(from).allTextContents();
    for (const day of ['T2 02/11', 'T3 03/11', 'T4 04/11', 'T5 05/11', 'T6 06/11', 'T7 07/11'])
      expect(starts).not.toContain(day);
    expect(starts).not.toContain('CN 01/11'); // từ đó tới ngày đã đổi ca chỉ có Chủ nhật
    expect(starts).toContain('T7 31/10');
    expect(starts).toContain('CN 08/11'); // sau đó còn ngày làm để đổi
    await from.selectOption({ label: 'T4 28/10' });
    await expect(choices(sheet.getByLabel('Đến ngày'))).toHaveText(['T4 28/10', 'T5 29/10', 'T6 30/10', 'T7 31/10', 'CN 01/11']);
    expect(calls).toEqual([]);
  });
});

test.describe('Giải trình', () => {
  test('&ngay=2026-10-24 prefills T7 24/10 with its case as text and one "Giờ ra thực tế"', async ({ page }) => {
    const calls = await openPhone(page, '/nv/yeu-cau?tao=giai-trinh&ngay=2026-10-24');
    const sheet = sheetOf(page, 'Giải trình');
    const day = sheet.getByLabel('Ngày');
    await expect(day).toHaveValue('2026-10-24');
    await expect(day.locator('option:checked')).toHaveText('T7 24/10');
    await expect(choices(day)).toHaveText(['T7 24/10', 'T6 09/10']);
    await expect(sheet.getByText('Thiếu giờ ra', { exact: true })).toBeVisible();
    await expect(sheet).toContainText('Giờ vào 07:52, không có giờ ra');
    await expect(sheet.getByLabel('Giờ ra thực tế')).toHaveAttribute('type', 'time');
    await expect(sheet.getByLabel('Giờ vào thực tế')).toHaveCount(0);
    await expect(sheet.locator('input[type="time"]')).toHaveCount(1);
    await expect(sheet.locator('textarea')).toHaveCount(1);
    await expect(controls(sheet)).toHaveCount(3); // Ngày, Giờ ra thực tế, Lý do: trường hợp không sửa được

    await day.selectOption({ label: 'T6 09/10' });
    await expect(sheet.getByText('Vào muộn', { exact: true })).toBeVisible();
    await expect(sheet).toContainText('Giờ vào 08:25, giờ ra');
    await expect(sheet.locator('input[type="time"]')).toHaveCount(0);
    await expect(sheet).toContainText('Trường hợp này không cần nhập giờ, chỉ cần lý do.');
    await expect(controls(sheet)).toHaveCount(2);
    expect(calls).toEqual([]);
  });

  // Review Focus 2: ngày không cần giải trình (20/10 không có gì, 27/10 đã có đơn) hay giá trị rác thì không chọn sẵn.
  for (const ngay of ['2026-10-20', '2026-10-27', 'abc']) {
    test(`&ngay=${ngay} leaves the date unchosen`, async ({ page }) => {
      await openPhone(page, `/nv/yeu-cau?tao=giai-trinh&ngay=${ngay}`);
      const sheet = sheetOf(page, 'Giải trình');
      await expect(sheet.getByLabel('Ngày')).toHaveValue('');
      await expect(sheet.getByLabel('Ngày').locator('option:checked')).toHaveText('Chọn ngày');
      await expect(choices(sheet.getByLabel('Ngày'))).toHaveText(['T7 24/10', 'T6 09/10']);
      await expect(sheet.locator('input[type="time"]')).toHaveCount(0);
      await expect(sheet.getByText('Trường hợp', { exact: true })).toHaveCount(0);
      await expect(sendButton(sheet)).toBeDisabled();
    });
  }

  test('sending 24/10 needs the time and a reason; afterwards 24/10 is no longer offered', async ({ page }) => {
    const calls = await openPhone(page, '/nv/yeu-cau?tao=giai-trinh&ngay=2026-10-24');
    let sheet = sheetOf(page, 'Giải trình');
    await sheet.getByLabel('Lý do').fill('Quên bấm Check-out khi về');
    await page.waitForTimeout(500); // quá 300ms debounce: còn thiếu giờ ra
    await expect(sendButton(sheet)).toBeDisabled();
    await sheet.getByLabel('Giờ ra thực tế').fill('17:30');
    await expect(sendButton(sheet)).toBeEnabled();
    await sendButton(sheet).click();
    await expectSent(page, 'Giải trình 24/10');

    sheet = await openKind(page, 'Giải trình');
    await expect(choices(sheet.getByLabel('Ngày'))).toHaveText(['T6 09/10']);
    expect(calls).toEqual([]);
  });

  test('a day explained from another device: the error stays and the date is no longer offered', async ({ page }) => {
    await openPhone(page, '/nv/yeu-cau?tao=giai-trinh&ngay=2026-10-24');
    const sheet = sheetOf(page, 'Giải trình');
    await sheet.getByLabel('Giờ ra thực tế').fill('17:30');
    await sheet.getByLabel('Lý do').fill('Quên bấm Check-out khi về');
    await expect(sendButton(sheet)).toBeEnabled();
    const other = { workDate: '2026-10-24', actualCheckOut: '17:40', reason: 'Máy khác' };
    expect(await otherDevice(page, 'explanation', other)).toBe(true);
    await sendButton(sheet).click();
    await expect(sendErrorLine(sheet)).toHaveText('Ngày 24/10 đã có đơn giải trình');
    await expect(sheet.getByLabel('Ngày')).toHaveValue('');
    await expect(choices(sheet.getByLabel('Ngày'))).toHaveText(['T6 09/10']);
    await expect(sheet.getByLabel('Lý do')).toHaveValue('Quên bấm Check-out khi về');
    await expect(sendButton(sheet)).toBeDisabled();
    await expect(sendErrorLine(sheet)).toHaveText('Ngày 24/10 đã có đơn giải trình');
  });
});

test.describe('Tạm ứng', () => {
  test('on 16/10 the form shows only the amount; Gửi files it and the month locks', async ({ page }) => {
    const calls = await openPhone(page, '/nv/yeu-cau?homnay=2026-10-16&tao=tam-ung');
    const sheet = sheetOf(page, 'Tạm ứng');
    await expect(sheet).toContainText('Số tiền được ứng: 2.215.385 ₫');
    await expect(sheet).toContainText('80% lương ngày công 01–15/10 · 12 ngày');
    await expect(sheet).toContainText('Tạm ứng lương tháng 10');
    await expect(sheet).toContainText('Hạn nộp');
    await expect(sheet).toContainText('Hôm nay 16/10 và 17/10');
    await expect(sheet).toContainText('Số đơn trong tháng');
    await expect(sheet).toContainText('1 đơn');
    await expect(sheet).toContainText('Admin chỉ duyệt hoặc từ chối, không sửa số tiền.');
    await expect(sheet.locator('input, select, textarea')).toHaveCount(0);
    await expect(sheet.getByLabel('Lý do')).toHaveCount(0);
    await expect(sendButton(sheet)).toBeEnabled();
    await sendButton(sheet).click();
    await expectSent(page, 'Tạm ứng lương tháng 10');
    await expect(page).toHaveURL(/\?homnay=2026-10-16$/);

    await page.getByRole('button', { name: 'Tạo yêu cầu' }).click();
    const advance = kindRow(sheetOf(page, 'Tạo yêu cầu'), 'Tạm ứng');
    await expect(advance).toHaveAttribute('aria-disabled', 'true');
    await expect(advance).toHaveAccessibleDescription('Tháng 10 đã có đơn tạm ứng');
    expect(calls).toEqual([]);
  });

  test('on 16/10 the menu row says when the advance can be filed until', async ({ page }) => {
    await openPhone(page, '/nv/yeu-cau?homnay=2026-10-16');
    await page.getByRole('button', { name: 'Tạo yêu cầu' }).click();
    await expect(kindRow(sheetOf(page, 'Tạo yêu cầu'), 'Tạm ứng')).toHaveAccessibleDescription('Tạm ứng lương tháng 10, nộp đến hết 17/10');
  });
});

test.describe('field styles', () => {
  test('the new fields have 8px corners and no shadow', async ({ page }) => {
    await openPhone(page, '/nv/yeu-cau?tao=nghi-bu');
    let sheet = sheetOf(page, 'Nghỉ có làm bù');
    await sheet.getByLabel('Từ ngày').selectOption({ label: 'T2 02/11' });
    for (const label of ['Ngày bù, khung 1', 'Từ giờ, khung 1', 'Đến giờ, khung 1']) {
      await expect(sheet.getByLabel(label)).toHaveCSS('border-radius', '8px');
      await expect(sheet.getByLabel(label)).toHaveCSS('box-shadow', 'none');
    }
    for (const name of ['Bỏ khung 1', 'Thêm khung bù'])
      await expect(sheet.getByRole('button', { name })).toHaveCSS('border-radius', '8px');

    await sheet.getByRole('button', { name: 'Quay lại chọn loại' }).click();
    await kindRow(sheetOf(page, 'Tạo yêu cầu'), 'Đổi ca').click();
    sheet = sheetOf(page, 'Đổi ca');
    const frame = sheet.locator('label').filter({ has: page.getByRole('radio', { name: 'Flex 06–15' }) });
    await expect(frame).toHaveCSS('border-radius', '8px');
    await expect(frame).toHaveCSS('box-shadow', 'none');

    await page.goto('/nv/yeu-cau?tao=giai-trinh&ngay=2026-10-24');
    sheet = sheetOf(page, 'Giải trình');
    await expect(sheet.getByLabel('Giờ ra thực tế')).toHaveCSS('border-radius', '8px');
    await expect(sheet.getByLabel('Giờ ra thực tế')).toHaveCSS('box-shadow', 'none');
  });
});

test.describe('desktop', () => {
  test('K3 opens Làm thêm giờ and sends it to the top of the Today list', async ({ page }) => {
    const calls = await openDesktop(page, '/nv/yeu-cau?tao=ot');
    const form = sheetOf(page, 'Làm thêm giờ');
    await expect(page.locator('.sd-drawer')).toHaveCount(1);
    await expect(page.locator('.ph-sheet')).toHaveCount(0);
    await form.getByLabel('Ngày').selectOption({ label: 'T5 29/10' });
    await expect(choices(form.getByLabel('Giờ bắt đầu'))).toHaveText(['06:00', '18:00', '19:00', '20:00', '21:00']);
    await form.getByLabel('Giờ bắt đầu').selectOption({ label: '18:00' });
    await form.getByLabel('Giờ kết thúc').selectOption({ label: '20:00' });
    await form.getByLabel('Lý do').fill('Chạy bảng lương cuối tháng');
    await sendButton(form).click();
    await expect(sentToast(page)).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    const list = page.getByRole('tabpanel', { name: 'Danh sách yêu cầu, cuộn để xem thêm' });
    await expect(list.getByRole('link').first()).toHaveAccessibleName('Làm thêm 29/10 18–20h, Chờ duyệt');
    expect(calls).toEqual([]);
  });
});
