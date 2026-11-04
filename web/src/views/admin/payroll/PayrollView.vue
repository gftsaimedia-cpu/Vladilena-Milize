<script setup lang="ts">
// Bảng lương (board G) trên dữ liệu giả: tiêu đề, dải các bước, bốn ô số, rồi thẻ bảng gồm hàng công cụ, bảng và chân thẻ.
// Lọc trạng thái, phòng ban và chữ tìm thuộc về màn, không ghi lên đường dẫn.
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import PeriodStrip from '@/components/shell/PeriodStrip.vue';
import { useLoad } from '@/composables/useLoad';
import type { KpiPart } from '@/mock/payroll-calc';
import type { PayrollLine, PayrollScreen, PayrollStatus, Payslip } from '@/mock/payroll';
import { getPayroll, getPayslip, saveKpiScore } from '@/services/admin-payroll';
import { usePeriodStore } from '@/stores/period';
import { foldText, monthShort } from '@/utils/format';
import { monthNo } from '@/views/admin/requests/helpers';
import { downloadCsv, payrollCsv } from './payrollCsv';
import PayTable from './parts/PayTable.vue';
import PayTiles from './parts/PayTiles.vue';
import PayToolbar from './parts/PayToolbar.vue';
import PayslipDrawer from './payslip/PayslipDrawer.vue';

const period = usePeriodStore();
const { data: loaded, reload } = useLoad(
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
// Ô chọn chỉ để xuất. Dòng đã chọn mà đang bị lọc ẩn không tính và không xuất, nên số trên nút khớp với file.
const selected = ref<string[]>([]);
const picked = computed(() => shown.value.filter(l => selected.value.includes(l.id)));
const exportCsv = () =>
  downloadCsv(`bang-luong-${board.value!.month}.csv`, payrollCsv(picked.value.length ? picked.value : shown.value));
const missingKpi = computed(() => shown.value.some(l => l.kpiMissing.length));

// Phiếu đang mở nằm trên đường dẫn (?phieu=<mã nhân viên>). Mã không có phiếu thì bỏ khỏi đường dẫn, không báo lỗi.
const route = useRoute();
const router = useRouter();
const slipId = computed(() => (typeof route.query.phieu === 'string' ? route.query.phieu : ''));
const withSlip = (id: string) => {
  const rest = Object.fromEntries(Object.entries(route.query).filter(([key]) => key !== 'phieu'));
  return { path: route.path, query: id ? { ...rest, phieu: id } : rest };
};
const slip = ref<Payslip | null>(null);
watch(
  [() => period.month, slipId],
  async ([month, id]) => {
    if (!id) {
      slip.value = null;
      return;
    }
    const found = await getPayslip(month, id);
    // Đường dẫn đã sang phiếu khác trong lúc chờ: bỏ kết quả cũ. Phiếu cũ vẫn hiện tới khi phiếu mới về, nên ngăn kéo không chớp.
    if (id !== slipId.value || month !== period.month) return;
    if (found) slip.value = found;
    else {
      slip.value = null;
      router.replace(withSlip(''));
    }
  },
  { immediate: true }
);

// Nút Phiếu trước / sau đi trong các dòng đang hiện lúc mở phiếu, theo thứ tự bảng. Chốt một lần: đổi lọc hay đổi trạng
// thái phiếu sau đó không đổi danh sách này.
const navIds = ref<string[]>([]);
watch(
  [slipId, board],
  () => {
    if (!slipId.value) navIds.value = [];
    else if (board.value && !navIds.value.includes(slipId.value)) navIds.value = shown.value.map(l => l.id);
  },
  { immediate: true }
);
const at = computed(() => navIds.value.indexOf(slipId.value));
const hasPrev = computed(() => at.value > 0);
const hasNext = computed(() => at.value >= 0 && at.value < navIds.value.length - 1);
const go = (id: string) => router.replace(withSlip(id));
// Lưu một điểm KPI do màn giữ, không do ngăn kéo: ngăn kéo có thể đã đóng hay sang phiếu khác khi lời gọi trả về.
// Lưu xong thì thay phiếu đang mở bằng phiếu mới nếu đang mở đúng phiếu đó (đã đóng thì không mở lại), rồi tải lại bảng.
const saveScore = async (id: string, part: KpiPart, value: number | null) => {
  const next = await saveKpiScore(period.month, id, part, value);
  if (next && next.id === slipId.value) slip.value = next;
  await reload();
};
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
        <PayToolbar
          v-model:filter="filter"
          v-model:query="query"
          v-model:dept="dept"
          :counts="board.counts"
          :depts="board.depts"
          :selected-count="picked.length"
          @export="exportCsv"
        />
        <PayTable v-model:selected="selected" :lines="shown" :month="monthNo(board.month)" :open-id="slipId" />
        <div class="foot">
          <span>Kéo ngang để xem các khoản · bấm tên để mở phiếu lương</span>
          <span v-if="missingKpi" class="legend"><i aria-hidden="true" />Thiếu điểm KPI, cột thiếu tính 0 điểm</span>
          <span class="count">Hiển thị {{ shown.length }} trong {{ board.counts[filter] }} phiếu</span>
        </div>
      </section>
    </template>

    <PayslipDrawer
      v-if="slip && board"
      :slip="slip"
      :month="board.month"
      :has-prev="hasPrev"
      :has-next="hasNext"
      @close="go('')"
      :save="saveScore"
      @prev="go(navIds[at - 1])"
      @next="go(navIds[at + 1])"
    />
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
