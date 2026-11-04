<script setup lang="ts">
// Chọn tháng (spec 3.6): nút tròn "Tháng trước", nhãn tháng ("Tháng 10/2026") + trạng thái, nút tròn "Tháng sau".
// Dữ liệu giả chỉ có tháng 10/2026 nên cả hai nút luôn tắt (R4).
//   <MonthSwitch label="Tháng 10/2026" state="Kỳ công đang mở" />
import PhIcon from './PhIcon.vue';

defineProps<{ label: string; state: string }>();
</script>

<template>
  <div class="sh mon">
    <button type="button" class="rb" aria-label="Tháng trước" disabled>
      <PhIcon name="left" :size="18" :stroke="2" />
    </button>
    <div class="mt">
      <div class="ml">{{ label }}</div>
      <div class="mut sm">{{ state }}</div>
    </div>
    <button type="button" class="rb" aria-label="Tháng sau" disabled>
      <PhIcon name="right" :size="18" :stroke="2" />
    </button>
  </div>
</template>

<style scoped>
/* .sh.mon: thắng .sh (gap 8px) của phone.css theo độ ưu tiên, không phụ thuộc thứ tự nạp CSS */
.sh.mon {
  gap: 12px;
}
.mt {
  flex: 1 1 auto;
  min-width: 0;
  text-align: center;
}
.ml {
  font-size: 16px;
  line-height: 22px;
  font-weight: 600;
}
</style>
