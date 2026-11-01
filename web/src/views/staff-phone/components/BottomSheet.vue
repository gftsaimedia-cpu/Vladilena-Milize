<script setup lang="ts">
// Bảng trượt từ dưới lên dùng chung cho màn nhân viên (điện thoại): Teleport vào body, nền mờ,
// bấm nền hoặc Esc để đóng, kéo thanh nắm/tiêu đề xuống để đóng. Thân ở slot mặc định, huy hiệu cạnh tiêu đề ở #badge.
//   <BottomSheet title="Đổi mật khẩu" sub="Tài khoản demo_nv4" @close="…"> …thân… </BottomSheet>
import { onBeforeUnmount, onMounted, ref } from 'vue';
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
const CLOSE_AT = 90; // kéo xuống quá ngần này (px) thì đóng

const close = () => {
  if (props.dismissable) emit('close');
};
const onKey = (e?) => {
  if (e.key === 'Escape') close();
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
  lockScroll();
  document.addEventListener('keydown', onKey);
  root.value?.focus();
});
onBeforeUnmount(() => {
  unlockScroll();
  document.removeEventListener('keydown', onKey);
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
          <h2>
            {{ title }}
            <slot name="badge" />
          </h2>
          <div v-if="sub" class="sub">{{ sub }}</div>
        </div>
        <slot />
      </div>
    </div>
  </Teleport>
</template>

<style>
/* Không scoped: thân bảng trượt do màn khác điền vào; mọi luật nằm dưới .ph-sheet (chuyển từ phần <style> của nv-sheet-*.html). */
.ph-sheet-root {
  position: fixed;
  inset: 0;
  z-index: 100;
}
.ph-sheet-scrim {
  position: absolute;
  inset: 0;
  background: rgba(24, 24, 24, 0.42);
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
  background: #fff;
  border-radius: 22px 22px 0 0;
  padding: 10px 16px 24px;
  outline: none;
  animation: ph-sheet-up 0.22s ease-out;
  transition: transform 0.2s ease;
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
  touch-action: none;
  cursor: grab;
}
.ph-sheet .grab {
  width: 40px;
  height: 4px;
  border-radius: 2px;
  background: #d6d6d6;
  margin: 0 auto 14px;
}
.ph-sheet h2 {
  margin: 0;
  font-size: 21px;
  line-height: 28px;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 10px;
}
.ph-sheet h2 .pill {
  margin-left: auto;
}
.ph-sheet .pill.live {
  background: var(--gold-light);
  color: #5c4310;
}
.ph-sheet .sub {
  color: var(--muted);
  font-size: 14px;
  line-height: 20px;
  margin-top: 4px;
}
.ph-sheet .fld label {
  font-size: 14px;
}
.ph-sheet .inp {
  position: relative;
  min-height: 48px;
  font-size: 16px;
  border-radius: 12px;
}
.ph-sheet .inp:focus-within {
  border-color: var(--text);
  box-shadow: 0 0 0 3px #e9e9e9;
}
.ph-sheet .inp input,
.ph-sheet .inp select {
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
.ph-sheet .opt {
  position: relative;
  display: flex;
  gap: 12px;
  padding: 12px 0;
  border-top: 1px solid var(--rule);
  cursor: pointer;
}
.ph-sheet .opt input {
  position: absolute;
  opacity: 0;
  pointer-events: none;
}
.ph-sheet .opt .rd {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  border: 2px solid #9e9e9e;
  flex: none;
  margin-top: 1px;
}
.ph-sheet .opt.on .rd {
  border: 7px solid var(--text);
}
.ph-sheet .opt:has(input:focus-visible) .rd {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
.ph-sheet .opt b {
  display: block;
  font-size: 16px;
  font-weight: 600;
  line-height: 22px;
}
.ph-sheet .opt span.d {
  display: block;
  font-size: 13px;
  color: var(--muted);
  line-height: 18px;
  margin-top: 2px;
}
.ph-sheet .bt {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  margin-top: 18px;
}
.ph-sheet .bt button {
  height: 50px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  font: inherit;
  font-weight: 600;
  font-size: 16px;
  border: 1px solid var(--control);
  background: #fff;
  color: var(--text);
  cursor: pointer;
}
.ph-sheet .bt .pri {
  background: var(--primary);
  color: #fff;
  border-color: var(--primary);
}
.ph-sheet .bt button:disabled {
  opacity: 0.6;
  cursor: default;
}
.ph-sheet .lu {
  background: var(--raised);
  border: 1px solid var(--border);
  border-radius: 14px;
  padding: 12px 14px;
  margin-top: 14px;
}
.ph-sheet .lu b {
  font-size: 16px;
  font-variant-numeric: tabular-nums;
}
.ph-sheet .lu span {
  display: block;
  color: var(--muted);
  font-size: 13px;
  margin-top: 2px;
}
.ph-sheet .kvx {
  display: flex;
  justify-content: space-between;
  padding: 14px 0;
  border-bottom: 1px solid var(--rule);
  font-size: 15px;
}
.ph-sheet .kvx b {
  font-weight: 600;
}
.ph-sheet .shiftbox {
  min-height: 48px;
  border-radius: 12px;
  background: var(--raised);
  border: 1px solid var(--border);
  display: flex;
  align-items: center;
  padding: 0 14px;
  font-weight: 600;
}
.ph-sheet .hint {
  font-size: 13px;
  color: var(--muted);
  line-height: 18px;
  margin-top: 6px;
}
.ph-sheet .note {
  margin-top: 12px;
}
</style>
