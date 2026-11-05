<script setup lang="ts">
// Cột 3 · Thu nhập (spec 4.3): đầu cột, thẻ đen thực nhận, thẻ KPI (tiêu đề h3), khối "Các khoản" giãn kín đáy.
// Không có MonthSwitch (luôn tháng hiện tại) và không có dòng ghi chú "Phiếu chính thức có khi Admin duyệt".
// Tải lỗi thì hiện LoadError với nút Thử lại (tải xong thì focus về h2, vẫn lỗi thì về nút Thử lại mới); chưa có dữ liệu thì
// hiện "Đang tải…".
import { computed, ref } from 'vue';
import { useLoad } from '@/composables/useLoad';
import { useRetry } from '@/composables/useRetry';
import { getIncome } from '@/services/staff-phone';
import IncomeLines from '@/views/staff-phone/components/IncomeLines.vue';
import KpiCard from '@/views/staff-phone/components/KpiCard.vue';
import LoadError from '@/views/staff-phone/components/LoadError.vue';
import LoadingLine from '@/views/staff-phone/components/LoadingLine.vue';
import NetCard from '@/views/staff-phone/components/NetCard.vue';

const load = useLoad(() => getIncome());
const { data, error, loading } = load;
const head = ref<HTMLElement | null>(null);
const { errBox, retry } = useRetry(load, head);

// "Tháng 10/2026 · tạm tính": nhãn tháng và trạng thái viết thường chữ đầu.
const sub = computed(() => (data.value ? `${data.value.label} · ${data.value.state.charAt(0).toLowerCase()}${data.value.state.slice(1)}` : ''));
</script>

<template>
  <section class="sd-col">
    <LoadError v-if="error" ref="errBox" :error="error" @retry="retry" />
    <template v-else-if="data">
      <header class="sd-head">
        <h2 ref="head" class="sd-title" tabindex="-1">{{ data.title }}</h2>
        <span class="mut">{{ sub }}</span>
      </header>
      <NetCard :income="data" />
      <KpiCard :kpi="data.kpi" level="h3" />
      <section class="sd-grow">
        <h3>Các khoản</h3>
        <IncomeLines :lines="data.lines" :total="data.total" />
      </section>
    </template>
    <LoadingLine v-else-if="loading" />
  </section>
</template>
