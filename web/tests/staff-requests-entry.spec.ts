// Điểm vào của luồng "Tạo yêu cầu" và huỷ đơn (spec staff-requests 4.3, 4.6; brief FE mục 6, 8, 9) trên dữ liệu giả.
// Hôm nay 28/10/2026. Admin đã nhắc giải trình 24/10 (thiếu giờ ra, chưa gửi). 27/10 đã có giải trình chờ duyệt
// (giai-trinh-2710), nên chưa phải ngày cần giải trình. Đơn tạo, huỷ trong phiên nằm trong bộ nhớ của trang: tải lại là mất.
import { expect, test, type Locator, type Page } from '@playwright/test';
import { openDesktop } from './fixtures/staff-desktop';
import { openPhone } from './fixtures/staff-phone';

const REMINDER = 'Admin nhắc giải trình 24/10';
const FORM_24 = '/nv/yeu-cau?tao=giai-trinh&ngay=2026-10-24';
const MUTED = 'rgb(97, 97, 97)'; // --muted
const sheetOf = (page: Page, name: string) => page.getByRole('dialog', { name });
const sendButton = (dialog: Locator) => dialog.getByRole('button', { name: 'Gửi yêu cầu' });
const sentToast = (page: Page) => page.getByRole('status').filter({ hasText: 'Đã gửi yêu cầu' });
const cancelToast = (page: Page) => page.getByRole('status').filter({ hasText: 'Đã huỷ đơn' });
const confirmBox = (dialog: Locator) => dialog.getByRole('group', { name: 'Huỷ đơn này?' });
const explainLink = (dialog: Locator) => dialog.getByRole('link', { name: 'Giải trình', exact: true });
const nav = (page: Page) => page.getByRole('navigation', { name: 'Điều hướng' });
const badgeDot = (dialog: Locator) => dialog.locator('.st .dot').first();
const lastStepDot = (dialog: Locator) => dialog.getByLabel('Các bước').locator('.rq-rail i').last();
const dayOptions = (select: Locator) => select.locator('option:not([value=""])');
// Hai khung chữ nhật trên màn có chồng lên nhau không.
async function overlaps(a: Locator, b: Locator) {
  const [x, y] = [(await a.boundingBox())!, (await b.boundingBox())!];
  return x.x < y.x + y.width && y.x < x.x + x.width && x.y < y.y + y.height && y.y < x.y + x.height;
}

// a đứng trước b trong trang (thứ tự DOM).
async function precedes(a: Locator, b: Locator) {
  const other = await b.elementHandle();
  return a.evaluate((el, o) => !!(el.compareDocumentPosition(o as Node) & Node.DOCUMENT_POSITION_FOLLOWING), other);
}

// Form Giải trình 24/10 đã điền sẵn ngày: nhập giờ ra, lý do rồi gửi.
async function send24(page: Page) {
  const form = sheetOf(page, 'Giải trình');
  await expect(form.getByLabel('Ngày')).toHaveValue('2026-10-24');
  await form.getByLabel('Giờ ra thực tế').fill('17:30');
  await form.getByLabel('Lý do').fill('Quên bấm Check-out khi về');
  await expect(sendButton(form)).toBeEnabled();
  await sendButton(form).click();
  await expect(sentToast(page)).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
}

// Huỷ đơn trong hộp đang mở: "Huỷ đơn" → hỏi lại tại chỗ → "Huỷ đơn"; xong thì hộp ghi "Đã huỷ", không còn nút huỷ.
async function cancelIn(page: Page, dialog: Locator) {
  await dialog.getByRole('button', { name: 'Huỷ đơn' }).click();
  await confirmBox(dialog).getByRole('button', { name: 'Huỷ đơn' }).click();
  await expect(cancelToast(page)).toBeVisible();
  await expect(dialog.getByText('Đã huỷ', { exact: true }).first()).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Huỷ đơn' })).toHaveCount(0);
}

