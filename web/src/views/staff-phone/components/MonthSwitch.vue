<script setup lang="ts">
// Thanh chọn tháng (.mon của thiết kế): nút lùi, "Tháng 11/2026" + trạng thái, nút tới. Nút tắt khi không có tháng đó.
import Icon from '@/components/ui/Icon.vue';

defineProps({
  title: { type: String, required: true },
  state: { type: String, default: '' },
  official: { type: Boolean, default: false },
  hasPrev: { type: Boolean, default: false },
  hasNext: { type: Boolean, default: false }
});
defineEmits(['prev', 'next']);
</script>

<template>
  <div class="mon">
    <button type="button" class="mb" aria-label="Tháng trước" :disabled="!hasPrev" @click="$emit('prev')">
      <Icon name="chevl" :size="18" />
    </button>
    <div class="mt">
      <b>{{ title }}</b>
      <span :class="{ official }">{{ state }}</span>
    </div>
    <button type="button" class="mb" aria-label="Tháng sau" :disabled="!hasNext" @click="$emit('next')">
      <Icon name="chevr" :size="18" />
    </button>
  </div>
</template>

<style scoped>
.mb {
  padding: 0;
  font: inherit;
  cursor: pointer;
}
.mb:disabled {
  opacity: 0.4;
  cursor: default;
}
.ph-app .mon .mt span.official {
  color: var(--done-ink);
}
</style>
