// Kéo ngang bảng bằng chuột (spec 3.3). Cảm ứng và bàn di cuộn đã cuộn được nên bỏ qua.
// Nhấn rồi rê quá 4px mới là kéo; thả sau khi kéo thì nuốt cú bấm ngay sau đó để kéo qua tên không mở phiếu.
import { onBeforeUnmount, watch, type Ref } from 'vue';

const THRESHOLD = 4;

export function useDragScroll(el: Ref<HTMLElement | null>): void {
  let pointer = -1;
  let startX = 0;
  let startLeft = 0;
  let dragging = false;
  let swallow = false;

  const down = (e: PointerEvent) => {
    if (e.pointerType !== 'mouse' || e.button !== 0 || !el.value) return;
    pointer = e.pointerId;
    startX = e.clientX;
    startLeft = el.value.scrollLeft;
    dragging = false;
  };
  const move = (e: PointerEvent) => {
    const box = el.value;
    if (!box || e.pointerId !== pointer) return;
    // Nút đã nhả ngoài hộp trước khi vượt ngưỡng (chưa bắt con trỏ nên pointerup không về đây): bỏ lần nhấn đó.
    if (!(e.buttons & 1)) {
      pointer = -1;
      dragging = false;
      box.classList.remove('dragging');
      return;
    }
    const dx = e.clientX - startX;
    if (!dragging) {
      if (Math.abs(dx) <= THRESHOLD) return;
      dragging = true;
      box.setPointerCapture(pointer);
      box.classList.add('dragging');
    }
    window.getSelection()?.removeAllRanges();
    box.scrollLeft = startLeft - dx;
  };
  const end = (e: PointerEvent) => {
    if (e.pointerId !== pointer) return;
    pointer = -1;
    if (!dragging) return;
    dragging = false;
    el.value?.classList.remove('dragging');
    // Cú bấm của lần thả đến ngay sau pointerup; nếu không có thì bỏ cờ ở lượt sau để không nuốt nhầm cú bấm khác.
    swallow = true;
    setTimeout(() => (swallow = false), 0);
  };
  const click = (e: MouseEvent) => {
    if (!swallow) return;
    swallow = false;
    e.preventDefault();
    e.stopPropagation();
  };

  watch(
    el,
    (box, _old, onCleanup) => {
      if (!box) return;
      box.addEventListener('pointerdown', down);
      box.addEventListener('pointermove', move);
      box.addEventListener('pointerup', end);
      box.addEventListener('pointercancel', end);
      box.addEventListener('click', click, { capture: true });
      onCleanup(() => {
        box.removeEventListener('pointerdown', down);
        box.removeEventListener('pointermove', move);
        box.removeEventListener('pointerup', end);
        box.removeEventListener('pointercancel', end);
        box.removeEventListener('click', click, { capture: true });
      });
    },
    { immediate: true, flush: 'post' }
  );
  onBeforeUnmount(() => el.value?.classList.remove('dragging'));
}
