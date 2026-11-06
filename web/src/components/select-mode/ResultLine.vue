<script setup lang="ts">
// Dòng báo kết quả sau khi chạy một thao tác nhiều người, nằm ngay trên bảng; chữ rỗng thì không hiện.
import Icon from '@/components/ui/Icon.vue';

defineProps<{ text: string }>();
</script>

<template>
  <div v-if="text" class="rsl-wrap">
    <div class="rsl" role="status" tabindex="-1">
      <Icon name="check" :size="16" :stroke="2" />
      <span>{{ text }}</span>
    </div>
  </div>
</template>

<style scoped>
.rsl-wrap {
  padding: 0 20px 16px;
}
.rsl {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 10px 14px;
  border-radius: var(--r-ctl);
  background: var(--surface-dark);
  color: var(--on-primary);
  font-size: 14px;
  line-height: 20px;
}
.rsl .i {
  flex: none;
  margin-top: 2px;
}
@media (max-width: 767px) {
  .rsl-wrap {
    padding-inline: 16px;
  }
}
</style>
