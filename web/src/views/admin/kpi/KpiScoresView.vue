<script setup lang="ts">
// Tab Nhập điểm: bảng nhập 5 điểm thành phần (0–100) cho mỗi người. Tab sang ô bên phải, Enter xuống dòng dưới,
// tự lưu khi rời ô; tổng điểm, kết quả và lương KPI do máy chủ tính lại và trả về.
import { computed, inject, ref, watch } from 'vue';
import { toast } from '@/components/shell/toast';
import { useLoad } from '@/composables/useLoad';
import { getKpiScores, saveKpiScore } from '@/services/admin-kpi';
import { usePeriodStore } from '@/stores/period';
import { initials, num, vnd } from '@/utils/format';
import PagerBar from '@/views/admin/attendance/PagerBar.vue';
import SearchBox from '@/views/admin/attendance/SearchBox.vue';

const period = usePeriodStore();
const month = computed(() => period.month);
const monthNo = computed(() => Number(month.value.slice(5)));
const summary = inject('kpiSummary', ref(null));
const reloadSummary = inject('kpiReload', () => {});
const weights = computed(() => summary.value?.weights || []);

const CHIPS = [
  ['all', 'Tất cả'],
  ['incomplete', 'Chưa chấm đủ'],
  ['base-thap', 'Base Wework dưới 75'],
  ['tong-thap', 'Tổng điểm chưa đạt'],
  ['dat', 'Đạt']
];
const filter = ref('all');
const q = ref('');
const page = ref(1);
watch([month, filter, q], () => (page.value = 1));
const queryKey = computed(() => JSON.stringify([month.value, filter.value, q.value, page.value]));
const { data, reload } = useLoad(
  async () => {
    const requestedMonth = month.value;
    const requestedFilter = filter.value;
    const requestedQuery = queryKey.value;
    const result = await getKpiScores(requestedMonth, {
      filter: requestedFilter,
      q: q.value,
      page: page.value
    });
    return { ...result, _month: requestedMonth, _queryKey: requestedQuery };
  },
  () => queryKey.value
);
const viewData = computed(() => (data.value?._queryKey === queryKey.value ? data.value : null));
const viewMonth = computed(() => viewData.value?._month || month.value);
const rows = computed(() => viewData.value?.rows || []);
const footText = computed(() => {
  const d = viewData.value;
  if (!d || !rows.value.length) return `0 trên ${d?.total || 0} nhân sự có đánh giá KPI`;
  const from = (d.page - 1) * 20 + 1;
  return `${from}–${from + rows.value.length - 1} trên ${d.total} nhân sự có đánh giá KPI · xếp theo tên`;
});

// Draft riêng theo tháng/nhân sự/điểm để rerender không chép đè ký tự đang gõ bằng giá trị đã lưu.
const drafts = ref<Record<string, string>>({});
const invalid = ref(new Set());
const saving = new Map<string, string>();
const queued = new Set<string>();
const cellKey = (targetMonth?, id?, k?) => `${targetMonth}-${id}-${k}`;
const hasDraft = (key?) => Object.prototype.hasOwnProperty.call(drafts.value, key);
function inputValue(row?, k?, targetMonth?) {
  const key = cellKey(targetMonth, row.id, k);
  return hasDraft(key) ? drafts.value[key] : row.scores[k] ?? '';
}
function setDraft(key?, value?) {
  drafts.value = { ...drafts.value, [key]: value };
}
function clearDraft(key?) {
  if (!hasDraft(key)) return;
  const next = { ...drafts.value };
  delete next[key];
  drafts.value = next;
}
const mark = (key?, on?) => {
  const next = new Set<any>(invalid.value);
  if (on) next.add(key);
  else next.delete(key);
  invalid.value = next;
};
function onInput(row?, k?, e?, targetMonth?) {
  const key = cellKey(targetMonth, row.id, k);
  setDraft(key, e.target.value);
  mark(key, false);
}
async function commit(row?, k?, e?, targetMonth = month.value) {
  const key = cellKey(targetMonth, row.id, k);
  const rawInput = hasDraft(key) ? drafts.value[key] : e.target.value;
  if (saving.has(key)) {
    if (rawInput !== saving.get(key)) queued.add(key);
    return;
  }
  const raw = String(rawInput).trim().replace(',', '.');
  const value = raw === '' ? null : Number(raw);
  if (value !== null && (!Number.isFinite(value) || value < 0 || value > 100)) return mark(key, true);
  mark(key, false);
  const saved = row.scores[k] == null ? null : Number(row.scores[k]);
  if (value === saved) return clearDraft(key);
  const submittedInput = String(rawInput);
  const submittedQuery = queryKey.value;
  saving.set(key, submittedInput);
  let res;
  let failed = false;
  try {
    res = await saveKpiScore({ month: targetMonth, id: row.id, index: k, value });
  } catch (err) {
    toast.error(err.message);
    failed = true;
  } finally {
    saving.delete(key);
  }
  if (failed) {
    if (queued.delete(key) && hasDraft(key)) {
      void commit(row, k, { target: { value: drafts.value[key] } }, targetMonth);
    }
    return;
  }
  if (res.row) Object.assign(row, res.row);
  if (hasDraft(key) && drafts.value[key] === submittedInput) clearDraft(key);
  if (month.value === targetMonth) {
    if (viewData.value?._queryKey === submittedQuery) {
      const i = data.value.rows.findIndex(x => x.id === row.id);
      if (i >= 0 && res.row) data.value.rows[i] = res.row;
    }
    reload();
    reloadSummary();
  }
  if (queued.delete(key) && hasDraft(key)) {
    const latestRow = rows.value.find(x => x.id === row.id) || row;
    void commit(latestRow, k, { target: { value: drafts.value[key] } }, targetMonth);
  }
}
function commitAndNext(row?, k?, i?, e?, targetMonth?) {
  void commit(row, k, e, targetMonth);
  nextRow(i, k, e);
}
function nextRow(i?, k?, e?) {
  const el = e.target.closest('tbody').querySelector(`[data-pos="${i + 1}-${k}"]`);
  if (el) {
    el.focus();
    el.select();
  }
}
</script>

