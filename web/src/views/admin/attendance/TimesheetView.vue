<script setup lang="ts">
// Tab Bảng công: dấu khai loại ngày và dấu lượt Check-in/out hiển thị riêng trong từng ô.
// Bấm vào ô → hộp chi tiết ngày (xem lượt Check-in/out, sửa giờ). ?hop=chi-tiet-ngay mở sẵn một ô.
import { computed, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useLoad } from '@/composables/useLoad';
import { getTimesheet } from '@/services/admin-attendance';
import { usePeriodStore } from '@/stores/period';
import { useSessionStore } from '@/stores/session';
import Icon from '@/components/ui/Icon.vue';
import BulkPunchDialog from './BulkPunchDialog.vue';
import { dowShort, initials } from '@/utils/format';
import DayDetailDialog from './DayDetailDialog.vue';
import TodayDialog from './TodayDialog.vue';
import PagerBar from './PagerBar.vue';
import SearchBox from './SearchBox.vue';
import { useHop } from './useHop';

const route = useRoute();
const period = usePeriodStore();
const month = computed(() => period.month);
const session = useSessionStore();
const canBulk = computed(() => session.caps.includes('request.decide.*'));
const bulkOpen = ref(false);
const todayOpen = ref(false);

const CHIPS = [
  ['all', 'Tất cả', 'all'],
  ['pending', 'Cần xử lý', null],
  ['tts', 'Thực tập sinh', 'tts'],
  ['ctv', 'Chuyên trách viên', 'ctv'],
  ['nv', 'Nhân viên', 'nv']
];
const SESSION_LABEL: Record<string, string> = {
  in: 'Có lượt Check-in',
  ok: 'Có lượt Check-out, được duyệt hoặc do Admin chấm',
  w: 'Lượt chờ xử lý',
  q: 'Lượt bị từ chối'
};

const filter = ref(
  ['all', 'pending', 'tts', 'ctv', 'nv'].includes(String(route.query.filter)) ? String(route.query.filter) : 'all'
);
const q = ref('');
const page = ref(1);
watch([month, filter, q], () => (page.value = 1));
watch(
  () => route.query.filter,
  val => {
    if (val && ['all', 'pending', 'tts', 'ctv', 'nv'].includes(String(val))) {
      filter.value = String(val);
    }
  }
);
const { data, reload } = useLoad(
  () => getTimesheet(month.value, { filter: filter.value, q: q.value, page: page.value }),
  () => [month.value, filter.value, q.value, page.value].join('|')
);

// Các cột ngày của tháng đang xem
const days = computed(() => {
  const d = data.value;
  const [y, m] = month.value.split('-').map(Number);
  const count = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return Array.from({ length: count }, (_, i) => {
    const date = `${month.value}-${String(i + 1).padStart(2, '0')}`;
    const sun = dowShort(date) === 'CN';
    const hol = !!d?.holidays?.includes(date);
    const today = date === d?.today;
    const fut = !!d?.today && date > d.today;
    return {
      date,
      n: i + 1,
      wd: hol ? 'Lễ' : dowShort(date),
      cls: [sun ? 'sun' : '', hol ? 'hol' : ''].filter(Boolean).join(' '),
      thCls: [sun ? 'sun' : '', hol ? 'hol' : '', today ? 'today' : '', fut ? 'fut' : ''].filter(Boolean).join(' '),
    };
  });
});
const rows = computed(() => data.value?.rows || []);
function cellAria(row: any, day: any) {
  const cell = row.cells[day.date];
  const details = [];
  if (cell?.declared) details.push(cell.declared.label);
  if (cell?.k) details.push(SESSION_LABEL[cell.k] || 'Có lượt chấm công');
  return `${row.name}, ngày ${day.n}${details.length ? `: ${details.join(' · ')}` : ': Chưa khai ngày hoặc chưa có lượt chấm công'}`;
}
function cellCls(cell?: any): string {
  if (cell?.k === 'w') return 'c-pending';
  if (cell?.k === 'q') return 'c-rejected';
  if (cell?.declared?.code === 'leave') return 'c-leave';
  if (cell?.declared?.code === 'extra') return 'c-extra';
  if (cell?.k === 'in') return 'c-in';
  if (cell?.k === 'ok') return 'c-ok';
  return '';
}
function hasDot(cell?: any): boolean {
  return Boolean(cell && (cell.k || cell.declared));
}
function dotCls(cell?: any): string {
  if (!cell) return '';
  if (cell.k === 'w') return 'w';
  if (cell.k === 'q') return 'q';
  if (cell.declared?.code === 'leave') return 'leave';
  if (cell.declared?.code === 'extra') return 'extra';
  if (cell.k === 'in') return 'in';
  if (cell.k === 'ok') return 'ok';
  return '';
}
function cellTooltip(cell?: any): string {
  if (!cell) return '';
  const parts: string[] = [];
  if (cell.declared?.label) parts.push(cell.declared.label);
  if (cell.k && SESSION_LABEL[cell.k]) parts.push(SESSION_LABEL[cell.k]);
  return parts.join(' · ');
}
const heading = computed(() => `Bảng công tháng ${Number(month.value.slice(5))}`);
const range = computed(() => {
  const last = days.value.length;
  const mm = month.value.slice(5);
  return `01/${mm} – ${String(last).padStart(2, '0')}/${mm}`;
});
const footText = computed(() => {
  const d = data.value;
  if (!d || !rows.value.length) return `0 trên ${d?.total || 0} nhân sự`;
  const from = (d.page - 1) * 20 + 1;
  return `${from}–${from + rows.value.length - 1} trên ${d.total} nhân sự · xếp theo tên`;
});

