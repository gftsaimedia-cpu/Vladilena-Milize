// Vỏ Admin: người đăng nhập lấy từ phiên; số chuông là số việc chờ xử lý (dữ liệu giả: mock/shell;
// máy chủ thật: số đơn đang chờ duyệt).
import { respond } from '@/mock/respond';
import { shellCounts } from '@/mock/shell';
import { useSessionStore } from '@/stores/session';
import { countPending } from './admin-main';

export type ShellMe = { username?: string; name?: string; roleLabel?: string; initials?: string };

/** `requests`: số đơn đang chờ duyệt, hiện cạnh mục Yêu cầu của menu (chuông dữ liệu giả còn đếm cả việc nhắc giải trình). */
export async function getShell(): Promise<{ me: ShellMe; bell: number | null; requests: number }> {
  const me = useSessionStore().shellMe as ShellMe;
  if (__MOCK__) return respond({ me, ...shellCounts() });
  // Máy chủ thật: số chuông là số đơn đang chờ duyệt, cũng là số của mục Yêu cầu.
  // Không đọc được số việc chờ thì `bell` là null (hiện dấu ?), không giả làm 0.
  const bell = await countPending().catch(() => null);
  return { me, bell, requests: bell ?? 0 };
}
