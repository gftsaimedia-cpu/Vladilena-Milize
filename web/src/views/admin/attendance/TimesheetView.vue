<script setup lang="ts">
// Tab Bảng công: một dòng mỗi người, một ô mỗi ngày; chỉ ô có việc cần xử lý mới có dấu, ngày đủ công là chấm xám.
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
import PagerBar from './PagerBar.vue';
import SearchBox from './SearchBox.vue';
import { useHop } from './useHop';

const route = useRoute();
const period = usePeriodStore();
const month = computed(() => period.month);
const session = useSessionStore();
const canBulk = computed(() => session.caps.includes('request.decide.*'));
const bulkOpen = ref(false);

const CHIPS = [
  ['all', 'Tất cả', 'all'],
  ['pending', 'Cần xử lý', null],
  ['tts', 'Thực tập sinh', 'tts'],
  ['ctv', 'Chuyên trách viên', 'ctv'],
  ['nv', 'Nhân viên', 'nv']
];
const LEGEND = [
  ['in', '', 'Đã Check-in'],
  ['ok', '', 'Đã Check-out · Được phê duyệt · Đã chấm công (Admin)'],
  ['w', '', 'Chờ xử lý'],
  ['q', '', 'Bị từ chối']
];
const MARK_TEXT: Record<string, any> = {};

const filter = ref('all');
const q = ref('');
const page = ref(1);
watch([month, filter, q], () => (page.value = 1));
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
      open: !sun && !fut
    };
  });
});
const rows = computed(() => data.value?.rows || []);
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
      <h2>{{ heading }}</h2>
      <span class="cap"
        >Tháng công {{ range }} · tính theo Check-in/out trên app có GPS · bấm vào ô để xem giờ vào, ra và sửa giờ</span
      >
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
      <button v-if="canBulk" type="button" class="btn" @click="bulkOpen = true">
        <Icon name="clock" />Chấm công hàng loạt
      </button>
    </div>
    <div class="legend">
      <span v-for="[k, text, label] in LEGEND" :key="k" class="k">
        <span class="m" :class="k">{{ text }}</span
        >{{ label }}
      </span>
      <span class="k">Ô trống: chưa có lượt Check-in nào</span>
    </div>
    <table class="bc">
      <colgroup>
        <col style="width: 244px" />
        <col v-for="c in days" :key="c.date" style="width: 26px" />
        <col style="width: 55px" />
        <col style="width: 55px" />
      </colgroup>
      <thead>
        <tr>
          <th>Nhân sự</th>
          <th v-for="c in days" :key="c.date" :class="c.thCls">
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
                <div class="s" :class="{ bad: r.noShift }">{{ r.sub }}</div>
              </div>
            </div>
          </td>
          <td v-if="r.noShift" class="span" :colspan="days.length">
            Chưa gán ca nên chưa tính được ngày công từ Check-in/out
            <RouterLink
              class="link"
              :to="{ path: '/admin/nhan-su', query: { thang: route.query.thang, loc: 'chua-co-ca' } }"
              >Gán ca</RouterLink
            >
          </td>
          <template v-else>
            <td v-for="c in days" :key="c.date" :class="c.cls">
              <button
                v-if="c.open"
                type="button"
                class="cell"
                :aria-label="`${r.name}, ngày ${c.n}`"
                @click="picked = { id: r.id, date: c.date }"
              >
                <span v-if="r.cells[c.date]" class="m" :class="r.cells[c.date].k">{{
                  r.cells[c.date].t || MARK_TEXT[r.cells[c.date].k]
                }}</span>
              </button>
            </td>
          </template>
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
</template>

<style scoped>
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
  display: inline-grid;
  place-items: center;
  width: 20px;
  height: 20px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 600;
  vertical-align: middle;
}
.m.ok {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: #c2c2c2;
}
.m.hw {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--accent);
}
.m.w {
  background: var(--pend-bg);
  box-shadow: inset 0 0 0 1px #f0c9a2;
}
.m.q {
  background: var(--err-bg);
  color: var(--err-ink);
  box-shadow: inset 0 0 0 1px #ecc4c4;
}
.m.late {
  width: auto;
  color: var(--pend-ink);
  font-size: 11px;
}
.m.lv {
  border: 1.5px dashed #9e9e9e;
  color: var(--muted);
}
.m.in {
  background: var(--gold-light);
  border-radius: 50%;
  width: 16px;
  height: 16px;
}
.m.in::after {
  content: '';
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--accent);
}
td.span {
  text-align: left !important;
  padding-left: 12px !important;
  color: var(--muted);
  font-size: 13px;
}
td.span .link {
  margin-left: 8px;
}
td.none {
  text-align: center !important;
  color: var(--muted);
  font-size: 13px;
  height: 80px;
}
.legend {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 20px;
  padding: 0 24px 16px;
  color: var(--muted);
  font-size: 12px;
}
.legend span.k {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
</style>
