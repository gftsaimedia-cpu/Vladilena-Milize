// Số đếm của khung Admin (chuông) trên dữ liệu giả: đọc từ nguồn việc chờ xử lý chung.
import { pendingInbox } from './inbox';

export function shellCounts(): { bell: number; requests: number } {
  const items = pendingInbox();
  return { bell: items.length, requests: items.filter(i => i.action === 'decide').length };
}