// Hộp chi tiết ngày
const picked = ref(null); // { id, date }
const { open: hopOpen, close: hopClose } = useHop('chi-tiet-ngay');
watch(
  hopOpen,
  o => {
    if (o)
      picked.value = { id: String(route.query.nv || 'u01'), date: String(route.query.ngay || `${month.value}-04`) };
  },
  { immediate: true }
);
function closeDialog() {
  picked.value = null;
  hopClose();
}
function onBulkSaved() {
  reload();
}
function onSaved() {
  closeDialog();
  reload();
}
</script>

<template>
  <section class="card">
    <div class="card-h">
      <div>
        <h2>{{ heading }}</h2>
        <span class="cap">{{ range }}</span>
      </div>
      <div class="color-note" aria-label="Chú thích màu trạng thái">
        <span class="c-item"><span class="c-dot d-ok" />Có mặt</span>
        <span class="c-item"><span class="c-dot d-leave" />Nghỉ</span>
        <span class="c-item"><span class="c-dot d-extra" />Làm thêm</span>
        <span class="c-item"><span class="c-dot d-pending" />Chờ duyệt</span>
        <span class="c-item"><span class="c-dot d-rejected" />Vắng</span>
      </div>
    </div>
    <div class="tools">
      <button
        v-for="[key, label, cnt] in CHIPS"
        :key="key"
        type="button"
        class="chip"
        :class="{ on: filter === key }"
        @click="filter = key"
      >
        {{ label }} <small v-if="cnt && data?.counts?.[cnt] != null">{{ data.counts[cnt] }}</small>
      </button>
      <SearchBox v-model="q" style="margin-left: auto" />
      <button type="button" class="btn" title="Xem chấm công hôm nay" @click="todayOpen = true">
        <Icon name="cal" />Hôm nay
      </button>
      <button v-if="canBulk" type="button" class="btn" @click="bulkOpen = true">
        <Icon name="clock" />Chấm công hàng loạt
      </button>
    </div>
    <table class="bc">
      <colgroup>
        <col style="width: 200px" />
        <col v-for="c in days" :key="c.date" style="width: 26px" />
        <col style="width: 55px" />
        <col style="width: 55px" />
      </colgroup>
      <thead>
        <tr>
          <th>Nhân sự</th>
          <th
            v-for="c in days"
            :key="c.date"
            :class="c.thCls"
            :style="c.thCls.includes('today') ? 'cursor: pointer' : undefined"
            :title="c.thCls.includes('today') ? 'Xem chấm công hôm nay' : undefined"
            @click="c.thCls.includes('today') ? (todayOpen = true) : undefined"
          >
            <span class="dn">{{ c.n }}</span
            ><span class="wd">{{ c.wd }}</span>
          </th>
          <th class="sum">Có mặt</th>
          <th class="sum">Chờ xử lý</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="r in rows" :key="r.id">
          <td>
            <div class="who">
              <span class="av">{{ initials(r.name) }}</span>
              <div>
                <div class="t">{{ r.name }}</div>
                <div class="s" :class="{ bad: r.noShift }" :title="r.shiftTooltip">{{ r.sub }}</div>
                <RouterLink
                  v-if="r.noShift"
                  class="link"
                  :to="{ path: '/admin/nhan-su', query: { thang: route.query.thang, loc: 'chua-co-ca' } }"
                  @click.stop
                  >Gán ca</RouterLink
                >
              </div>
            </div>
          </td>
          <td v-for="c in days" :key="c.date" :class="[c.cls, cellCls(r.cells[c.date])]">
            <button
              type="button"
              class="cell"
              :class="cellCls(r.cells[c.date])"
              :aria-label="cellAria(r, c)"
              @click="picked = { id: r.id, date: c.date }"
            >
              <span
                v-if="hasDot(r.cells[c.date])"
                class="m"
                :class="dotCls(r.cells[c.date])"
                :title="cellTooltip(r.cells[c.date])"
              />
            </button>
          </td>
          <td class="sum" :class="{ z: !r.present }">{{ r.present }}</td>
          <td class="sum" :class="r.pending ? 'p' : 'z'">{{ r.pending }}</td>
        </tr>
        <tr v-if="data && !rows.length">
          <td class="none" :colspan="days.length + 3">
            {{ data.empty ? 'Chưa có dữ liệu chấm công của tháng này' : 'Không có nhân sự nào phù hợp' }}
          </td>
        </tr>
      </tbody>
    </table>
    <PagerBar :text="footText" :page="data?.page || 1" :pages="data?.pages || 1" @page="page = $event" />
  </section>

  <BulkPunchDialog v-if="bulkOpen" :month="month" @close="bulkOpen = false" @saved="onBulkSaved" />
  <DayDetailDialog v-if="picked" :person-id="picked.id" :date="picked.date" @close="closeDialog" @saved="onSaved" />
  <TodayDialog v-if="todayOpen" @close="todayOpen = false" />