<template>
  <section class="card">
    <div class="card-h">
      <h2>Điểm tháng {{ monthNo }}</h2>
      <span class="cap">Nhập điểm từ 0 đến 100 · Tab sang ô bên phải, Enter xuống dòng dưới · tự lưu khi rời ô</span>
    </div>
    <div class="tools">
      <button
        v-for="[key, label] in CHIPS"
        :key="key"
        type="button"
        class="chip"
        :class="{ on: filter === key }"
        @click="filter = key"
      >
        {{ label }} <small v-if="viewData?.counts?.[key] != null">{{ viewData.counts[key] }}</small>
      </button>
      <SearchBox v-model="q" style="margin-left: auto" />
    </div>
    <table class="tbl k">
      <colgroup>
        <col style="width: 248px" />
        <col v-for="w in weights" :key="w.key" style="width: 96px" />
        <col style="width: 80px" />
        <col />
        <col style="width: 126px" />
        <col style="width: 94px" />
      </colgroup>
      <thead>
        <tr>
          <th>Nhân sự</th>
          <th v-for="w in weights" :key="w.key" class="c">
            {{ w.short || w.label }}<span class="w">{{ w.pct }}%</span>
          </th>
          <th class="n">Tổng điểm</th>
          <th>Kết quả</th>
          <th class="n">Lương KPI tối đa</th>
          <th class="n">Lương KPI</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(r, i) in rows" :key="r.id">
          <td>
            <div class="who">
              <span class="av">{{ initials(r.name) }}</span>
              <div>
                <div class="t">{{ r.name }}</div>
                <div class="s">{{ r.sub }}</div>
              </div>
            </div>
          </td>
          <td v-for="(w, k) in weights" :key="w.key" class="c">
            <input
              class="in"
              :class="{ v: r.scores[k] != null, bad: invalid.has(cellKey(viewMonth, r.id, k)) }"
              inputmode="decimal"
              autocomplete="off"
              placeholder="—"
              :value="inputValue(r, k, viewMonth)"
              :data-pos="`${i}-${k}`"
              :aria-label="`${w.label} của ${r.name}`"
              @input="onInput(r, k, $event, viewMonth)"
              @blur="commit(r, k, $event, viewMonth)"
              @keydown.enter.prevent="commitAndNext(r, k, i, $event, viewMonth)"
            />
          </td>
          <td class="tot" :class="{ z: r.total == null }">{{ r.total == null ? '—' : `${num(r.total)}%` }}</td>
          <td>
            <span v-if="r.result" class="pill" :class="r.result.cls">{{ r.result.label }}</span>
            <span v-else class="miss">Chưa chấm</span>
          </td>
          <td class="n">{{ vnd(r.max) }}</td>
          <td class="n" :class="{ z: !r.bonus }">{{ r.bonus == null ? '—' : vnd(r.bonus) }}</td>
        </tr>
        <tr v-if="viewData && !rows.length">
          <td colspan="10" class="none">
            {{ viewData.empty ? 'Chưa có dữ liệu KPI của tháng này' : 'Không có nhân sự nào phù hợp' }}
          </td>
        </tr>
      </tbody>
    </table>
    <PagerBar :text="footText" :page="viewData?.page || 1" :pages="viewData?.pages || 1" @page="page = $event" />
  </section>
</template>

<style scoped>
.k td {
  height: 56px;
}
.k th.c,
.k td.c {
  text-align: center;
}
.k th .w {
  display: block;
  color: var(--muted);
  font-size: 11px;
}
.k th.c {
  line-height: 15px;
  vertical-align: bottom;
}
.in {
  display: inline-block;
  width: 56px;
  height: 32px;
  padding: 0;
  text-align: center;
  border: 1px solid #cfcfcf;
  border-radius: var(--r-ctl);
  background: #fff;
  font: inherit;
  font-variant-numeric: tabular-nums;
  color: #bdbdbd;
  outline: 0;
}
.in::placeholder {
  color: #bdbdbd;
}
.in.v,
.in:not(:placeholder-shown) {
  color: var(--text);
  border-color: var(--control);
  font-weight: 500;
}
.in:focus {
  border-color: var(--text);
  box-shadow: 0 0 0 3px #e9e9e9;
}
.in.bad {
  border-color: var(--err-ink);
  box-shadow: 0 0 0 3px var(--err-bg);
}
.k td.tot {
  font-weight: 600;
  text-align: right;
}
.k td.tot.z {
  color: #a3a3a3;
  font-weight: 400;
}
.k .miss {
  color: var(--muted);
  font-size: 13px;
}
.k td.n.z {
  color: #a3a3a3;
}
td.none {
  text-align: center;
  color: var(--muted);
  font-size: 13px;
  height: 80px;
}
</style>
