<script setup lang="ts">
// Bảng lương (board G) trên dữ liệu giả: tiêu đề, dải các bước, bốn ô số, rồi thẻ bảng gồm hàng công cụ, bảng và chân thẻ.
// Lọc trạng thái, phòng ban và chữ tìm thuộc về màn, không ghi lên đường dẫn.
import { computed, ref } from 'vue';
import PeriodStrip from '@/components/shell/PeriodStrip.vue';
import { useLoad } from '@/composables/useLoad';
import type { PayrollLine, PayrollScreen, PayrollStatus } from '@/mock/payroll';
import { getPayroll } from '@/services/admin-payroll';
import { usePeriodStore } from '@/stores/period';
import { foldText, monthShort } from '@/utils/format';
import { monthNo } from '@/views/admin/requests/helpers';
import PayTable from './parts/PayTable.vue';
import PayTiles from './parts/PayTiles.vue';
import PayToolbar from './parts/PayToolbar.vue';

const period = usePeriodStore();
const { data: loaded } = useLoad(
  () => getPayroll(period.month),
  () => period.month
);
const data = computed(() => loaded.value as PayrollScreen | null);
const board = computed(() => (data.value && !data.value.empty ? data.value : null));

const filter = ref<'all' | PayrollStatus>('all');
const query = ref('');
const dept = ref('');

// Ba bộ lọc chạy cùng lúc; tìm so trên tên đã bỏ dấu.
const shown = computed<PayrollLine[]>(() => {
  const q = foldText(query.value);
  return (board.value?.lines ?? []).filter(
    l =>
      (filter.value === 'all' || l.status === filter.value) &&
      (!dept.value || l.dept === dept.value) &&
      (!q || foldText(l.name).includes(q))
  );
});
const missingKpi = computed(() => shown.value.some(l => l.kpiMissing.length));
</script>

<template>
  <div v-if="data">
    <div class="title">
      <div>
        <h1>Bảng lương</h1>
        <p v-if="board">
          Kỳ lương tháng {{ monthShort(board.month) }} · công {{ board.range }} · công chuẩn
          {{ board.lines[0].standard }} ngày · trả lương <b>{{ board.payday }}</b>
        </p>
      </div>
    </div>

    <PeriodStrip card />

    <section v-if="!board" class="card soon">
      <p>Bản mockup chỉ có bảng lương tháng 10/2026.</p>
    </section>
    <template v-else>
      <PayTiles :month="board.month" :growth="board.growth" :totals="board.totals" :counts="board.counts" />

      <section class="card board" :aria-label="`Phiếu lương tháng ${monthNo(board.month)}`">
        <PayToolbar v-model:filter="filter" v-model:query="query" v-model:dept="dept" :counts="board.counts" :depts="board.depts" />
        <PayTable :lines="shown" :month="monthNo(board.month)" />
        <div class="foot">
          <span>Kéo ngang để xem các khoản · bấm tên để mở phiếu lương</span>
          <span v-if="missingKpi" class="legend"><i aria-hidden="true" />Thiếu điểm KPI, cột thiếu tính 0 điểm</span>
          <span class="count">Hiển thị {{ shown.length }} trong {{ board.counts[filter] }} phiếu</span>
        </div>
      </section>
    </template>
  </div>
</template>

<style scoped>
.title {
  flex-wrap: wrap;
  justify-content: space-between;
}
.title p {
  margin-top: 8px;
}
.soon {
  padding: 24px;
  color: var(--muted);
}
.soon p {
  margin: 0;
}
.board {
  overflow: hidden;
}
.foot {
  flex-wrap: wrap;
  gap: 8px 16px;
  padding: 14px 20px 18px;
  font-size: 12px;
  line-height: 16px;
}
.legend {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.legend i {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--status-pending);
}
.count {
  margin-left: auto;
}
</style>
