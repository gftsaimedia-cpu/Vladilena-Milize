<script setup lang="ts">
// Chọn tháng (spec 3.6): nút tròn "Tháng trước", nhãn tháng ("Tháng 10/2026") + trạng thái, nút tròn "Tháng sau".
// prev / next là tháng bấm tới được ('YYYY-MM'); null ở mép khoảng (BE quyết: từ tháng vào làm tới tháng hiện tại) thì nút tắt.
// Dữ liệu giả chỉ có một tháng nên hai nút luôn tắt (R4). Bấm nút phát go(tháng) để màn cha tải tháng đó.
//   <MonthSwitch label="Tháng 10/2026" state="Kỳ công đang mở" :prev="data.prev" :next="data.next" @go="m => (month = m)" />
import PhIcon from './PhIcon.vue';

withDefaults(defineProps<{ label: string; state: string; prev?: string | null; next?: string | null }>(), { prev: null, next: null });
defineEmits<{ go: [month: string] }>();
</script>

<template>
  <div class="sh mon">
    <button type="button" class="rb" aria-label="Tháng trước" :disabled="!prev" @click="prev && $emit('go', prev)">
      <PhIcon name="left" :size="18" :stroke="2" />
    </button>
    <div class="mt">
      <div class="ml">{{ label }}</div>
      <div class="mut sm">{{ state }}</div>
    </div>
    <button type="button" class="rb" aria-label="Tháng sau" :disabled="!next" @click="next && $emit('go', next)">
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
