// Chọn giao diện nhân viên theo bề ngang (spec 1.1): từ 1136px là trang máy tính, hẹp hơn là app điện thoại.
// Một media query và một ref cho cả app: tạo ở lần gọi đầu, không gắn listener mới mỗi lần gọi.
import { readonly, ref, type Ref } from 'vue';

export const STAFF_DESKTOP_MIN = 1136;

let isDesktop: Ref<boolean> | null = null;

export function useStaffDesktop(): Readonly<Ref<boolean>> {
  if (!isDesktop) {
    const mq = window.matchMedia(`(min-width: ${STAFF_DESKTOP_MIN}px)`);
    const state = ref(mq.matches);
    mq.addEventListener('change', e => (state.value = e.matches));
    isDesktop = state;
  }
  return readonly(isDesktop) as Readonly<Ref<boolean>>;
}
