<script setup lang="ts">
// J6 · Thu nhập (spec 8.1): thẻ đen thực nhận dự kiến, thẻ KPI với bán nguyệt chấm, danh sách các khoản.
// Không có liên kết "Xem phiếu lương đầy đủ" (R6). Ba thẻ là component dùng chung với cột 3 trên máy tính.
// Chọn tháng: lùi tới tháng vào làm, tới tháng hiện tại (BE trả khoảng); tải lỗi thì hiện LoadError với nút Thử lại.
import { ref } from 'vue';
import { useLoad } from '@/composables/useLoad';
import { getIncome } from '@/services/staff-phone';
import IncomeLines from './components/IncomeLines.vue';
import KpiCard from './components/KpiCard.vue';
import LoadError from './components/LoadError.vue';
import MonthSwitch from './components/MonthSwitch.vue';
import NetCard from './components/NetCard.vue';

const month = ref<string | null>(null); // null = tháng hiện tại
const { data, error, reload } = useLoad(() => getIncome(month.value), () => month.value);
</script>

<template>
  <div class="ph">
    <LoadError v-if="error" :error="error" @retry="reload" />
    <template v-else-if="data">
      <header class="head">
        <h1>{{ data.title }}</h1>
        <span class="mut">{{ data.note }}</span>
      </header>
      <MonthSwitch :label="data.label" :state="data.state" :prev="data.prev" :next="data.next" @go="m => (month = m)" />
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
