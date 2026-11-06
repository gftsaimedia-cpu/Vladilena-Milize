// Vỏ Admin: người đăng nhập lấy từ phiên; số chuông là số việc chờ xử lý (dữ liệu giả: mock/shell;
// máy chủ thật: số việc BE đếm; không đọc được thì `bell` là null = không rõ, không giả làm 0).
import { respond } from '@/mock/respond';
import { shellCounts } from '@/mock/shell';
import { useSessionStore } from '@/stores/session';
import { countPending } from './admin-main';

export type ShellMe = { username?: string; name?: string; roleLabel?: string; initials?: string };

export async function getShell(): Promise<{ me: ShellMe; bell: number | null }> {
  const me = useSessionStore().shellMe as ShellMe;
  if (__MOCK__) return respond({ me, bell: shellCounts().bell });
  return { me, bell: await countPending().catch(() => null) };
}
