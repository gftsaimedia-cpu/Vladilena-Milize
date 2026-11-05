<script setup lang="ts">
// Cột 3 · Thu nhập (spec 4.3): đầu cột, thẻ đen thực nhận, thẻ KPI (tiêu đề h3), khối "Các khoản" giãn kín đáy.
// Không có MonthSwitch và không có dòng ghi chú "Phiếu chính thức có khi Admin duyệt".
import { computed, ref } from 'vue';
import type { IncomeView } from '@/mock/staff-phone';
import { getIncome } from '@/services/staff-phone';
import IncomeLines from '@/views/staff-phone/components/IncomeLines.vue';
import KpiCard from '@/views/staff-phone/components/KpiCard.vue';
import NetCard from '@/views/staff-phone/components/NetCard.vue';

const data = ref<IncomeView | null>(null);
getIncome().then(v => (data.value = v));

// "Tháng 10/2026 · tạm tính": nhãn tháng và trạng thái viết thường chữ đầu.
const sub = computed(() => (data.value ? `${data.value.label} · ${data.value.state.charAt(0).toLowerCase()}${data.value.state.slice(1)}` : ''));
</script>

<template>
  <section class="sd-col">
    <template v-if="data">
      <header class="sd-head">
        <h2 class="sd-title">{{ data.title }}</h2>
        <span class="mut">{{ sub }}</span>
      </header>
      <NetCard :income="data" />
      <KpiCard :kpi="data.kpi" level="h3" />
      <section class="sd-grow">
        <h3>Các khoản</h3>
        <IncomeLines :lines="data.lines" :total="data.total" />
      </section>
    </template>
  </section>
</template>
