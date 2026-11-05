<script setup lang="ts">
// J6 · Thu nhập (spec 8.1): thẻ đen thực nhận dự kiến, thẻ KPI với bán nguyệt chấm, danh sách các khoản.
// Không có liên kết "Xem phiếu lương đầy đủ" (R6). Ba thẻ là component dùng chung với cột 3 trên máy tính.
// Chọn tháng: lùi tới tháng vào làm, tới tháng hiện tại (BE trả khoảng); tải lỗi thì hiện LoadError với nút Thử lại.
import { computed, ref } from 'vue';
import { useLoad } from '@/composables/useLoad';
import { getIncome } from '@/services/staff-phone';
import IncomeLines from './components/IncomeLines.vue';
import KpiCard from './components/KpiCard.vue';
import LoadError from './components/LoadError.vue';
import LoadingLine from './components/LoadingLine.vue';
import MonthSwitch from './components/MonthSwitch.vue';
import NetCard from './components/NetCard.vue';
import { focusAfterLoad } from './focusAfterLoad';

const month = ref<string | null>(null); // null = tháng hiện tại
const { data, loading, error, reload } = useLoad(() => getIncome(month.value), () => month.value);
const root = ref<HTMLElement | null>(null);
// Đổi sang một tháng bị lỗi thì cho quay về tháng tải được gần nhất (useLoad còn giữ dữ liệu cũ).
const backLabel = computed(() => (month.value && data.value && data.value.month !== month.value ? data.value.label : null));
function retry() {
  reload();
  focusAfterLoad(root, loading);
}
function goBack() {
  if (data.value) month.value = data.value.month;
  focusAfterLoad(root, loading);
}
</script>

<template>
  <div ref="root" class="ph">
    <LoadError v-if="error" :error="error" :back="backLabel" @retry="retry" @back="goBack" />
    <template v-else-if="data">
      <header class="head">
        <h1 data-load-focus>{{ data.title }}</h1>
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
    <LoadingLine v-else />
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
