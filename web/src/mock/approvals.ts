// Yêu cầu chờ duyệt giả: nguồn chung của số đếm trên thanh bên, chuông và (sau này) màn Yêu cầu.
import { initials } from '@/utils/format';
import { respond } from './respond';

export type PendingRequest = { id: string; name: string; initials: string; kind: string; detail: string };

const SEED: [string, string, string][] = [
  ['Nguyễn Thu Hà', 'Nghỉ phép năm', '30–31/10, 2 ngày'],
  ['Trần Minh Quân', 'Tạm ứng lương', '5.000.000 ₫'],
  ['Lê Hoàng Nam', 'Giải trình quên chấm công', '27/10'],
  ['Phạm Ngọc Anh', 'Nghỉ phép năm', '02/11, 1 ngày'],
  ['Võ Đức Thịnh', 'Làm thêm giờ', '24/10, 3 giờ'],
  ['Đỗ Mai Linh', 'Giải trình đi muộn', '26/10'],
  ['Bùi Quốc Huy', 'Nghỉ ốm', '29/10, 1 ngày'],
  ['Hoàng Thị Mai', 'Tạm ứng lương', '3.000.000 ₫'],
  ['Ngô Gia Bảo', 'Làm bù', '31/10']
];

let list: PendingRequest[] = SEED.map(([name, kind, detail], i) => ({
  id: `rq-${String(i + 1).padStart(2, '0')}`,
  name,
  initials: initials(name),
  kind,
  detail
}));

/** Bản sao danh sách yêu cầu còn chờ, theo thứ tự rq-01…rq-09. */
export function pendingRequests(): PendingRequest[] {
  return list.map(r => ({ ...r }));
}

/** Bỏ một yêu cầu khỏi danh sách chờ; trả yêu cầu vừa bỏ, hoặc null nếu không có id đó. */
export function decideRequest(id: string): PendingRequest | null {
  const hit = list.find(r => r.id === id);
  if (!hit) return null;
  list = list.filter(r => r.id !== id);
  return { ...hit };
}

/** Dùng cho màn Yêu cầu sau này: danh sách chờ như một lời gọi máy chủ. */
export const listPendingRequests = () => respond(pendingRequests());
