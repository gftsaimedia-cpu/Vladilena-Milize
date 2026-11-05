<script setup lang="ts">
// Dòng báo tải lỗi trong một thẻ Cài đặt: "Không tải được <what>. Thử lại". Bấm Thử lại thì thẻ tự tải lại (emit retry).
defineProps({ what: { type: String, required: true } });
const emit = defineEmits(['retry']);
</script>

<template>
  <p class="load-fail" role="alert">
    Không tải được {{ what }}.
    <button type="button" class="link" @click="emit('retry')">Thử lại</button>
  </p>
</template>

<style scoped>
.load-fail {
  margin: 0;
  padding: 16px 24px 20px;
  font-size: 13px;
  color: var(--muted);
}
.load-fail .link {
  border: 0;
  padding: 0;
  background: none;
  font: inherit;
  cursor: pointer;
}
</style>
