// Mở trang nhân viên trên máy tính: giống openPhone (phiên giả 'nhanvien', ghi /api, pageerror, console.error vào một mảng
// phải rỗng), chỉ khác kích thước mặc định 1440×900.
import type { Page } from '@playwright/test';
import { openPhone } from './staff-phone';

export const openDesktop = (page: Page, path: string, size = { width: 1440, height: 900 }): Promise<string[]> =>
  openPhone(page, path, size);
