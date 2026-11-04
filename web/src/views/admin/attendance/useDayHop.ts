// Hộp chi tiết ngày mở sẵn theo ?hop=chi-tiet-ngay&nv=<id>&ngay=<YYYY-MM-DD> (mục lục thiết kế, tải lại trang mở lại hộp).
// Mở và đóng bằng router.replace; đóng chỉ bỏ ba khoá đó, các khoá khác (thang, q, pb, xem, tuan) giữ nguyên.
//
// Trả focus sau khi đóng: AppModal chỉ trả focus về nút đã mở hộp nếu nút còn trong trang. Xử lý xong một việc thì nút đó có thể biến mất
// (dòng rời danh sách, ô thành span, lời nhắc hết), nên màn nào có chuyện đó truyền vào `focus`:
//   capture(opener) chạy lúc mở, khi nút còn nguyên, để nhớ vị trí của nó (dòng thứ mấy, ô thứ mấy);
//   restore(opener, ctx, closing) chạy sau khi hộp đóng, để chọn chỗ đặt focus khi nút đã mất.
// Mở bằng đường dẫn (tải lại, liên kết) không có nút mở nên không trả focus.
import { computed, nextTick, watch, type Ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';

export interface DayRef {
  personId: string;
  date: string;
}
export interface DayFocus<C> {
  capture(opener: HTMLElement): C;
  restore(opener: HTMLElement, ctx: C, closing: DayRef): void | Promise<void>;
}

export function useDayHop<C = undefined>(focus?: DayFocus<C>) {
  const route = useRoute();
  const router = useRouter();
  const day = computed<DayRef | null>(() => {
    const { hop, nv, ngay } = route.query;
    return hop === 'chi-tiet-ngay' && typeof nv === 'string' && typeof ngay === 'string'
      ? { personId: nv, date: ngay }
      : null;
  });
  let held: { el: HTMLElement; ctx: C } | null = null;

  function openDay(personId: string, date: string) {
    const active = document.activeElement;
    held = focus && active instanceof HTMLElement && active !== document.body ? { el: active, ctx: focus.capture(active) } : null;
    router.replace({ query: { ...route.query, hop: 'chi-tiet-ngay', nv: personId, ngay: date } });
  }
  async function closeDay() {
    const closing = day.value;
    const mine = held;
    held = null;
    const { hop, nv, ngay, ...rest } = route.query;
    await router.replace({ query: rest });
    if (!focus || !mine || !closing) return;
    await nextTick(); // hộp gỡ xong, AppModal đã thử trả focus về nút mở
    await focus.restore(mine.el, mine.ctx, closing);
  }
  return { day, openDay, closeDay };
}

/** Đợi lượt tải lại sau khi xử lý việc xong (cờ `loading` của useLoad về false) rồi thêm một nhịp vẽ, để dòng/ô/lời nhắc đã đổi hẳn. */
export async function untilIdle(loading: Ref<boolean>) {
  await nextTick();
  if (loading.value) {
    await new Promise<void>(resolve => {
      const stop = watch(loading, busy => {
        if (busy) return;
        stop();
        resolve();
      });
    });
  }
  await nextTick();
}

/** Focus đã rơi về body (nút mở biến mất) thì mới cần đặt lại; đang ở chỗ khác có chủ ý thì để yên. */
export const focusLost = () => !document.activeElement || document.activeElement === document.body;
