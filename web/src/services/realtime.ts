// Realtime: luồng SSE GET /api/v2/realtime/stream (admin) và /api/v2/realtime/me (nhân viên, chỉ sự kiện của mình) và bus sự kiện nhỏ cho các màn.
// SSE không phát lại sự kiện đã lỡ → mỗi lần nhận `ready` sau khi nối lại, màn phải tải lại dữ liệu đang xem (bus phát
// { type: 'ready', reconnected: true }). Lỗi liên tục thì hỏi lại định kỳ: bus phát { type: 'poll' } mỗi 30 giây.
import { mockRealtime } from '@/mock/realtime';

export type RealtimeStatus = 'connecting' | 'live' | 'offline';
export type PunchEvent = {
  type: 'attendance.punched';
  username: string;
  name: string;
  workDate: string;
  direction: 'IN' | 'OUT';
  at: string;
  time: string;
  source: 'self' | 'admin';
};
export type ChangeEvent = { type: 'attendance.changed'; username: string; workDate: string };
export type RequestDecidedEvent = {
  type: 'request.decided';
  username: string;
  requestId: string;
  kind: string;
  status: 'APPROVED' | 'REJECTED' | 'CANCELLED';
};
export type PayslipDecidedEvent = { type: 'payslip.decided'; username: string; month: string; status: 'approved' | 'rejected' };
/** Admin: đơn hay giải trình mới đang chờ duyệt. */
export type RequestFiledEvent = { type: 'request.filed'; username: string; name: string; requestId: string; kind: string; title: string };
/** Admin: kỳ lương đổi trạng thái (chốt công, mở lại, tính lương, phê duyệt, trả lương...). */
export type PeriodChangedEvent = { type: 'period.changed'; month: string; state: string };
/** Admin: hồ sơ nhân sự thêm, sửa hoặc cho nghỉ việc. */
export type StaffChangedEvent = { type: 'staff.changed'; username: string; change: 'created' | 'updated' | 'ended' };
export type RealtimeEvent =
  | PunchEvent
  | RequestFiledEvent
  | PeriodChangedEvent
  | StaffChangedEvent
  | ChangeEvent
  | RequestDecidedEvent
  | PayslipDecidedEvent
  | { type: 'ready'; reconnected: boolean }
  | { type: 'poll' };
export type RealtimeScope = 'admin' | 'me';
/** Các loại sự kiện máy chủ (trừ `ready` và `poll` do bộ nối tự phát). */
export type LiveType = Exclude<RealtimeEvent['type'], 'ready' | 'poll'>;
type Handler = (event: any) => void;

export const STREAM_URL = '/api/v2/realtime/stream';
export const ME_STREAM_URL = '/api/v2/realtime/me';
export const POLL_MS = 30_000;
const MAX_FAILS = 3;

const handlers = new Map<string, Set<Handler>>();

/** Đăng ký nghe một loại sự kiện; trả hàm huỷ. */
export function onRealtime(type: RealtimeEvent['type'], handler: (event: any) => void): () => void {
  let set = handlers.get(type);
  if (!set) handlers.set(type, (set = new Set()));
  set.add(handler);
  return () => set!.delete(handler);
}

export function emitRealtime(event: RealtimeEvent) {
  for (const fn of [...(handlers.get(event.type) ?? [])]) fn(event);
}

type Source = {
  readyState: number;
  onerror: ((e?: unknown) => void) | null;
  addEventListener(type: string, fn: (e: { data: string }) => void): void;
  close(): void;
};
const openSource = (scope: RealtimeScope): Source =>
  __MOCK__ ? mockRealtime.open() : (new EventSource(scope === 'me' ? ME_STREAM_URL : STREAM_URL) as unknown as Source);

/** Bộ nối: start() mở luồng, stop() đóng; onStatus báo trạng thái kết nối. */
export function createRealtime(onStatus: (s: RealtimeStatus) => void, scope: RealtimeScope = 'admin') {
  let source: Source | null = null;
  let running = false;
  let everReady = false;
  let fails = 0;
  let pollTimer: ReturnType<typeof setInterval> | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;

  const stopPolling = () => {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = null;
  };
  const startPolling = () => {
    if (!pollTimer) pollTimer = setInterval(() => emitRealtime({ type: 'poll' }), POLL_MS);
  };
  const stopRetry = () => {
    if (retryTimer) clearTimeout(retryTimer);
    retryTimer = null;
  };

  function open() {
    source?.close();
    const src = (source = openSource(scope));
    src.addEventListener('ready', () => {
      if (src !== source) return;
      fails = 0;
      stopPolling();
      stopRetry();
      onStatus('live');
      emitRealtime({ type: 'ready', reconnected: everReady });
      everReady = true;
    });
    for (const type of ['attendance.punched', 'attendance.changed', 'request.decided', 'payslip.decided', 'request.filed', 'period.changed', 'staff.changed']) {
      src.addEventListener(type, e => {
        if (src !== source) return;
        try {
          emitRealtime({ ...JSON.parse(e.data), type } as RealtimeEvent);
        } catch {
          /* khung hỏng thì bỏ qua */
        }
      });
    }
    src.onerror = () => {
      if (src !== source || !running) return;
      fails++;
      onStatus('offline');
      // readyState 2: trình duyệt bỏ cuộc (401/403/429...) → hỏi định kỳ và thử nối lại SSE nền sau mỗi 30 giây.
      if (src.readyState === 2) {
        src.close();
        source = null;
        fails = MAX_FAILS;
        startPolling();
        stopRetry();
        retryTimer = setTimeout(() => running && open(), POLL_MS);
      } else if (fails >= MAX_FAILS) {
        startPolling(); // EventSource vẫn tự nối lại nền
      }
    };
  }

  return {
    start() {
      if (running) return;
      running = true;
      everReady = false;
      fails = 0;
      onStatus('connecting');
      open();
    },
    stop() {
      running = false;
      source?.close();
      source = null;
      stopPolling();
      stopRetry();
      onStatus('offline');
    }
  };
}
