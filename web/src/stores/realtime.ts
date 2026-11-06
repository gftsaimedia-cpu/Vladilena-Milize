// Trạng thái realtime: kết nối SSE (chỉ khi phiên có quyền chấm công) và các ô vừa cập nhật để nháy sáng.
import { defineStore } from 'pinia';
import { watch } from 'vue';
import { createRealtime, type RealtimeStatus } from '@/services/realtime';
import { useSessionStore } from './session';

export const FLASH_MS = 1500;
export const flashKey = (username: string, workDate: string) => `${username}|${workDate}`;

let controller: ReturnType<typeof createRealtime> | null = null;

export const useRealtimeStore = defineStore('realtime', {
  state: () => ({ status: 'offline' as RealtimeStatus, flash: {} as Record<string, true> }),
  getters: {
    isFlash: s => (username: string, workDate: string) => !!s.flash[flashKey(username, workDate)]
  },
  actions: {
    markFlash(keys: string[]) {
      for (const k of keys) {
        this.flash[k] = true;
        setTimeout(() => delete this.flash[k], FLASH_MS);
      }
    },
    // Gọi một lần ở App.vue: mở luồng khi phiên là admin có quyền chấm công, đóng khi đăng xuất hoặc đổi phiên.
    bind() {
      const session = useSessionStore();
      controller ??= createRealtime(s => (this.status = s));
      watch(
        () => {
          const u = session.user as { username: string; role: string } | null;
          return session.ready && u && (u.role === 'admin' || session.caps.includes('attendance.correct')) ? u.username : '';
        },
        who => {
          controller!.stop();
          if (who) controller!.start();
        },
        { immediate: true }
      );
    }
  }
});
