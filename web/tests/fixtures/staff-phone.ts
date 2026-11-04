// Mở app nhân viên trên điện thoại: khung 390×844, phiên giả 'nhanvien' (tên khác 'admin' là nhân viên, mock/accounts).
// Ghi mọi request tới /api ('METHOD /path'), lỗi chạy ('pageerror: …') và console.error ('console.error: …') vào một mảng;
// api() của mockup không chạm mạng (luôn reject) nên chỉ pageerror/console.error mới bắt được nó. Mảng phải rỗng.
import type { Page } from '@playwright/test';

export async function openPhone(page: Page, path: string, size = { width: 390, height: 844 }): Promise<string[]> {
  const calls: string[] = [];
  page.on('request', req => {
    const url = new URL(req.url());
    if (url.pathname.startsWith('/api')) calls.push(`${req.method()} ${url.pathname}`);
  });
  page.on('pageerror', err => calls.push(`pageerror: ${err.message}`));
  page.on('console', msg => {
    if (msg.type() === 'error') calls.push(`console.error: ${msg.text()}`);
  });
  await page.setViewportSize(size);
  await page.addInitScript(() => localStorage.setItem('aicb.mock.session', 'nhanvien'));
  await page.goto(path);
  return calls;
}
