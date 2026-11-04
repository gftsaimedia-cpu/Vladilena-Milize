// Vỏ Admin trên dữ liệu giả: người đăng nhập từ phiên giả, số chuông từ mock/shell.
import { respond } from '@/mock/respond';
import { shellCounts } from '@/mock/shell';
import { useSessionStore } from '@/stores/session';

export type ShellMe = { username?: string; name?: string; roleLabel?: string; initials?: string };

export async function getShell(): Promise<{ me: ShellMe; bell: number }> {
  return respond({ me: useSessionStore().shellMe as ShellMe, bell: shellCounts().bell });
}