test.describe('phone', () => {
  test('J1 shows the reminder at the top; it opens Giải trình prefilled with 24/10 and is gone once sent', async ({ page }) => {
    const calls = await openPhone(page, '/nv/hom-nay');
    const line = page.getByRole('link', { name: REMINDER });
    await expect(line).toHaveText(REMINDER);
    await expect(line).toHaveAttribute('href', FORM_24);
    expect(await precedes(line, page.getByRole('region', { name: 'Ca hôm nay' }))).toBe(true);
    await expect(line).toHaveCSS('background-color', 'rgb(252, 232, 178)'); // --gold-light
    await expect(line).toHaveCSS('color', 'rgb(33, 33, 33)'); // --text
    await expect(line).toHaveCSS('border-radius', '8px');
    await expect(line).toHaveCSS('box-shadow', 'none');
    await expect(line.locator('svg')).toHaveCount(1); // mũi tên

    await line.click();
    await expect(page).toHaveURL(/\/nv\/yeu-cau\?tao=giai-trinh&ngay=2026-10-24$/);
    await expect(page.getByRole('dialog')).toHaveCount(1);
    await send24(page);

    await nav(page).getByRole('link', { name: 'Hôm nay' }).click();
    await expect(page.getByRole('region', { name: 'Ca hôm nay' })).toBeVisible();
    await expect(page.getByRole('link', { name: REMINDER })).toHaveCount(0);

    // J3 của 24/10 giờ hiện đơn vừa gửi (gửi ngày 28/10 nên có cả ngày gửi) thay cho nút "Giải trình".
    await nav(page).getByRole('link', { name: 'Chấm công' }).click();
    await page.getByRole('button', { name: 'Thứ Bảy 24/10: cần xử lý', exact: true }).click();
    const day = sheetOf(page, 'Thứ Bảy 24/10/2026');
    await expect(day).toContainText('Đã gửi giải trình lúc 09:40 28/10');
    await expect(day).toContainText('Giờ ra khai 17:30 · chờ Admin duyệt');
    await expect(explainLink(day)).toHaveCount(0);
    expect(calls).toEqual([]);
  });

  // Spec 3.4 / 4.3: dòng nhắc mất khi đã gửi giải trình cho ngày đó, hiện lại khi đơn đó bị huỷ.
  test('cancelling the 24/10 explanation brings the J1 reminder back', async ({ page }) => {
    const calls = await openPhone(page, '/nv/hom-nay');
    await page.getByRole('link', { name: REMINDER }).click();
    await send24(page);
    await nav(page).getByRole('link', { name: 'Hôm nay' }).click();
    await expect(page.getByRole('region', { name: 'Ca hôm nay' })).toBeVisible();
    await expect(page.getByRole('link', { name: REMINDER })).toHaveCount(0);

    await nav(page).getByRole('link', { name: 'Yêu cầu' }).click();
    await page.getByRole('link', { name: 'Giải trình 24/10, Chờ duyệt' }).click();
    const sheet = sheetOf(page, 'Giải trình 24/10');
    await cancelIn(page, sheet);
    await sheet.getByRole('button', { name: 'Đóng' }).click();
    await nav(page).getByRole('link', { name: 'Hôm nay' }).click();
    await expect(page.getByRole('link', { name: REMINDER })).toHaveAttribute('href', FORM_24);
    expect(calls).toEqual([]);
  });

  test('J3 of 24/10 has a Giải trình button that opens the form prefilled; J3 of 27/10 has none', async ({ page }) => {
    const calls = await openPhone(page, '/nv/cham-cong?ngay=2026-10-27');
    const day27 = sheetOf(page, 'Thứ Ba 27/10/2026');
    await expect(day27).toContainText('Đã gửi giải trình lúc 20:14');
    await expect(explainLink(day27)).toHaveCount(0);
    await day27.getByRole('button', { name: 'Đóng' }).click();

    await page.getByRole('button', { name: 'Thứ Bảy 24/10: cần xử lý', exact: true }).click();
    const day24 = sheetOf(page, 'Thứ Bảy 24/10/2026');
    const button = explainLink(day24);
    await expect(button).toHaveAttribute('href', FORM_24);
    await expect(button).toHaveCSS('border-radius', '8px');
    await expect(button).toHaveCSS('height', '48px');
    await expect(day24).not.toContainText('Đã gửi giải trình');
    await button.click();
    await expect(page).toHaveURL(/\/nv\/yeu-cau\?tao=giai-trinh&ngay=2026-10-24$/);
    await expect(page.getByRole('dialog')).toHaveCount(1);
    await expect(sheetOf(page, 'Giải trình').getByLabel('Ngày')).toHaveValue('2026-10-24');
    expect(calls).toEqual([]);
  });

  test('J5 offers Huỷ đơn only on a pending request', async ({ page }) => {
    await openPhone(page, '/nv/yeu-cau?yc=phep-1210');
    await expect(sheetOf(page, 'Phép năm 12/10')).toContainText('Đã duyệt');
    await expect(page.getByRole('button', { name: 'Huỷ đơn' })).toHaveCount(0);
    await page.goto('/nv/yeu-cau?yc=gio-vao-0909');
    await expect(sheetOf(page, 'Khai giờ vào 09/09')).toContainText('Từ chối');
    await expect(page.getByRole('button', { name: 'Huỷ đơn' })).toHaveCount(0);
    await page.goto('/nv/yeu-cau?yc=giai-trinh-2710');
    await expect(sheetOf(page, 'Thiếu giờ ra 27/10').getByRole('button', { name: 'Huỷ đơn' })).toHaveCount(1);
  });

  test('cancelling asks in place, shows the toast and Đã huỷ with a grey dot; the row stays under Tất cả only', async ({ page }) => {
    const calls = await openPhone(page, '/nv/yeu-cau');
    await page.getByRole('link', { name: 'Thiếu giờ ra 27/10, Chờ duyệt' }).click();
    const sheet = sheetOf(page, 'Thiếu giờ ra 27/10');
    await sheet.getByRole('button', { name: 'Huỷ đơn' }).click();
    const ask = confirmBox(sheet);
    await expect(ask).toContainText('Huỷ đơn này?');
    await expect(ask.getByRole('button')).toHaveText(['Không', 'Huỷ đơn']);
    await expect(ask.getByRole('button', { name: 'Không' })).toBeFocused();
    await expect(page.getByRole('dialog')).toHaveCount(1); // hỏi lại ngay trong hộp, không mở hộp mới
    await ask.getByRole('button', { name: 'Không' }).click();
    await expect(ask).toHaveCount(0);
    await expect(sheet.getByRole('button', { name: 'Huỷ đơn' })).toBeFocused();
    await expect(sheet).toContainText('Chờ duyệt');

    await cancelIn(page, sheet);
    // Hộp vẫn mở sau khi huỷ: thông báo nổi không được che các bước hay nút Đóng của hộp.
    expect(await overlaps(cancelToast(page), sheet.getByLabel('Các bước'))).toBe(false);
    expect(await overlaps(cancelToast(page), sheet.getByRole('button', { name: 'Đóng' }))).toBe(false);
    await expect(badgeDot(sheet)).toHaveCSS('background-color', MUTED);
    await expect(sheet.getByLabel('Các bước')).toContainText('Đã huỷ');
    await expect(sheet.getByLabel('Các bước')).toContainText('28/10 09:40');
    await expect(lastStepDot(sheet)).toHaveCSS('background-color', MUTED);
    await sheet.getByRole('button', { name: 'Đóng' }).click();

    const row = page.getByRole('link', { name: 'Thiếu giờ ra 27/10, Đã huỷ' });
    await expect(row).toBeVisible();
    await expect(row.locator('.dot')).toHaveCSS('background-color', MUTED);
    const tabs = page.getByRole('tablist', { name: 'Lọc theo trạng thái' });
    await expect(tabs.getByRole('tab')).toHaveText(['Tất cả 4', 'Chờ duyệt 0', 'Đã duyệt 2', 'Từ chối 1']);
    for (const name of ['Chờ duyệt 0', 'Đã duyệt 2', 'Từ chối 1']) {
      await tabs.getByRole('tab', { name }).click();
      await expect(page.getByRole('tabpanel').getByRole('link', { name: /Thiếu giờ ra 27\/10/ })).toHaveCount(0);
    }
    await tabs.getByRole('tab', { name: 'Tất cả 4' }).click();
    await expect(row).toBeVisible();
    expect(calls).toEqual([]);
  });

  // Spec 6: đơn không còn chờ duyệt lúc bấm (máy khác vừa huỷ, hay Admin vừa duyệt) thì hiện câu lỗi và đọc lại đơn.
  test('a cancel the server refuses shows its message and reloads the request', async ({ page }) => {
    const calls = await openPhone(page, '/nv/yeu-cau?yc=giai-trinh-2710');
    const sheet = sheetOf(page, 'Thiếu giờ ra 27/10');
    await sheet.getByRole('button', { name: 'Huỷ đơn' }).click();
    // "Máy khác" huỷ cùng đơn trong kho dữ liệu giả mà app đang dùng (cùng URL module của Vite).
    expect(await page.evaluate(`import('/src/mock/staff-requests.ts').then(m => m.cancelRequest('giai-trinh-2710').ok)`)).toBe(true);
    await confirmBox(sheet).getByRole('button', { name: 'Huỷ đơn' }).click();
    await expect(sheet.getByRole('alert')).toHaveText('Chỉ huỷ được đơn đang chờ duyệt');
    await expect(cancelToast(page)).toHaveCount(0);
    await expect(sheet.locator('.shd-b .st')).toHaveText('Đã huỷ'); // đã đọc lại đơn
    await expect(sheet.getByRole('button', { name: 'Huỷ đơn' })).toHaveCount(0);
    await expect(sheet).toBeFocused();
    await expect(page.getByRole('link', { name: 'Thiếu giờ ra 27/10, Đã huỷ' })).toHaveCount(1); // danh sách cũng đọc lại
    expect(calls).toEqual([]);
  });

  test('after cancelling 27/10 its day sheet shows the live state: no old explanation, a Giải trình button', async ({ page }) => {
    const calls = await openPhone(page, '/nv/yeu-cau?yc=giai-trinh-2710');
    const sheet = sheetOf(page, 'Thiếu giờ ra 27/10');
    await cancelIn(page, sheet);
    await sheet.getByRole('button', { name: 'Đóng' }).click();
    await nav(page).getByRole('link', { name: 'Chấm công' }).click();
    await page.getByRole('button', { name: 'Thứ Ba 27/10: cần xử lý', exact: true }).click();
    const day = sheetOf(page, 'Thứ Ba 27/10/2026');
    await expect(day).toContainText('08:12');
    await expect(day).not.toContainText('Đã gửi giải trình');
    await expect(day).not.toContainText('chờ Admin duyệt');
    await explainLink(day).click();
    await expect(page).toHaveURL(/\/nv\/yeu-cau\?tao=giai-trinh&ngay=2026-10-27$/);
    const form = sheetOf(page, 'Giải trình');
    await expect(form.getByLabel('Ngày')).toHaveValue('2026-10-27');
    await expect(form.getByLabel('Giờ ra thực tế')).toBeVisible();
    expect(calls).toEqual([]);
  });

  test('a cancelled leave gives its dates and its annual leave back', async ({ page }) => {
    const calls = await openPhone(page, '/nv/yeu-cau?tao=nghi');
    let form = sheetOf(page, 'Đơn nghỉ');
    await form.getByLabel('Hình thức nghỉ').selectOption({ label: 'Phép năm' });
    await form.getByLabel('Từ ngày').selectOption({ label: 'T2 02/11' });
    await form.getByLabel('Đến ngày').selectOption({ label: 'T3 03/11' });
    await form.getByLabel('Lý do').fill('Việc gia đình');
    await expect(sendButton(form)).toBeEnabled();
    await sendButton(form).click();
    await expect(sentToast(page)).toBeVisible();

    await page.getByRole('link', { name: 'Phép năm 02–03/11, Chờ duyệt' }).click();
    const sheet = sheetOf(page, 'Phép năm 02–03/11');
    await cancelIn(page, sheet);
    await sheet.getByRole('button', { name: 'Đóng' }).click();
    await expect(page.getByRole('link', { name: 'Phép năm 02–03/11, Đã huỷ' })).toBeVisible();

    await page.getByRole('button', { name: 'Tạo yêu cầu' }).click();
    const menu = sheetOf(page, 'Tạo yêu cầu');
    const leaveRow = menu.getByRole('group', { name: 'Loại yêu cầu' }).getByRole('button', { name: 'Đơn nghỉ' });
    await expect(leaveRow).toHaveAccessibleDescription('Phép năm còn 11 ngày');
    await leaveRow.click();
    form = sheetOf(page, 'Đơn nghỉ');
    const labels = await dayOptions(form.getByLabel('Từ ngày')).allTextContents();
    expect(labels).toContain('T2 02/11');
    expect(labels).toContain('T3 03/11');
    await form.getByLabel('Từ ngày').selectOption({ label: 'T2 02/11' });
    await expect(dayOptions(form.getByLabel('Đến ngày'))).toContainText(['T2 02/11', 'T3 03/11']);
    expect(calls).toEqual([]);
  });

  test('?yc= together with ?tao= opens only the flow and drops yc', async ({ page }) => {
    const calls = await openPhone(page, '/nv/yeu-cau?yc=giai-trinh-2710&tao=giai-trinh&ngay=2026-10-24');
    await expect(sheetOf(page, 'Giải trình').getByLabel('Ngày')).toHaveValue('2026-10-24');
    await expect(page).toHaveURL(/\/nv\/yeu-cau\?tao=giai-trinh&ngay=2026-10-24$/);
    await page.waitForTimeout(300); // đọc chi tiết đơn là bất đồng bộ: cho nó cơ hội mở hộp thứ hai
    await expect(page.getByRole('dialog')).toHaveCount(1);
    await expect(page.locator('.ph-sheet')).toHaveCount(1);
    expect(calls).toEqual([]);
  });
});

