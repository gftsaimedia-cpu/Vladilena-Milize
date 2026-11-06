// SSE giả cho chế độ dữ liệu giả: không dùng mạng. services/realtime.ts mở "nguồn" này thay cho EventSource.
// Test và demo điều khiển bằng mockRealtime: emit({ type: 'attendance.punched', ... }), ready(), fail(), refuse(true).
type Listener = (e: { data: string }) => void;

export class MockSource {
  readyState = 0; // 0 đang nối, 1 mở, 2 đã đóng (giống EventSource)
  onerror: (() => void) | null = null;
  private listeners = new Map<string, Listener[]>();
  addEventListener(type: string, fn: Listener) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), fn]);
  }
  dispatch(type: string, data: unknown = {}) {
    for (const fn of this.listeners.get(type) ?? []) fn({ data: JSON.stringify(data) });
  }
  close() {
    this.readyState = 2;
    const i = mockRealtime.sources.indexOf(this);
    if (i >= 0) mockRealtime.sources.splice(i, 1);
  }
}

export const mockRealtime = {
  sources: [] as MockSource[],
  opened: 0, // số lần mở luồng từ đầu phiên trang (test dùng để kiểm "nhân viên không mở luồng")
  autoReady: true, // tự gửi `ready` khi vừa mở
  refusing: false, // true: luồng mới bị từ chối ngay (như 401/403/429)
  /** Dùng bởi services/realtime.ts. */
  open(): MockSource {
    const src = new MockSource();
    this.opened++;
    this.sources.push(src);
    queueMicrotask(() => {
      if (src.readyState === 2) return;
      if (this.refusing) {
        src.readyState = 2;
        src.onerror?.();
      } else if (this.autoReady) {
        src.readyState = 1;
        src.dispatch('ready');
      }
    });
    return src;
  },
  /** Phát một sự kiện máy chủ giả tới mọi luồng đang mở: { type: 'attendance.punched' | 'attendance.changed' | 'ready', ... }. */
  emit(event: { type: string; [k: string]: unknown }) {
    for (const s of [...this.sources]) {
      if (event.type === 'ready') s.readyState = 1;
      s.dispatch(event.type, event);
    }
  },
  ready() {
    this.emit({ type: 'ready' });
  },
  /** Mất kết nối: closed=false là EventSource tự nối lại (chờ ready()); closed=true là trình duyệt bỏ cuộc (401/403/429). */
  fail(closed = false) {
    for (const s of [...this.sources]) {
      if (closed) s.readyState = 2;
      else s.readyState = 0;
      s.onerror?.();
    }
  },
  refuse(on: boolean) {
    this.refusing = on;
  }
};
