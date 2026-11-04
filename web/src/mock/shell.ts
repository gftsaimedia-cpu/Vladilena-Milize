// Số đếm của khung Admin (chuông) trên dữ liệu giả: đọc từ nguồn việc chờ xử lý chung.
import { pendingInbox } from './inbox';

export function shellCounts(): { bell: number } {
  return { bell: pendingInbox().length };
}
