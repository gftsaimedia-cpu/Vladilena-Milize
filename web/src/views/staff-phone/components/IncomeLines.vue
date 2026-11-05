<script setup lang="ts">
// Thẻ danh sách các khoản (J6 mục 8.1, K1 cột 3): sáu dòng và dòng Thực nhận ở cuối. Tiêu đề "Các khoản" do màn chứa đặt.
//   <IncomeLines :lines="data.lines" :total="data.total" />
import type { IncomeView } from '@/mock/staff-phone';
import PhIcon from './PhIcon.vue';

defineProps<{ lines: IncomeView['lines']; total: string }>();
</script>

<template>
  <div class="card ls">
    <div v-for="l in lines" :key="l.label" class="ro">
      <span class="ti"><PhIcon :name="l.icon" /></span>
      <span class="t">{{ l.label }}</span>
      <span class="v" :class="{ zero: l.zero }">{{ l.value }}</span>
    </div>
    <div class="tot">
      <span>Thực nhận</span><span>{{ total }}</span>
    </div>
  </div>
</template>

<style scoped>
.ro .v.zero {
  color: #757575;
  font-weight: 500;
}
.tot {
  display: flex;
  justify-content: space-between;
  align-items: center;
  min-height: 56px;
  border-top: 1px solid var(--text);
  font-weight: 600;
  font-size: 16px;
}
</style>