</template>

<style scoped>
.card-h {
  align-items: center;
}
.card-h > div:first-child {
  display: flex;
  align-items: baseline;
  gap: 12px;
}
.color-note {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-left: auto;
  font-size: 12px;
  color: var(--muted);
}
.c-item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-weight: 500;
  color: var(--text);
}
.c-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex: none;
}
.bc {
  table-layout: fixed;
  width: 100%;
}
.bc th,
.bc td {
  padding: 0;
  text-align: center;
}
.bc th:first-child,
.bc td:first-child {
  text-align: left;
  padding-left: 24px;
}
.bc td {
  height: 48px;
  border-top: 1px solid var(--rule);
}
.bc th {
  padding: 8px 0 10px;
  vertical-align: bottom;
  line-height: 14px;
}
.bc th .dn {
  display: block;
  font-size: 12px;
  font-weight: 600;
  color: var(--text);
}
.bc th .wd {
  display: block;
  font-size: 11px;
  color: var(--muted);
  margin-top: 2px;
}
.bc th.sun .dn,
.bc th.sun .wd,
.bc th.fut .dn,
.bc th.fut .wd {
  color: #a3a3a3;
  font-weight: 400;
}
.bc th.hol .wd {
  color: var(--accent);
  font-weight: 600;
}
.bc th.today {
  cursor: pointer;
}
.bc th.today .dn {
  display: inline-grid;
  place-items: center;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: var(--text);
  color: #fff;
}
.bc .sun {
  background: #f8f8f8;
}
.bc .hol {
  background: var(--gold-pale);
}
.bc th.sum,
.bc td.sum {
  text-align: right;
  padding-right: 16px;
}
.bc th.sum:last-child,
.bc td.sum:last-child {
  padding-right: 24px;
}
.bc td.sum {
  font-weight: 600;
  font-size: 14px;
}
.bc td.sum.z {
  color: #a3a3a3;
  font-weight: 400;
}
.bc td.sum.p {
  color: var(--pend-ink);
}
.bc .who .t {
  font-size: 13px;
}
.bc .who .s {
  font-size: 12px;
}
.bc .who .av {
  width: 28px;
  height: 28px;
  font-size: 11px;
}
.bc .who .s.bad {
  color: var(--err-ink);
}
.cell {
  display: grid;
  place-items: center;
  width: 100%;
  height: 47px;
  padding: 0;
  border: 0;
  background: none;
  cursor: pointer;
  font: inherit;
  color: inherit;
}
.cell:hover {
  background: rgba(0, 0, 0, 0.05);
}
.cell:focus-visible {
  outline: 2px solid var(--text);
  outline-offset: -2px;
}
.m {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  display: block;
}
.d-ok,
.m.ok {
  background: #10b981;
  box-shadow: 0 0 0 2px rgba(16, 185, 129, 0.2);
}
.d-leave,
.m.leave {
  background: #0284c7;
  box-shadow: 0 0 0 2px rgba(2, 132, 199, 0.2);
}
.d-extra,
.m.extra {
  background: #7c3aed;
  box-shadow: 0 0 0 2px rgba(124, 58, 237, 0.2);
}
.d-pending,
.m.w {
  background: #f59e0b;
  box-shadow: 0 0 0 2px rgba(245, 158, 11, 0.25);
}
.d-rejected,
.m.q {
  background: #ef4444;
  box-shadow: 0 0 0 2px rgba(239, 68, 68, 0.25);
}
.m.in {
  background: #3b82f6;
  box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.25);
}
td.c-pending, .cell.c-pending {
  background: rgba(254, 243, 199, 0.5);
}
td.c-rejected, .cell.c-rejected {
  background: rgba(254, 226, 226, 0.5);
}
td.c-leave, .cell.c-leave {
  background: rgba(224, 242, 254, 0.4);
}
td.c-extra, .cell.c-extra {
  background: rgba(237, 233, 254, 0.4);
}
td.c-in, .cell.c-in {
  background: rgba(219, 234, 254, 0.4);
}
td.c-ok, .cell.c-ok {
  /* soft neutral/ok */
}
td.none {
  text-align: center !important;
  color: var(--muted);
  font-size: 13px;
  height: 80px;
}
</style>
