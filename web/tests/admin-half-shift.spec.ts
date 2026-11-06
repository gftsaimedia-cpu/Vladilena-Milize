// Nghỉ giữa ca ở màn Admin (yêu cầu FE của BE mục 3): nhãn loại đơn, chi tiết đơn, và đơn có ngày đã thành ngày lễ thì
// chỉ còn Từ chối (BE chặn duyệt; câu lý do do BE gửi trong `approveBlock`). Dữ liệu giả: thêm một đơn chờ qua móc
// window.__mockInboxExtra trước khi app chạy, để các đếm của dữ liệu giả gốc không đổi.
import { expect, test, type Page } from '@playwright/test';
import { requestRowsFromDto } from '../src/builders/api/admin-requests';
import { inboxFromRequests, type RequestDTO } from '../src/builders/api/inbox';

test.use({ reducedMotion: 'reduce' });

const BLOCK = 'Ngày 12/11 đã thành ngày lễ, đơn nghỉ giữa ca không duyệt được. Chỉ có thể từ chối đơn này.';
const NAME = 'Đặng Thu Trang';

const dto: RequestDTO = {
  id: 'hs-1',
  employeeId: 'e-nam',
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
const people = new Map([['e-nam', { name: NAME, title: 'Kinh doanh · Nhân viên' }]]);

test.describe('máy chủ thật', () => {
  test('a half-shift request is its own kind with its day, halves and owed hours', () => {
    const [row] = requestRowsFromDto([dto], people, Date.parse('2026-11-06T03:00:00.000Z'));
    expect(row).toMatchObject({
      kind: 'half',
      date: '12/11',
      what: 'Nghỉ giữa ca · làm 08:00–12:00',
      head: 'Nghỉ giữa ca · làm 08:00–12:00',
      sub: 'Thứ Năm 12/11',
      facts: [
        ['Làm', '08:00–12:00'],
        ['Nghỉ', '13:00–17:00'],
        ['Cần bù', '4 giờ'],
        ['Lý do', '“Việc gia đình”']
      ]
    });
    expect(row.approveBlock).toBeUndefined();
    const [item] = inboxFromRequests([dto], people, Date.now());
    expect(item.group).toBe('leave');
  });

  test('the server reason for a blocked approval travels to the row and the bell item', () => {
    const blocked = { ...dto, approveBlock: BLOCK };
    expect(requestRowsFromDto([blocked], people, Date.now())[0].approveBlock).toBe(BLOCK);
    expect(inboxFromRequests([blocked], people, Date.now())[0].approveBlock).toBe(BLOCK);
  });
});

// Đơn chờ giả của Trang (người không có đơn nào khác): ngày 12/11 đã thành ngày lễ.
async function withBlockedRequest(page: Page) {
  await page.addInitScript(
    ([block, name]) => {
      (globalThis as { __mockInboxExtra?: unknown[] }).__mockInboxExtra = [
        {
          id: 'ib-h1',
          group: 'leave',
          groupLabel: 'Nghỉ phép',
          action: 'decide',
          personId: 'dang-thu-trang',
          name,
          initials: 'TT',
          role: 'Kinh doanh · Nhân viên',
          what: 'Nghỉ giữa ca',
          when: '12/11',
          age: '1 giờ',
          head: 'Nghỉ giữa ca · làm 08:00–12:00',
          sub: 'Thứ Năm 12/11',
          facts: [
            ['Làm', '08:00–12:00'],
            ['Nghỉ', '13:00–17:00'],
            ['Cần bù', '4 giờ'],
            ['Lý do', '“Việc gia đình”']
          ],
          days: ['2026-11-12'],
          approveBlock: block
        }
      ];
    },
    [BLOCK, NAME]
  );
}

const rows = (page: Page) => page.getByRole('table', { name: 'Yêu cầu' }).locator('tbody tr');
const rowOf = (page: Page, name: string) => rows(page).filter({ hasText: name });
const kinds = (page: Page) => page.getByRole('navigation', { name: 'Loại đơn' });

test.describe('dữ liệu giả', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await withBlockedRequest(page);
  });

  test('Yêu cầu: the row reads Nghỉ giữa ca and offers only Từ chối; the drawer says why', async ({ page }) => {
    await page.goto('/admin/yeu-cau');
    await expect(kinds(page).getByRole('button', { name: /^Nghỉ giữa ca/ })).toContainText('1');
    const row = rowOf(page, NAME);
    await expect(row).toContainText('Nghỉ giữa ca');
    await expect(row.getByRole('button', { name: `Duyệt yêu cầu của ${NAME}` })).toHaveCount(0);
    await expect(row.getByRole('button', { name: /^Từ chối yêu cầu của/ })).toBeVisible();

    await row.getByRole('button', { name: `Xem yêu cầu của ${NAME}` }).first().click();
    const drawer = page.getByRole('dialog', { name: `Chi tiết yêu cầu của ${NAME}` });
    await expect(drawer).toContainText('Yêu cầu · Nghỉ giữa ca');
    await expect(drawer).toContainText('Cần bù');
    await expect(drawer).toContainText(BLOCK);
    await expect(drawer.getByRole('button', { name: 'Duyệt', exact: true })).toHaveCount(0);
    await expect(drawer.getByRole('button', { name: 'Từ chối', exact: true })).toBeVisible();
  });

  test('Duyệt nhiều đơn cannot pick the blocked request', async ({ page }) => {
    await page.goto('/admin/yeu-cau');
    await page.getByRole('button', { name: 'Duyệt nhiều đơn' }).click();
    const pick = rowOf(page, NAME).getByRole('checkbox', { name: `Chọn đơn của ${NAME}` });
    await expect(pick).toBeDisabled();
    await page.getByRole('checkbox', { name: 'Chọn tất cả đơn chờ duyệt đang hiện' }).click();
    await expect(page.getByRole('button', { name: 'Duyệt 11 đơn' })).toBeVisible();
  });

  test('the bell and Tổng quan offer only Từ chối for it', async ({ page }) => {
    await page.goto('/admin/tong-quan');
    await expect(page.getByRole('button', { name: `Từ chối yêu cầu của ${NAME}` })).toBeVisible();
    await expect(page.getByRole('button', { name: `Duyệt yêu cầu của ${NAME}` })).toHaveCount(0);

    await page.locator('.topbar .bell').click();
    await page.getByRole('dialog', { name: 'Thông báo' }).getByRole('button', { name: new RegExp(NAME) }).first().click();
    await expect(page.getByText(BLOCK)).toBeVisible();
    await expect(page.locator('.bdd-decide').getByRole('button', { name: 'Duyệt', exact: true })).toHaveCount(0);
  });
});