test.describe('desktop', () => {
  const col1 = (page: Page) => page.locator('.sd-col').nth(0);

  test('the Today column shows the reminder line; it opens K3 prefilled and goes once sent', async ({ page }) => {
    const calls = await openDesktop(page, '/nv/hom-nay');
    const line = col1(page).getByRole('link', { name: REMINDER });
    await expect(line).toHaveAttribute('href', FORM_24);
    await expect(line).not.toHaveAttribute('aria-current');
    expect(await precedes(line, page.getByRole('region', { name: 'Ca hôm nay' }))).toBe(true);
    await expect(line).toHaveCSS('background-color', 'rgb(252, 232, 178)');
    await expect(line).toHaveCSS('border-radius', '8px');
    await line.click();
    await expect(page).toHaveURL(/\/nv\/yeu-cau\?tao=giai-trinh&ngay=2026-10-24$/);
    await expect(page.locator('.sd-drawer')).toHaveCount(1);
    await expect(col1(page).getByRole('link', { name: REMINDER })).not.toHaveAttribute('aria-current');
    await send24(page);
    await expect(col1(page).getByRole('link', { name: REMINDER })).toHaveCount(0);
    expect(calls).toEqual([]);
  });

  test('cancelling the 24/10 explanation brings the reminder back to the Today column', async ({ page }) => {
    const calls = await openDesktop(page, '/nv/hom-nay');
    await col1(page).getByRole('link', { name: REMINDER }).click();
    await send24(page);
    await expect(col1(page).getByRole('link', { name: REMINDER })).toHaveCount(0);

    await col1(page).getByRole('link', { name: 'Giải trình 24/10, Chờ duyệt' }).click();
    const drawer = sheetOf(page, 'Giải trình 24/10');
    await cancelIn(page, drawer);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(col1(page).getByRole('link', { name: REMINDER })).toHaveAttribute('href', FORM_24);
    expect(calls).toEqual([]);
  });

  test('K2 of 24/10 has the Giải trình button; K2 of 27/10 shows its pending explanation instead', async ({ page }) => {
    const calls = await openDesktop(page, '/nv/cham-cong?ngay=2026-10-27');
    const day27 = sheetOf(page, 'Thứ Ba 27/10/2026');
    await expect(day27).toContainText('Giờ ra khai 17:30 · chờ Admin duyệt');
    await expect(explainLink(day27)).toHaveCount(0);
    await page.keyboard.press('Escape');
    await page.getByRole('region', { name: 'Lịch tháng 10' }).getByRole('button', { name: 'Thứ Bảy 24/10: cần xử lý' }).click();
    const day24 = sheetOf(page, 'Thứ Bảy 24/10/2026');
    await expect(explainLink(day24)).toHaveAttribute('href', FORM_24);
    await explainLink(day24).click();
    await expect(page).toHaveURL(/\/nv\/yeu-cau\?tao=giai-trinh&ngay=2026-10-24$/);
    await expect(page.getByRole('dialog')).toHaveCount(1);
    await expect(sheetOf(page, 'Giải trình').getByLabel('Ngày')).toHaveValue('2026-10-24');
    expect(calls).toEqual([]);
  });

  test('the request drawer cancels a pending request; the Today list and the day drawer follow', async ({ page }) => {
    const calls = await openDesktop(page, '/nv/yeu-cau?yc=phep-1210');
    await expect(sheetOf(page, 'Phép năm 12/10')).toContainText('Đã duyệt');
    await expect(page.getByRole('button', { name: 'Huỷ đơn' })).toHaveCount(0);
    await page.keyboard.press('Escape');

    await col1(page).getByRole('link', { name: 'Thiếu giờ ra 27/10, Chờ duyệt' }).click();
    const drawer = sheetOf(page, 'Thiếu giờ ra 27/10');
    await expect(page.locator('.sd-drawer')).toHaveCount(1);
    await cancelIn(page, drawer);
    expect(await overlaps(cancelToast(page), drawer)).toBe(false); // ngăn kéo vẫn mở: thông báo nổi nằm ngoài nó
    await expect(badgeDot(drawer)).toHaveCSS('background-color', MUTED);
    await expect(lastStepDot(drawer)).toHaveCSS('background-color', MUTED);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    const tabs = page.getByRole('tablist', { name: 'Lọc yêu cầu theo trạng thái' });
    await expect(tabs.getByRole('tab')).toHaveText(['Tất cả 4', 'Chờ duyệt 0', 'Đã duyệt 2', 'Từ chối 1']);

    const panel = page.getByRole('tabpanel', { name: 'Danh sách yêu cầu, cuộn để xem thêm' });
    await expect(panel.getByRole('link', { name: 'Thiếu giờ ra 27/10, Đã huỷ' })).toBeVisible();
    await tabs.getByRole('tab', { name: 'Chờ duyệt 0' }).click();
    await expect(panel.getByRole('link')).toHaveCount(0);

    await page.getByRole('link', { name: 'Thứ Ba 27/10: cần xử lý' }).click();
    const day = sheetOf(page, 'Thứ Ba 27/10/2026');
    await expect(day).toContainText('08:12');
    await expect(day).not.toContainText('Đã gửi giải trình');
    await expect(explainLink(day)).toHaveAttribute('href', '/nv/yeu-cau?tao=giai-trinh&ngay=2026-10-27');
    expect(calls).toEqual([]);
  });

  test('?yc= together with ?tao= opens only K3 and drops yc', async ({ page }) => {
    const calls = await openDesktop(page, '/nv/yeu-cau?yc=giai-trinh-2710&tao=giai-trinh&ngay=2026-10-24');
    await expect(sheetOf(page, 'Giải trình').getByLabel('Ngày')).toHaveValue('2026-10-24');
    await expect(page).toHaveURL(/\/nv\/yeu-cau\?tao=giai-trinh&ngay=2026-10-24$/);
    await page.waitForTimeout(300);
    await expect(page.getByRole('dialog')).toHaveCount(1);
    await expect(page.locator('.sd-drawer')).toHaveCount(1);
    expect(calls).toEqual([]);
  });
});
