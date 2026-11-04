// Số đếm và người dùng của khung Admin; Tổng quan cập nhật được sau khi duyệt yêu cầu.
import { defineStore } from 'pinia';
import { getShell, type ShellMe } from '@/services/shell';

export const useShellStore = defineStore('shell', {
  state: () => ({ me: {} as ShellMe, counts: {} as { requests?: number }, bell: 0 }),
  actions: {
    async load() {
      const res = await getShell();
      this.me = res.me;
      this.counts = res.counts;
      this.bell = res.bell;
    }
  }
});
