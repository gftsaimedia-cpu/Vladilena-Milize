<script setup lang="ts">
// Khung xem trước bản in A4 trong hộp thoại: các trang thu nhỏ, cuộn trong khung xám (.well của thiết kế).
import A4Payslip from './A4Payslip.vue';

defineProps({ sheet: { type: Object as () => any, required: true } });
</script>

<template>
  <div class="well">
    <div class="scaled">
      <A4Payslip :sheet="sheet" />
    </div>
  </div>
</template>

<style scoped>
.well {
  margin-top: 14px;
  background: #ededed;
  border-radius: 14px;
  padding: 20px;
  display: flex;
  justify-content: center;
  max-height: 56vh;
  overflow-y: auto;
}
/* trang rộng 210mm thu về 500px (tỉ lệ 0,63); khung giữ đúng chỗ của hai trang đã thu */
.scaled {
  width: 500px;
  height: calc((296mm * 2 + 16px) * 0.63);
  flex: none;
}
.scaled :deep(.a4-doc) {
  width: 210mm;
  display: flex;
  flex-direction: column;
  gap: 16px;
  transform: scale(0.63);
  transform-origin: top left;
}
.scaled :deep(.pl-a4) {
  box-shadow: 0 6px 24px rgba(0, 0, 0, 0.14);
  border-radius: 2px;
}
</style>
