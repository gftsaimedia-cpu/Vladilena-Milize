<script setup lang="ts">
// Chỗ hiện thông báo nổi (toast.js): góc dưới bên phải, lỗi đỏ, cảnh báo cam, thành công xanh.
import Icon from '@/components/ui/Icon.vue';
import { dismiss, toasts } from './toast';

const ICON = { error: 'alert', warn: 'alert', ok: 'check' };
</script>

<template>
  <div class="toasts" aria-live="polite">
    <div v-for="t in toasts" :key="t.id" class="toast" :class="t.kind" :role="t.kind === 'error' ? 'alert' : 'status'">
      <Icon :name="ICON[t.kind]" :size="18" />
      <div class="tx">{{ t.text }}</div>
      <button type="button" class="x" aria-label="Đóng" @click="dismiss(t.id)">
        <Icon name="x" :size="16" />
      </button>
    </div>
  </div>
</template>

<style scoped>
.toasts {
  position: fixed;
  right: 16px;
  bottom: 16px;
  z-index: 200;
  display: grid;
  gap: 8px;
  width: min(420px, calc(100vw - 32px));
  pointer-events: none;
}
.toast {
  pointer-events: auto;
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 12px 14px;
  border-radius: 12px;
  font-size: 14px;
  line-height: 20px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.16);
  background: var(--draft-bg);
  color: var(--draft-ink);
}
.toast.error {
  background: var(--err-bg);
  color: var(--err-ink);
}
.toast.warn {
  background: var(--pend-bg);
  color: var(--pend-ink);
}
.toast.ok {
  background: var(--done-bg);
  color: var(--done-ink);
}
.toast svg {
  flex: none;
  margin-top: 1px;
}
.tx {
  flex: 1;
  min-width: 0;
  white-space: pre-line;
  overflow-wrap: anywhere;
}
.x {
  flex: none;
  border: 0;
  background: none;
  color: inherit;
  cursor: pointer;
  padding: 2px;
  opacity: 0.7;
}
</style>
