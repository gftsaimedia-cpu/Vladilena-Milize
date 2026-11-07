// Giờ theo máy chủ (ms): đồng hồ máy khách cộng độ lệch đo lúc nhận phiên. Dùng cho các chữ kiểu "5 phút trước", để máy khách
// sai giờ không làm lệch. Việc quyết "hôm nay" và mọi con số vẫn do BE.
import { useSessionStore } from '@/stores/session';

export function serverNowMs(): number {
  return Date.now() + useSessionStore().clockOffsetMs;
}
