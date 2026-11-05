// Người dùng và số chuông của khung Admin. `decide` là đường duy nhất xử lý một việc chờ xử lý:
// duyệt / từ chối bỏ việc khỏi nguồn chung, nhắc giải trình giữ việc lại; sau đó tăng `version` (các màn đọc danh
// sách tải lại theo nó) rồi tải lại số chuông.
// `seen`: id các tin trên chuông đã đọc trong phiên này (chọn tin, hoặc "Đánh dấu đã đọc"); đóng mở chuông vẫn giữ.
import { defineStore } from 'pinia';
import type { InboxItem } from '@/mock/inbox';
import { resolveRequest, type DecisionVerb } from '@/services/admin-main';
import { getShell, type ShellMe } from '@/services/shell';

export const useShellStore = defineStore('shell', {
  state: () => ({ me: {} as ShellMe, bell: 0, version: 0, seen: {} as Record<string, true> }),
  actions: {
    async load() {
      const res = await getShell();
      this.me = res.me;
      this.bell = res.bell;
    },
    /** `note`: ghi chú cho nhân viên khi duyệt / từ chối (bắt buộc khi từ chối, chuông tự kiểm). */
    async decide(id: string, verb: DecisionVerb = 'approve', note?: string): Promise<InboxItem | null> {
      const hit = await resolveRequest(id, verb, note);
      this.version += 1;
      await this.load();
      return hit;
    },
    markSeen(...ids: string[]) {
      for (const id of ids) this.seen[id] = true;
    }
  }
});
