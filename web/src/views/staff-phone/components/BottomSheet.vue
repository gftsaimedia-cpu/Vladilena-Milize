<script setup lang="ts">
// Hộp trượt từ dưới lên dùng chung cho app nhân viên trên điện thoại (spec 3.5): Teleport vào body, khoá cuộn, bẫy focus,
// Esc chỉ đóng hộp trên cùng, bấm nền mờ hoặc kéo thanh nắm xuống quá 90px thì đóng, trả focus về phần tử đã mở hộp.
// Đầu hộp: tiêu đề (cũng là tên của dialog) + dòng phụ bên trái, nhãn trạng thái ở slot #badge bên phải. Không có nút ×:
// nút đóng của từng hộp nằm trong thân (slot mặc định).
//   <BottomSheet title="Phép năm 12/10" sub="Đơn nghỉ" @close="…"><template #badge>…</template> …thân… </BottomSheet>
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { lockScroll, unlockScroll } from '@/components/ui/overlay-lock';

const props = defineProps({
  title: { type: String, default: '' },
  sub: { type: String, default: '' },
  dismissable: { type: Boolean, default: true }
});
const emit = defineEmits(['close']);

const root = ref(null);
const dy = ref(0);
const dragging = ref(false);
let startY = 0;
let returnFocus: HTMLElement | null = null;
const CLOSE_AT = 90; // kéo xuống quá ngần này (px) thì đóng
const isTopSheet = () => {
  const sheets = document.querySelectorAll('.ph-sheet');
  return sheets.item(sheets.length - 1) === root.value;
};

const close = () => {
  if (props.dismissable) emit('close');
};
const onKey = (e: KeyboardEvent) => {
  if (!isTopSheet()) return;
  if (e.key === 'Escape') {
    if (props.dismissable) {
      e.preventDefault();
      close();
    }
    return;
  }
  if (e.key !== 'Tab' || !root.value) return;
  const items = [
    ...root.value.querySelectorAll(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )
  ].filter((el: any) => el.getClientRects().length > 0) as HTMLElement[];
  if (!items.length) {
    e.preventDefault();
    root.value.focus();
    return;
  }
  const first = items[0];
  const last = items[items.length - 1];
  if (!root.value.contains(document.activeElement)) {
    e.preventDefault();
    (e.shiftKey ? last : first).focus();
  } else if (e.shiftKey && (document.activeElement === first || document.activeElement === root.value)) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
};
function down(e?) {
  if (e.button > 0) return;
  dragging.value = true;
  startY = e.clientY;
  e.currentTarget.setPointerCapture?.(e.pointerId);
}
function move(e?) {
  if (dragging.value) dy.value = Math.max(0, e.clientY - startY);
}
function up() {
  if (!dragging.value) return;
  dragging.value = false;
  if (dy.value > CLOSE_AT) close();
  dy.value = 0;
}

onMounted(() => {
  returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  lockScroll();
  document.addEventListener('keydown', onKey);
  nextTick(() => {
    const first = root.value?.querySelector('button, input, select, textarea, a[href]');
    if (first) first.focus();
    else root.value?.focus();
  });
});
onBeforeUnmount(() => {
  unlockScroll();
  document.removeEventListener('keydown', onKey);
  if (returnFocus?.isConnected) returnFocus.focus();
});
</script>

<template>
  <Teleport to="body">
    <div class="ph-sheet-root">
      <div class="ph-sheet-scrim" @click="close" />
      <div
        ref="root"
        class="ph-sheet"
        :class="{ drag: dragging }"
        role="dialog"
        aria-modal="true"
        tabindex="-1"
        :aria-label="title || undefined"
        :style="{ transform: dy ? `translateY(${dy}px)` : undefined }"
      >
        <div class="drag-zone" @pointerdown="down" @pointermove="move" @pointerup="up" @pointercancel="up">
          <div class="grab" />
          <div class="sh shd">
            <div class="shd-t">
              <h2>{{ title }}</h2>
              <div v-if="sub" class="mut">{{ sub }}</div>
            </div>
            <div v-if="$slots.badge" class="shd-b"><slot name="badge" /></div>
          </div>
        </div>
        <slot />
      </div>
    </div>
  </Teleport>
</template>

<style>
/* Không scoped: thân hộp do màn khác điền vào. Hình theo board J3, J5 (spec 3.5); lớp dùng chung (.kv, .st, .dot, .b2…) ở styles/phone.css. */
.ph-sheet-root {
  position: fixed;
  inset: 0;
  z-index: 100;
}
.ph-sheet-scrim {
  position: absolute;
  inset: 0;
  background: rgba(28, 28, 28, 0.4);
}
.ph-sheet {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  max-width: 430px;
  margin: 0 auto;
  max-height: 92vh;
  overflow-y: auto;
  overscroll-behavior: contain;
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 8px 20px calc(24px + env(safe-area-inset-bottom, 0px));
  border-radius: 24px 24px 0 0;
  background: var(--surface);
  color: var(--text);
  font-size: 14px;
  line-height: 20px;
  font-variant-numeric: tabular-nums;
  outline: none;
  animation: ph-sheet-up 0.22s ease-out;
  transition: transform 0.2s ease;
}
@media (prefers-reduced-motion: reduce) {
  .ph-sheet,
  .ph-sheet.drag {
    animation: none;
    transition: none;
  }
}
.ph-sheet.drag {
  transition: none;
}
@keyframes ph-sheet-up {
  from {
    transform: translateY(40%);
    opacity: 0;
  }
  to {
    transform: none;
    opacity: 1;
  }
}
.ph-sheet .drag-zone {
  display: flex;
  flex-direction: column;
  gap: 16px;
  touch-action: none;
  cursor: grab;
}
.ph-sheet .grab {
  width: 40px;
  height: 4px;
  border-radius: 50px;
  background: #e0e0e0;
  margin: 0 auto 4px;
}
.ph-sheet .shd {
  align-items: flex-start;
}
.ph-sheet .shd-t {
  min-width: 0;
}
.ph-sheet h2 {
  margin: 0;
  font-size: 18px;
  line-height: 24px;
  font-weight: 600;
}
.ph-sheet .shd-b {
  flex: none;
  margin-top: 4px;
}

/* Biểu mẫu trong hộp (Đổi mật khẩu): ô nhập bo 8px, focus 2px --text cách 2px, không bóng */
.ph-sheet form {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.ph-sheet .fld {
  margin: 0;
}
.ph-sheet .fld label {
  font-size: 14px;
}
.ph-sheet .inp {
  position: relative;
  min-height: 48px;
  font-size: 16px;
  border-radius: 8px;
}
.ph-sheet .inp:focus-within {
  border-color: var(--text);
  outline: 2px solid var(--text);
  outline-offset: 2px;
}
.ph-sheet .inp input {
  flex: 1;
  min-width: 0;
  height: 46px;
  border: 0;
  background: transparent;
  font: inherit;
  color: inherit;
  outline: none;
  padding: 0;
}
.ph-sheet .inp input::placeholder {
  color: #9e9e9e;
}
.ph-sheet .bt {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  margin-top: 4px;
}
.ph-sheet .bt button {
  height: 48px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  font: inherit;
  font-weight: 600;
  border: 1px solid var(--control);
  background: var(--surface);
  color: var(--text);
  cursor: pointer;
}
.ph-sheet .bt .pri {
  background: var(--surface-dark);
  color: #ffffff;
  border-color: var(--surface-dark);
}
.ph-sheet .bt button:disabled {
  opacity: 0.6;
  cursor: default;
}
</style>
