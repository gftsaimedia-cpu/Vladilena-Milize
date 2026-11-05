<script setup lang="ts">
// J6 · Thu nhập (spec 8.1): thẻ đen thực nhận dự kiến, thẻ KPI với bán nguyệt chấm, danh sách các khoản.
// Không có liên kết "Xem phiếu lương đầy đủ" (R6). Ba thẻ là component dùng chung với cột 3 trên máy tính.
// Chọn tháng: lùi tới tháng vào làm, tới tháng hiện tại (BE trả khoảng); tải lỗi thì hiện LoadError với nút Thử lại, lỗi lúc
// đổi tháng thì thêm nút "Quay về tháng …" (tháng tải được gần nhất). Tải xong thì focus về h1, vẫn lỗi thì về nút
// Thử lại mới. Chưa có dữ liệu thì hiện "Đang tải…"; đổi tháng thì giữ nội dung tháng cũ tới khi tháng mới về.
import { computed, ref } from 'vue';
import { useLoad } from '@/composables/useLoad';
import { backTo, useRetry } from '@/composables/useRetry';
import { getIncome } from '@/services/staff-phone';
import IncomeLines from './components/IncomeLines.vue';
import KpiCard from './components/KpiCard.vue';
import LoadError from './components/LoadError.vue';
import LoadingLine from './components/LoadingLine.vue';
import MonthSwitch from './components/MonthSwitch.vue';
import NetCard from './components/NetCard.vue';

const month = ref<string | null>(null); // null = tháng hiện tại
const load = useLoad(() => getIncome(month.value), () => month.value);
const { data, error, loading } = load;
const head = ref<HTMLElement | null>(null);
const { errBox, retry, after } = useRetry(load, head);
const back = computed(() => backTo(data.value, month.value));
const goBack = () => after(() => (month.value = back.value!.month));
</script>

<template>
  <div class="ph">
    <LoadError v-if="error" ref="errBox" :error="error" :back="back?.text" @retry="retry" @back="goBack" />
    <template v-else-if="data">
      <header class="head">
        <h1 ref="head" tabindex="-1">{{ data.title }}</h1>
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
    <LoadingLine v-else-if="loading" />
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
