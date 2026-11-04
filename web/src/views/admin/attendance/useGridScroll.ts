// Cuộn lưới chấm công theo ngày: kéo chuột, bắt về cột gần nhất, phím và nút tuần. Chạm dùng cuộn gốc của trình duyệt.
// Bề rộng cột ngày không cố định: mỗi lần vùng cuộn đổi cỡ, hook đo lại (ResizeObserver), ghi vào biến CSS --w-day của vùng cuộn
// rồi tính mọi bước cuộn theo bề rộng đó. Màn rộng thì 7 cột ngày vừa khít vùng nhìn; màn hẹp giữ 96px và cuộn như thường.
// `start` là chỉ số ngày đầu của tuần đang xem, tính từ scrollLeft; mọi cách cuộn đều đi qua sự kiện `scroll`.
// Chỗ đứng được giữ ngoài hook: `initial()` cho chỉ số ngày đầu lúc mở (không có thì tuần hôm nay), `settle(start)` được gọi khi
// cuộn đã yên (không còn sự kiện scroll trong SETTLE_MS) để nơi dùng ghi chỗ đứng lên URL.
import { computed, onBeforeUnmount, onMounted, ref, type ComputedRef, type Ref } from 'vue';

export const MIN_COL = 96; // bề rộng nhỏ nhất của một cột ngày
export const WEEK_DAYS = 7;
export const TODAY_START = 14; // tuần 26/10: cột thứ 15 của lưới
export const MAX_START = 21; // 28 ngày, tuần cuối bắt đầu ở ngày thứ 22
const THRESHOLD = 4; // dưới ngưỡng này vẫn là cú bấm, không phải kéo
const SETTLE_MS = 120; // hết sự kiện scroll chừng này thì coi là đã yên (hoạt ảnh bắt cột phát nhiều sự kiện liên tiếp)

export interface GridScroll {
  start: Ref<number>;
  atStart: ComputedRef<boolean>;
  atEnd: ComputedRef<boolean>;
  prevWeek(): void;
  nextWeek(): void;
  thisWeek(): void;
}

export interface GridScrollOptions {
  initial?: () => number | undefined;
  settle?: (start: number) => void;
}

