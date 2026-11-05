// Chữ của một dòng việc chờ duyệt, dùng chung cho ngăn kéo chuông và thẻ Việc cần duyệt của Tổng quan.
import type { InboxItem } from '@/mock/inbox';

/** Dòng 1 (đậm) của dòng chuông: "Quên Check-out · 27/10", "Tạm ứng 3.900.000 ₫". */
export function bellRowTitle(item: InboxItem): string {
  return item.group === 'adv' ? item.head : [item.what, item.when].filter(Boolean).join(' · ');
}

// Dòng 2 là "họ tên · phòng ban" chỉ khi `role` có dạng "Phòng ban · Chức danh" (dữ liệu giả). Máy chủ thật chỉ có
// chức danh hoặc "—", không có phòng ban, nên chỉ hiện họ tên.
export function personLine(item: InboxItem): string {
  return item.role.includes(' · ') ? `${item.name} · ${item.role.split(' · ')[0]}` : item.name;
}
