<script setup lang="ts">
// Nút trắng mở một thao tác áp cho nhiều người ("Gán ca", "Tính lại lương"…); `count` là ô đếm cam (vd. số người cần nhắc).
// Bấm nút thì nhớ chữ trên nút (opener.ts) để thanh chọn đóng lại trả tiêu điểm về đây.
import { ref } from 'vue';
import Icon from '@/components/ui/Icon.vue';
import { rememberOpener } from './opener';

defineProps<{ icon: string; count?: number; disabled?: boolean; title?: string }>();
const emit = defineEmits<{ click: [] }>();
const text = ref<HTMLElement | null>(null);
function press() {
  rememberOpener(text.value?.textContent ?? '');
  emit('click');
}
</script>

<template>
  <button type="button" class="smbb" :disabled="disabled" :title="title" @click="press">
    <Icon :name="icon" :size="16" />
    <span ref="text" class="smbl"><slot /></span>
    <span v-if="count !== undefined" class="smct">{{ count }}</span>
  </button>
</template>

<style scoped>
.smbb {
  height: 40px;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 0 14px;
  border-radius: var(--r-ctl);
  border: 1px solid var(--control);
  background: var(--surface);
  font: inherit;
  font-size: 14px;
  font-weight: 500;
  color: var(--text);
  white-space: nowrap;
  cursor: pointer;
}
.smbb:hover {
  border-color: var(--text);
}
.smbb:focus-visible {
  outline: 2px solid var(--text);
  outline-offset: 2px;
}
.smbb:disabled {
  background: var(--ground);
  border-color: var(--border);
  color: var(--muted);
  cursor: not-allowed;
}
.smct {
  min-width: 20px;
  height: 20px;
  padding: 0 6px;
  border-radius: 6px;
  display: grid;
  place-items: center;
  background: var(--status-pending);
  color: var(--text);
  font-size: 12px;
  line-height: 16px;
  font-weight: 600;
}
.smbb:disabled .smct {
  background: var(--status-draft);
}
</style>
