<script setup lang="ts">
// Bảng lương (board G) trên dữ liệu giả: tiêu đề, dải các bước, bốn ô số, rồi thẻ bảng gồm hàng công cụ, bảng và chân thẻ.
// Lọc trạng thái phiếu, cặp bộ lọc nhân sự và chữ tìm thuộc về màn, không ghi lên đường dẫn.
import { computed, nextTick, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import ResultLine from '@/components/select-mode/ResultLine.vue';
import SelectBar from '@/components/select-mode/SelectBar.vue';
import { useSelectMode } from '@/components/select-mode/useSelectMode';
import { deptOptions, matchScope, useMineDepts, type StaffPst } from '@/components/staff-scope/staffScope';
import PeriodActions from '@/components/shell/PeriodActions.vue';
import PeriodStrip from '@/components/shell/PeriodStrip.vue';
import AppModal from '@/components/ui/AppModal.vue';
import Icon from '@/components/ui/Icon.vue';
import { useLoad } from '@/composables/useLoad';
import PageLoadError from '@/components/shell/PageLoadError.vue';
import type { KpiPart } from '@/mock/payroll-calc';
import type { PayrollLine, PayrollScreen, PayrollStatus, Payslip } from '@/mock/payroll';
import { personStatusOf } from '@/mock/people-status';
import { toast } from '@/components/shell/toast';
import { calculatePayroll, decidePayslip, getPayroll, getPayslip, saveKpiScore } from '@/services/admin-payroll';
import { usePeriodStore } from '@/stores/period';
import { foldText, monthNo, monthShort } from '@/utils/format';
import { downloadCsv, payrollCsv } from './payrollCsv';
import PayTable from './parts/PayTable.vue';
import PayTiles from './parts/PayTiles.vue';
import PayToolbar from './parts/PayToolbar.vue';
import PayslipDrawer from './payslip/PayslipDrawer.vue';

const period = usePeriodStore();
const route = useRoute();
const { data: loaded, error: loadError, reload } = useLoad(
  () => getPayroll(period.month),
  () => period.month
);
const data = computed(() => loaded.value as PayrollScreen | null);
const board = computed(() => (data.value && !data.value.empty ? data.value : null));

// Tính lương cả kỳ khi tháng chưa có phiếu (bản mockup trả ngay); người tính lỗi (thiếu cấu hình bậc…) báo thành một thông báo.
// Đã có bảng thì tiêu đề có "Tính lại cả kỳ": chỉ lần chạy cả kỳ (không kèm employeeIds) mới đưa kỳ từ Đã chốt công sang
// Đã tính và tạo phiếu cho người mới vào kỳ. Lần chạy mới thay mọi phiếu nên phiếu đã duyệt về nháp: hỏi trước khi chạy.
// Tính lại riêng vài phiếu đi qua chế độ chọn "Tính lại lương" ở thẻ bảng (board G2).
// Kỳ đã phê duyệt hoặc đã trả thì không tính lại được (BE trả PAYROLL_FINALIZED), nên ẩn cả ba nút.
const canCalculate = computed(() => !['approved', 'paid'].includes(period.view?.status ?? ''));
const calculating = ref(false);
const askFull = ref(false);
async function recalcAll() {
  await calculate();
  askFull.value = false;
}
async function calculate() {
  if (calculating.value) return;
  calculating.value = true;
  try {
    const res = await calculatePayroll(period.month);
    const errors = (res && res.errors) || [];
    if (errors.length) toast.error(`Đã tính ${res.count} phiếu, ${errors.length} người lỗi: ${errors.map(e => e.message || e.employeeId).join('; ')}`);
    else toast.ok(`Đã tính ${res.count} phiếu lương.`);
    await reload();
    period.refresh();
  } catch (e) {
    toast.error(e.message);
  } finally {
    calculating.value = false;
  }
}

// In tất cả: trang A4 của các phiếu đã duyệt, mở ở tab mới và tự bật hộp in (?in=1). Chưa có phiếu đã duyệt thì khoá nút.
// Tháng và số phiếu lấy theo bảng đang hiện (như xuất CSV): lúc đổi tháng, bảng cũ còn hiện tới khi tháng mới tải xong.
const router = useRouter();
const approved = computed(() => board.value?.counts.done ?? 0);
const printAll = () =>
  window.open(
    router.resolve({ path: `/in/phieu-luong/${encodeURIComponent(board.value!.month)}`, query: { in: '1' } }).href,
    '_blank'
  );

const filter = ref<'all' | PayrollStatus>('all');
const query = ref('');
const pst = ref<StaffPst>('all');
const dept = ref('');
const mine = useMineDepts();
// Phòng ban lấy theo các phiếu đang có (R6).
const depts = computed(() => deptOptions(board.value?.lines ?? []));

// Các bộ lọc chạy cùng lúc; tìm so trên tên đã bỏ dấu. Trạng thái nhân sự: mock tra theo họ tên; máy chủ thật chưa trả nên coi
// là đang làm chính thức (R7).
const shown = computed<PayrollLine[]>(() => {
  const q = foldText(query.value);
  const scope = { pst: pst.value, dept: dept.value };
  return (board.value?.lines ?? []).filter(
    l =>
      (filter.value === 'all' || l.status === filter.value) &&
      matchScope({ dept: l.dept, ps: l.ps ?? (__MOCK__ ? personStatusOf(l.name) : undefined) }, scope, mine) &&
      (!q || foldText(l.name).includes(q))
  );
});
// Xuất các dòng đang lọc (06/11: không còn ô chọn để xuất).
const exportCsv = () => downloadCsv(`bang-luong-${board.value!.month}.csv`, payrollCsv(shown.value));

// Chế độ "Tính lại lương" (board G2): cột ô chọn chỉ hiện khi đang chọn; phiếu đã duyệt khoá. Số đếm và danh sách gửi đi chỉ
// tính các phiếu đang lọc (mọi trang); đổi bộ lọc trong lúc chọn vẫn được.
const sel = useSelectMode<'recalc'>();
const result = ref('');
const pickable = computed(() => shown.value.filter(l => l.status !== 'done').map(l => l.id));
const chosen = computed(() => sel.pickedIn(pickable.value));
function startRecalc() {
  sel.enter('recalc');
  result.value = '';
}
const goLabel = computed(() => (chosen.value.length ? `Tính lại ${chosen.value.length} phiếu` : 'Chọn ít nhất 1 phiếu'));
async function recalc() {
  if (!chosen.value.length || calculating.value) return;
  calculating.value = true;
  try {
    const ids = chosen.value;
    const res = await calculatePayroll(period.month, ids);
    const errors = (res && res.errors) || [];
    const n = res.count ?? res.calculated ?? ids.length;
    result.value = errors.length
      ? `Đã tính lại ${n} phiếu lương, ${errors.length} người lỗi: ${errors.map(e => e.message || e.employeeId).join('; ')}`
      : `Đã tính lại ${n} phiếu lương.`;
    sel.quit();
    await reload();
    period.refresh();
  } catch (e) {
    toast.error((e as Error).message);
  } finally {
    calculating.value = false;
  }
}
// Kỳ vừa phê duyệt trong lúc đang chọn thì thoát chế độ.
watch(canCalculate, ok => {
  if (!ok) sel.quit();
});
const missingKpi = computed(() => shown.value.some(l => l.kpiMissing.length));

// Phân trang phía máy khách: PAGE_SIZE phiếu một trang, trên kết quả đã lọc/tìm/sắp xếp. Đổi bộ lọc, chữ tìm hay tháng thì về trang 1.
// ?dong=N đổi số phiếu một trang (để thử và demo; mockup chỉ có 10 phiếu).
const PAGE_SIZE = computed(() => {
  const n = Number(route.query.dong);
  return Number.isInteger(n) && n >= 1 && n <= 100 ? n : 10;
});
const page = ref(1);
const pages = computed(() => Math.max(1, Math.ceil(shown.value.length / PAGE_SIZE.value)));
const pageLines = computed(() => shown.value.slice((page.value - 1) * PAGE_SIZE.value, page.value * PAGE_SIZE.value));
watch([filter, query, pst, dept, () => period.month, PAGE_SIZE], () => (page.value = 1));
// Đổi tháng thì bỏ chế độ chọn và dòng kết quả của tháng cũ.
watch(
  () => period.month,
  () => {
    sel.quit();
    result.value = '';
  }
);
watch(pages, n => {
  if (page.value > n) page.value = n;
});
const range = computed(() =>
  shown.value.length ? `${(page.value - 1) * PAGE_SIZE.value + 1}–${(page.value - 1) * PAGE_SIZE.value + pageLines.value.length}` : '0'
);

// Phiếu đang mở nằm trên đường dẫn (?phieu=<mã nhân viên>). Mã không có phiếu thì bỏ khỏi đường dẫn, không báo lỗi.
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
// Đóng ngăn kéo thì tiêu điểm về chỗ đã mở, nhưng chỗ đó có thể không còn: dòng vừa duyệt đã rời bộ lọc, hay đã bước sang
// phiếu khác bằng mũi tên. Khi tiêu điểm rơi về body (hay về liên kết của phiếu đã mở lúc đầu), đưa nó tới liên kết tên của phiếu
// vừa xem nếu dòng còn hiện; không thì dòng hiện kế tiếp theo thứ tự lúc mở, rồi dòng hiện trước nó, rồi vùng bảng.
// Tiêu điểm đã ở chỗ khác thì giữ nguyên.
const payTable = ref<InstanceType<typeof PayTable> | null>(null);
async function closeSlip() {
  const id = slipId.value;
  const order = [...navIds.value];
  await go('');
  await nextTick();
  const now = document.activeElement;
  if (now && now !== document.body && !now.classList.contains('nn')) return;
  const live = new Set(shown.value.map(l => l.id));
  const at = order.indexOf(id);
  const target = live.has(id)
    ? id
    : at < 0
      ? undefined
      : (order.slice(at + 1).find(x => live.has(x)) ?? order.slice(0, at).reverse().find(x => live.has(x)));
  if (!target || !payTable.value?.focusLink(target)) payTable.value?.focusRegion();
}
// Lưu một điểm KPI do màn giữ, không do ngăn kéo: ngăn kéo có thể đã đóng hay sang phiếu khác khi lời gọi trả về.
// Lưu xong thì thay phiếu đang mở bằng phiếu mới nếu đang mở đúng phiếu đó (đã đóng thì không mở lại), rồi tải lại bảng.
const saveScore = async (id: string, part: KpiPart, value: number | null) => {
  const next = await saveKpiScore(period.month, id, part, value);
  if (next && next.id === slipId.value) slip.value = next;
  await reload();
};
// Duyệt / từ chối cũng do màn giữ, vì cùng lý do: ngăn kéo có thể đã đóng hay sang phiếu khác khi lời gọi trả về.
// note: lý do từ chối (không bắt buộc), chỉ có khi từ chối.
const decide = async (id: string, decision: 'approve' | 'reject', note?: string) => {
  const next = await decidePayslip(period.month, id, decision, note);
  if (next && next.id === slipId.value) slip.value = next;
  await reload();
  period.refresh(); // số phiếu chưa duyệt đổi thì nút Phê duyệt kỳ mở / khoá theo
};
</script>

<template>
  <PageLoadError v-if="loadError && !data" what="bảng lương" :error="loadError" @retry="reload" />
  <div v-if="data">
    <div class="title">
      <div>
        <h1>Bảng lương</h1>
        <p v-if="board">
          Kỳ lương tháng {{ monthShort(board.month) }} · công {{ board.range }} · công chuẩn
          {{ board.lines[0].standard }} ngày · trả lương <b>{{ board.payday }}</b>
        </p>
      </div>
      <div class="acts">
        <button
          v-if="board"
          type="button"
          class="btn pl-print"
          :disabled="approved === 0"
          :title="approved ? `In ${approved} phiếu đã duyệt` : 'Chưa có phiếu đã duyệt'"
          @click="printAll"
        >
          <Icon name="print" />In tất cả
        </button>
        <button v-if="canCalculate && !board" type="button" class="btn" :disabled="calculating" @click="calculate">
          <Icon name="clock" />{{ calculating ? 'Đang tính…' : 'Tính lương' }}
        </button>
        <button v-if="canCalculate && board" type="button" class="btn" :disabled="calculating" @click="askFull = true">
          <Icon name="refresh" />Tính lại cả kỳ
        </button>
        <PeriodActions only="approve" />
      </div>
    </div>

    <PeriodStrip card />

    <section v-if="!board" class="card soon">
      <p v-if="canCalculate">Chưa có phiếu lương của tháng {{ monthShort(data.month) }}. Bấm "Tính lương" để tính.</p>
      <p v-else>Bản mockup chỉ có bảng lương tháng 10/2026.</p>
    </section>
    <template v-else>
      <PayTiles :month="board.month" :growth="board.growth" :totals="board.totals" :counts="board.counts" />

      <section class="card board" :aria-label="`Phiếu lương tháng ${monthNo(board.month)}`">
        <PayToolbar
          v-model:filter="filter"
          v-model:query="query"
          v-model:pst="pst"
          v-model:dept="dept"
          :counts="board.counts"
          :depts="depts"
          :recalc="canCalculate && !sel.mode.value"
          :none="!pickable.length"
          @export="exportCsv"
          @recalc="startRecalc"
        />
        <SelectBar
          v-if="sel.mode.value"
          title="Tính lại lương"
          :count="chosen.length"
          :total="pickable.length"
          unit="phiếu"
          note="Phiếu đã duyệt không tính lại được"
          :go-label="calculating ? 'Đang tính…' : goLabel"
          :go-disabled="!chosen.length || calculating"
          :running="calculating"
          @quit="sel.quit()"
          @run="recalc"
        />
        <ResultLine v-else :text="result" />
        <PayTable
          ref="payTable"
          :lines="pageLines"
          :totals="board.totals"
          :month="monthNo(board.month)"
          :open-id="slipId"
          :selecting="!!sel.mode.value"
          :picked="sel.picked.value"
          :all-state="sel.stateOf(pickable)"
          @toggle="sel.toggle"
          @toggle-all="sel.toggleAll(pickable)"
        />
        <div class="foot">
          <span class="hint"><Icon name="drag" :size="14" />Kéo ngang để xem các khoản · bấm tên để mở phiếu lương</span>
          <span v-if="missingKpi" class="pl-legend"><i aria-hidden="true" />Thiếu điểm KPI, cột thiếu tính 0 điểm</span>
          <span class="count">Hiển thị {{ range }} trong {{ board.counts[filter] }} phiếu</span>
          <span class="pl-pager">
            <button type="button" class="pl-pg" aria-label="Trang trước" :disabled="page <= 1" @click="page--">
              <Icon name="chevl" :size="16" />
            </button>
            <button type="button" class="pl-pg" aria-label="Trang sau" :disabled="page >= pages" @click="page++">
              <Icon name="chevr" :size="16" />
            </button>
          </span>
        </div>
      </section>
    </template>

    <AppModal
      v-if="askFull && board"
      :title="`Tính lại cả kỳ lương tháng ${monthShort(board.month)}`"
      sub="Mọi nhân viên được tính lại theo công và cài đặt hiện tại, kể cả người mới vào kỳ."
      :width="520"
      :top="200"
      @close="askFull = false"
    >
      <p v-if="approved" class="full-warn">{{ approved }} phiếu đã duyệt sẽ về nháp và phải duyệt lại.</p>
      <p v-else class="full-warn">Chưa có phiếu nào được duyệt.</p>
      <template #footer>
        <span class="sp"></span>
        <button type="button" class="btn" @click="askFull = false">Huỷ</button>
        <button type="button" class="btn pri" :disabled="calculating" @click="recalcAll">
          {{ calculating ? 'Đang tính…' : 'Tính lại cả kỳ' }}
        </button>
      </template>
    </AppModal>

    <PayslipDrawer
      v-if="slip && board"
      :slip="slip"
      :month="board.month"
      :has-prev="hasPrev"
      :has-next="hasNext"
      @close="closeSlip"
      :save="saveScore"
      :decide="decide"
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
.title .acts {
  gap: 8px;
}
.full-warn {
  margin: 0;
}
.pl-print:focus-visible {
  outline: 2px solid var(--text);
  outline-offset: 2px;
}
/* Chưa có phiếu đã duyệt: nền trang, viền nhạt, chữ xám (theo board Bảng lương). */
.pl-print:disabled {
  background: var(--ground);
  border-color: var(--border);
  color: #757575;
  cursor: not-allowed;
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
.pl-legend {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.pl-legend i {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--status-pending);
}
.hint {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.count {
  margin-left: auto;
}
.pl-pager {
  display: inline-flex;
  gap: 4px;
}
.pl-pg {
  width: 32px;
  height: 32px;
  display: grid;
  place-items: center;
  border: 1px solid var(--control);
  border-radius: var(--r-ctl);
  background: var(--surface);
  color: var(--text);
  cursor: pointer;
}
.pl-pg:disabled {
  color: #9e9e9e;
  cursor: default;
}
.pl-pg:focus-visible {
  outline: 2px solid var(--text);
  outline-offset: 2px;
}
</style>
