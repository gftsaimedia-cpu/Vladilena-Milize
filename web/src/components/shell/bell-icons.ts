// Biểu tượng loại của chuông (bảng thiết kế BellInbox): phần trong của <svg viewBox="0 0 24 24">, nét currentColor.
import type { InboxGroup } from '@/mock/inbox';

export type BellGroup = InboxGroup | 'sys';

export const BELL_ICONS: Record<BellGroup, string> = {
  // Đồng hồ báo thức: quên chấm công
  att: '<circle cx="12" cy="13" r="8"></circle><path d="M12 9v4l2 2M5 3 2 6M22 6l-3-3"></path>',
  // Lịch có dấu tích: đơn nghỉ
  leave: '<path d="M8 2v4M16 2v4"></path><rect x="3" y="4" width="18" height="17" rx="2"></rect><path d="m9 15 2 2 4-4"></path>',
  // Đồng hồ có dấu cộng: làm thêm, làm bù
  ot: '<path d="M21 12a9 9 0 1 0-9 9"></path><path d="M12 7v5l3 2"></path><path d="M19 15v6M16 18h6"></path>',
  // Bong bóng lời: giải trình
  exp: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path><path d="M8 9h8M8 13h5"></path>',
  // Đồng xu: tạm ứng
  adv: '<circle cx="12" cy="12" r="9"></circle><path d="M14.8 9a3 3 0 0 0-2.8-1.5c-1.7 0-3 .9-3 2.2 0 3 6 1.6 6 4.6 0 1.3-1.3 2.2-3 2.2A3.2 3.2 0 0 1 9 15M12 6v1.5M12 16.5V18"></path>',
  // Chữ i trong vòng tròn: tin hệ thống
  sys: '<circle cx="12" cy="12" r="9"></circle><path d="M12 8h.01M11 12h1v4h1"></path>'
};

export const CLOSE_ICON = '<path d="M18 6 6 18M6 6l12 12"></path>';
export const CHEVRON_ICON = '<path d="m9 18 6-6-6-6"></path>';
