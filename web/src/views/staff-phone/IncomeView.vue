<script setup lang="ts">
// J6 · Thu nhập (spec 8.1): thẻ đen thực nhận dự kiến, thẻ KPI với bán nguyệt chấm, danh sách các khoản.
// Dữ liệu giả (getIncome); không có liên kết "Xem phiếu lương đầy đủ" (R6). Ba thẻ là component dùng chung với cột 3 trên máy tính.
import { ref } from 'vue';
import type { IncomeView } from '@/mock/staff-phone';
import { getIncome } from '@/services/staff-phone';
import IncomeLines from './components/IncomeLines.vue';
import KpiCard from './components/KpiCard.vue';
import MonthSwitch from './components/MonthSwitch.vue';
import NetCard from './components/NetCard.vue';

const data = ref<IncomeView | null>(null);
getIncome().then(v => (data.value = v));
</script>

<template>
  <div class="ph">
    <template v-if="data">
      <header class="head">
        <h1>{{ data.title }}</h1>
        <span class="mut">{{ data.note }}</span>
      </header>
      <MonthSwitch :label="data.label" :state="data.state" />
      <NetCard :income="data" />
      <KpiCard :kpi="data.kpi" />
      <section class="lines">
        <h2>Các khoản</h2>
        <IncomeLines :lines="data.lines" :total="data.total" />
      </section>
    </template>
  </div>
</template>

<style scoped>
.head {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
/* Các khoản */
.lines {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.lines h2 {
  padding: 0 4px;
}
</style>
