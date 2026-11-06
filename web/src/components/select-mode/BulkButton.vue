<script setup lang="ts">
// Nút trắng mở một thao tác áp cho nhiều người ("Gán ca", "Tính lại lương"…); `count` là ô đếm cam (vd. số người cần nhắc).
import Icon from '@/components/ui/Icon.vue';

defineProps<{ icon: string; count?: number; disabled?: boolean; title?: string }>();
defineEmits<{ click: [] }>();
</script>

<template>
  <button type="button" class="smbb" :disabled="disabled" :title="title" @click="$emit('click')">
    <Icon :name="icon" :size="16" />
    <slot />
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
