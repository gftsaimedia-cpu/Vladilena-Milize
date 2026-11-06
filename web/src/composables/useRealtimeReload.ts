// Đăng ký tải lại một màn khi có sự kiện realtime. Nhiều sự kiện trong debounceMs gộp thành một lần reload.
// Cũng tải lại khi `ready` sau khi nối lại (không tải lần nối đầu) và mỗi nhịp hỏi lại 30 giây khi SSE hỏng.
// Sau khi dữ liệu mới về, ô (username + workDate) của người vừa chấm nháy sáng.
import { getCurrentScope, nextTick, onScopeDispose } from 'vue';
import { onRealtime, type RealtimeEvent } from '@/services/realtime';
import { flashKey, useRealtimeStore } from '@/stores/realtime';

type Options = {
  types?: Array<'attendance.punched' | 'attendance.changed'>;
  debounceMs?: number;
  /** Chỉ tải lại cho sự kiện thoả điều kiện (vd. đúng người đang xem). `ready` và `poll` luôn tải lại. */
  filter?: (event: any) => boolean;
};

export function useRealtimeReload(reload: () => unknown, opts: Options = {}) {
  const { types = ['attendance.punched', 'attendance.changed'], debounceMs = 300, filter } = opts;
  const store = useRealtimeStore();
  let timer: ReturnType<typeof setTimeout> | null = null;
  const keys = new Set<string>();

  async function fire() {
    timer = null;
    const flash = [...keys];
    keys.clear();
    try {
      await reload();
    } catch {
      return;
    }
    await nextTick();
    if (flash.length) store.markFlash(flash);
  }
  function schedule(event?: RealtimeEvent) {
    if (event && 'username' in event && 'workDate' in event) keys.add(flashKey(event.username, event.workDate));
    if (timer) clearTimeout(timer);
    timer = setTimeout(fire, debounceMs);
  }

  const offs = [
    ...types.map(t => onRealtime(t, e => (!filter || filter(e)) && schedule(e))),
    onRealtime('ready', e => e.reconnected && schedule()),
    onRealtime('poll', () => schedule())
  ];
  const stop = () => {
    offs.forEach(off => off());
    if (timer) clearTimeout(timer);
    timer = null;
  };
  if (getCurrentScope()) onScopeDispose(stop);
  return stop;
}
