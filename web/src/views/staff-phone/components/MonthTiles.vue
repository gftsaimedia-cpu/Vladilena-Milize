<script setup lang="ts">
// Ba ô số của tháng (J2 mục 3, K1 cột 2): ngày công trên công chuẩn, lần đi muộn, ngày nghỉ có lương.
//   <MonthTiles :tiles="data.tiles" />
import type { AttendanceView } from '@/mock/staff-phone';

defineProps<{ tiles: AttendanceView['tiles'] }>();
</script>

<template>
  <div class="at-tiles" role="group" aria-label="Chỉ số tháng 10">
    <div v-for="t in tiles" :key="t.label" class="at-tile">
      <b>{{ t.value }}<small v-if="t.of"> / {{ t.of }}</small></b>
      <span class="mut sm">{{ t.label }}</span>
    </div>
  </div>
</template>

<style scoped>
/* Ba ô số: lưới 3 cột cách 8px, ô trắng bo 16px */
.at-tiles {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}
.at-tile {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 14px 14px 12px;
  border-radius: 16px;
  background: var(--surface);
}
.at-tile b {
  font-size: 24px;
  line-height: 30px;
  font-weight: 600;
}
.at-tile b small {
  font-size: 16px;
  color: var(--muted);
  font-weight: 500;
}
</style>