export function useGridScroll(scroller: Ref<HTMLElement | null>, options: GridScrollOptions = {}): GridScroll {
  const clampStart = (n: number) => Math.min(Math.max(n, 0), MAX_START);
  const opening = clampStart(options.initial?.() ?? TODAY_START);
  const start = ref(opening);
  const left = ref(0);
  const max = ref(0);
  const atStart = computed(() => left.value < 1);
  const atEnd = computed(() => max.value - left.value < 1);

  // Bề rộng một cột ngày, đo từ vùng cuộn: (vùng nhìn − cột tên − 3 cột tổng) / 7, làm tròn xuống số nguyên để bắt cột rơi đúng biên.
  let colW = MIN_COL;
  function measure(el: HTMLElement) {
    const cs = getComputedStyle(el);
    const px = (name: string) => parseFloat(cs.getPropertyValue(name)) || 0;
    const room = el.clientWidth - px('--w-nm') - 3 * px('--w-sm');
    return Math.max(MIN_COL, Math.floor(room / WEEK_DAYS));
  }
  function applyWidth(el: HTMLElement) {
    colW = measure(el);
    el.style.setProperty('--w-day', `${colW}px`);
  }

  const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const maxLeft = (el: HTMLElement) => Math.max(0, el.scrollWidth - el.clientWidth);
  // Kẹp trong biên. Phần dư cuối lưới ngắn hơn nửa cột (vùng nhìn hẹp hơn 7 cột một chút) được gộp vào điểm cuối,
  // để "Tuần sau" và kéo thả luôn dừng đúng ở cuối thay vì chừa lại một vệt hẹp.
  const goTo = (target: number) => {
    const el = scroller.value;
    if (!el) return;
    const end = maxLeft(el);
    const clamped = Math.min(Math.max(target, 0), end);
    el.scrollTo({ left: end - clamped < colW / 2 ? end : clamped, behavior: reduced() ? 'auto' : 'smooth' });
  };
  // Bước đi (tính bằng ngày) bắt đầu từ cột gần nhất, nên đang ở điểm cuối lệch cột thì lùi một tuần vẫn rơi đúng vào cột.
  const by = (days: number) => scroller.value && goTo((Math.round(scroller.value.scrollLeft / colW) + days) * colW);

  let settleTimer: number | undefined;
  // Đổi cỡ không phải là người dùng đổi tuần: cú cuộn do ta tự bắt lại cột thì không báo `settle`, URL không bị ghi.
  let quiet = false;
  function sync() {
    const el = scroller.value;
    if (!el) return;
    left.value = el.scrollLeft;
    max.value = maxLeft(el);
    start.value = clampStart(Math.round(el.scrollLeft / colW));
    window.clearTimeout(settleTimer);
    if (quiet) return;
    settleTimer = window.setTimeout(() => options.settle?.(start.value), SETTLE_MS);
  }
  // Bề rộng đổi: giữ nguyên ngày đầu tuần đang xem, bắt lại scrollLeft theo bề rộng mới.
  let frame = 0;
  function onResize() {
    const el = scroller.value;
    if (!el || measure(el) === colW) return;
    const keep = start.value;
    quiet = true;
    applyWidth(el);
    el.scrollLeft = keep * colW;
    sync();
    // Sự kiện scroll do ta gây ra tới trước khung hình kế; gỡ cờ sau đó.
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => (frame = requestAnimationFrame(() => (quiet = false))));
  }
  let observer: ResizeObserver | undefined;

  // Một lượt nhấn chuột: chưa kéo thì chỉ "giương" (armed); qua ngưỡng mới bắt con trỏ và cuộn.
  let press: { id: number; x: number; left: number } | null = null;
  let dragging = false;
  let swallow = false;
  let swallowTimer: number | undefined;

  function endPress(el: HTMLElement) {
    const wasDragging = dragging;
    const id = press?.id;
    press = null;
    dragging = false;
    el.classList.remove('dragging');
    if (id !== undefined && el.hasPointerCapture?.(id)) el.releasePointerCapture(id);
    if (!wasDragging) return;
    // Cú click đi liền sau lượt kéo bị chặn; cờ tự xoá ở lượt kế để không nuốt nhầm cú bấm sau đó.
    swallow = true;
    window.clearTimeout(swallowTimer);
    swallowTimer = window.setTimeout(() => (swallow = false), 0);
    goTo(Math.round(el.scrollLeft / colW) * colW);
  }

  function onPointerDown(e: PointerEvent) {
    const el = scroller.value;
    if (!el || e.pointerType === 'touch' || e.button !== 0) return;
    press = { id: e.pointerId, x: e.clientX, left: el.scrollLeft };
  }
  function onPointerMove(e: PointerEvent) {
    const el = scroller.value;
    if (!el || !press) return;
    // Nút đã nhả ở ngoài vùng cuộn (không có capture nên pointerup không tới): bỏ lượt nhấn, kẻo rê vào lại thành kéo ma.
    if (!(e.buttons & 1)) {
      endPress(el);
      return;
    }
    if (e.pointerId !== press.id) return;
    const dx = e.clientX - press.x;
    if (!dragging) {
      if (Math.abs(dx) <= THRESHOLD) return;
      dragging = true;
      el.classList.add('dragging');
      el.setPointerCapture(e.pointerId);
    }
    el.scrollLeft = press.left - dx;
  }
  function onPointerEnd(e: PointerEvent) {
    const el = scroller.value;
    if (el && press && e.pointerId === press.id) endPress(el);
  }
  function onClick(e: MouseEvent) {
    if (!swallow) return;
    swallow = false;
    e.preventDefault();
    e.stopPropagation();
  }
  function onDragStart(e: Event) {
    e.preventDefault();
  }
  function onKeyDown(e: KeyboardEvent) {
    if (e.target !== scroller.value || e.altKey || e.ctrlKey || e.metaKey) return;
    const el = scroller.value;
    if (!el) return;
    switch (e.key) {
      case 'ArrowLeft':
        by(-1);
        break;
      case 'ArrowRight':
        by(1);
        break;
      case 'PageUp':
        by(-WEEK_DAYS);
        break;
      case 'PageDown':
        by(WEEK_DAYS);
        break;
      case 'Home':
        goTo(0);
        break;
      case 'End':
        goTo(maxLeft(el));
        break;
      default:
        return;
    }
    e.preventDefault();
  }

  onMounted(() => {
    const el = scroller.value;
    if (!el) return;
    applyWidth(el);
    el.scrollLeft = opening * colW;
    sync();
    el.addEventListener('scroll', sync, { passive: true });
    el.addEventListener('pointerdown', onPointerDown);
    el.addEventListener('pointermove', onPointerMove);
    el.addEventListener('pointerup', onPointerEnd);
    el.addEventListener('pointercancel', onPointerEnd);
    el.addEventListener('click', onClick, true);
    el.addEventListener('dragstart', onDragStart);
    el.addEventListener('keydown', onKeyDown);
    observer = new ResizeObserver(onResize);
    observer.observe(el);
  });
  onBeforeUnmount(() => {
    const el = scroller.value;
    window.clearTimeout(swallowTimer);
    window.clearTimeout(settleTimer); // rời màn: không ghi URL của màn kế tiếp
    observer?.disconnect();
    cancelAnimationFrame(frame);
    if (!el) return;
    el.removeEventListener('scroll', sync);
    el.removeEventListener('pointerdown', onPointerDown);
    el.removeEventListener('pointermove', onPointerMove);
    el.removeEventListener('pointerup', onPointerEnd);
    el.removeEventListener('pointercancel', onPointerEnd);
    el.removeEventListener('click', onClick, true);
    el.removeEventListener('dragstart', onDragStart);
    el.removeEventListener('keydown', onKeyDown);
    el.classList.remove('dragging');
  });

  return {
    start,
    atStart,
    atEnd,
    prevWeek: () => by(-WEEK_DAYS),
    nextWeek: () => by(WEEK_DAYS),
    thisWeek: () => goTo(TODAY_START * colW)
  };
}
