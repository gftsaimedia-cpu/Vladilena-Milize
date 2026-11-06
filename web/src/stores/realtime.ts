// Trạng thái realtime: kết nối SSE (chỉ khi phiên có quyền chấm công) và các ô vừa cập nhật để nháy sáng.
import { defineStore } from 'pinia';
import { watch } from 'vue';
import { toast } from '@/components/shell/toast';
import { createRealtime, onRealtime, type RealtimeScope, type RealtimeStatus } from '@/services/realtime';
import { useSessionStore } from './session';

export const FLASH_MS = 1500;
export const flashKey = (username: string, workDate: string) => `${username}|${workDate}`;

let controller: ReturnType<typeof createRealtime> | null = null;
let controllerScope: RealtimeScope | null = null;
let offToasts: Array<() => void> = [];

const REQUEST_TOAST = { APPROVED: 'Đơn của bạn đã được duyệt', REJECTED: 'Đơn của bạn bị từ chối', CANCELLED: 'Đơn của bạn đã được huỷ' } as const;
const SLIP_TOAST = { approved: 'Phiếu lương của bạn đã được duyệt', rejected: 'Phiếu lương của bạn bị từ chối' } as const;

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
    // Gọi một lần ở App.vue: mở luồng theo phiên (admin có quyền chấm công → /stream; nhân viên → /me), đóng khi đăng xuất hoặc đổi phiên.
    bind() {
      const session = useSessionStore();
      watch(
        () => {
          const u = session.user as { username: string; role: string } | null;
          if (!session.ready || !u) return '';
          const admin = u.role === 'admin' || session.caps.includes('attendance.correct');
          return `${admin ? 'admin' : 'me'}:${u.username}`;
        },
        key => {
          controller?.stop();
          offToasts.forEach(off => off());
          offToasts = [];
          if (!key) return;
          const scope = key.split(':')[0] as RealtimeScope;
          const me = key.slice(scope.length + 1);
          if (!controller || controllerScope !== scope) {
            controller = createRealtime(s => (this.status = s), scope);
            controllerScope = scope;
          }
          // Thông báo cho chính người đó (luồng admin gửi sự kiện của mọi người nên lọc theo tên đăng nhập).
          offToasts = [
            onRealtime('request.decided', e => e.username === me && toast.ok(REQUEST_TOAST[e.status as keyof typeof REQUEST_TOAST])),
            onRealtime('payslip.decided', e => e.username === me && toast.ok(SLIP_TOAST[e.status as keyof typeof SLIP_TOAST]))
          ];
          controller.start();
        },
        { immediate: true }
      );
    }
  }
});
