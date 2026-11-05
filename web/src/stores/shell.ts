// Người dùng và số chuông của khung Admin. `decide` là đường duy nhất xử lý một việc chờ xử lý:
// bỏ việc khỏi nguồn chung, tăng `version` (các màn đọc danh sách tải lại theo nó) rồi tải lại số chuông.
import { defineStore } from 'pinia';
import type { InboxItem } from '@/mock/inbox';
import { resolveRequest, type DecisionVerb } from '@/services/admin-main';
import { getShell, type ShellMe } from '@/services/shell';

export const useShellStore = defineStore('shell', {
  state: () => ({ me: {} as ShellMe, bell: 0, version: 0 }),
  actions: {
    async load() {
      const res = await getShell();
      this.me = res.me;
      this.bell = res.bell;
    },
    async decide(id: string, verb: DecisionVerb = 'approve'): Promise<InboxItem | null> {
      const hit = await resolveRequest(id, verb);
      this.version += 1;
      await this.load();
      return hit;
    }
  }
});
