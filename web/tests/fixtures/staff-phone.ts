// Mở app nhân viên trên điện thoại: khung 390×844, phiên giả 'nhanvien' (tên khác 'admin' là nhân viên, mock/accounts).
// Ghi mọi request tới /api và trả mảng 'METHOD /path'; app điện thoại chạy trên dữ liệu giả nên mảng phải rỗng.
import type { Page } from '@playwright/test';

export async function openPhone(page: Page, path: string, size = { width: 390, height: 844 }): Promise<string[]> {
  const calls: string[] = [];
  page.on('request', req => {
    const url = new URL(req.url());
    if (url.pathname.startsWith('/api')) calls.push(`${req.method()} ${url.pathname}`);
  });
  await page.setViewportSize(size);
  await page.addInitScript(() => localStorage.setItem('aicb.mock.session', 'nhanvien'));
  await page.goto(path);
  return calls;
}
