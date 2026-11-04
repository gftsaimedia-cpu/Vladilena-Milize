<script setup lang="ts">
// Lịch sử chấm công: dòng thời gian (mỗi ngày một dòng kèm trục giờ 06:00–20:00, các chuỗi ngày đi làm gộp thành một nút)
// hoặc bảng giờ Ngày / Vào / Ra / Trạng thái. Bảng giờ luôn liệt kê từng ngày, không gộp.
import { computed, ref } from 'vue';
import type { HistoryEntry, HistoryRow, TrackPart } from '@/mock/attendance-employee';

const props = defineProps<{ entries: HistoryEntry[]; mode: 'timeline' | 'table'; empty: string }>();

const open = ref<Set<string>>(new Set());
function toggle(label: string) {
  const next = new Set(open.value);
  if (!next.delete(label)) next.add(label);
  open.value = next;
}

type Item = { key: string; row?: HistoryRow; label?: string; nested?: boolean };
// Các dòng đang hiện: dòng thường, nút gộp, và các dòng của nút gộp đang mở (thụt vào).
const items = computed<Item[]>(() =>
  props.entries.flatMap<Item>(e => {
    if (e.type === 'row') return [{ key: e.row.date, row: e.row }];
    const head: Item = { key: e.label, label: e.label };
    return open.value.has(e.label) ? [head, ...e.rows.map(row => ({ key: row.date, row, nested: true }))] : [head];
  })
);
const flat = computed<HistoryRow[]>(() => props.entries.flatMap(e => (e.type === 'row' ? [e.row] : e.rows)));

const partStyle = (p: TrackPart) => ({
  left: `${p.from}%`,
  ...(p.to !== undefined ? { width: `${p.to - p.from}%` } : {})
});
</script>

<template>
  <p v-if="!entries.length" class="hl-none">{{ empty }}</p>
  <template v-else-if="mode === 'timeline'">
    <div class="hl-head" aria-hidden="true">
      <span>Ngày</span>
      <span>Vào – ra</span>
      <span class="ax"><span>06:00</span><span>13:00</span><span>20:00</span></span>
      <span>Trạng thái</span>
    </div>
    <ul class="hl-list" aria-label="Dòng thời gian">
      <template v-for="it in items" :key="it.key">
        <li v-if="it.row" class="hl-r" :class="{ nested: it.nested }">
          <span class="d">{{ it.row.dayLabel }}</span>
          <span class="i">
            <span class="rg">{{ it.row.range }}</span>
            <span class="sb">{{ it.row.sub }}</span>
          </span>
          <span class="t" aria-hidden="true">
            <span v-for="(p, k) in it.row.parts" :key="k" class="tp" :class="p.type" :style="partStyle(p)">{{
              p.label
            }}</span>
          </span>
          <span class="s"><span class="b" :class="it.row.tone" aria-hidden="true" />{{ it.row.status }}</span>
        </li>
        <li v-else class="hl-f">
          <button type="button" class="fb" :aria-expanded="open.has(it.label)" @click="toggle(it.label)">
            <span>{{ it.label }}</span>
            <span class="fa">{{ open.has(it.label) ? 'Thu gọn' : 'Mở' }}</span>
          </button>
        </li>
      </template>
    </ul>
    <div class="hl-key">
      <span class="k"><span class="kb shift" aria-hidden="true" />Ca</span>
      <span class="k"><span class="kb bar" aria-hidden="true" />Có mặt</span>
      <span class="k"><span class="kb lunch" aria-hidden="true" />Nghỉ trưa</span>
      <span class="k"><span class="kb late" aria-hidden="true" />Đi muộn</span>
      <span class="k"><span class="kb miss" aria-hidden="true" />Giờ khai chờ duyệt</span>
    </div>
  </template>
  <div v-else class="hl-tw">
    <table class="hl-tb" aria-label="Bảng giờ">
      <thead>
        <tr>
          <th scope="col">Ngày</th>
          <th scope="col">Vào</th>
          <th scope="col">Ra</th>
          <th scope="col">Trạng thái</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in flat" :key="row.date">
          <th scope="row">{{ row.dayLabel }}</th>
          <td>{{ row.inText }}</td>
          <td>{{ row.outText }}</td>
          <td><span class="b" :class="row.tone" aria-hidden="true" />{{ row.status }}</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
.hl-none {
  margin: 0;
  padding: 20px 24px 24px;
  color: var(--muted);
}
.hl-head,
.hl-r {
  display: grid;
  grid-template-columns: 120px 168px minmax(0, 1fr) 190px;
  align-items: center;
  gap: 12px;
  padding: 0 24px;
}
.hl-head {
  min-height: 32px;
  font-size: 12px;
  line-height: 16px;
  color: var(--muted);
  border-top: 1px solid var(--rule);
}
.hl-head .ax {
  display: flex;
  justify-content: space-between;
  font-variant-numeric: tabular-nums;
}
.hl-list {
  margin: 0;
  padding: 0;
  list-style: none;
}
.hl-list > li {
  border-top: 1px solid var(--rule);
}
.hl-r {
  min-height: 56px;
  font-size: 14px;
  line-height: 20px;
  font-variant-numeric: tabular-nums;
}
.hl-r.nested {
  background: var(--raised);
}
.hl-r .d {
  font-weight: 500;
}
.hl-r .i {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.hl-r .sb {
  font-size: 12px;
  line-height: 16px;
  color: var(--muted);
}
.hl-r .s {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.b.nocheck {
  background: var(--status-draft);
}

/* Trục giờ 06:00–20:00: mỗi đoạn đặt theo phần trăm; dải ca là nền, các đoạn khác nằm trên. */
.t {
  position: relative;
  height: 20px;
  border-radius: 8px;
}
.tp {
  position: absolute;
  top: 4px;
  height: 12px;
  box-sizing: border-box;
}
.tp.shift {
  top: 0;
  height: 20px;
  background: var(--ground);
  border-radius: 8px;
}
.tp.bar {
  background: var(--surface-dark);
  border-radius: var(--r-pill);
}
.tp.late {
  background: var(--gold);
  border-radius: var(--r-pill) 0 0 var(--r-pill);
}
.tp.lunch {
  background: repeating-linear-gradient(135deg, var(--surface) 0 2px, transparent 2px 5px);
}
.tp.miss {
  border: 2px dashed var(--status-pending);
  border-radius: var(--r-pill);
}
.tp.tick {
  top: 0;
  width: 3px;
  height: 20px;
  margin-left: -1px;
  background: var(--surface-dark);
}
.tp.now {
  top: 0;
  width: 2px;
  height: 20px;
  background: var(--gold);
}
.tp.leave {
  top: 2px;
  height: 16px;
  padding: 0 8px;
  overflow: hidden;
  border-radius: 8px;
  background: var(--status-done);
  color: var(--on-primary);
  font-size: 12px;
  line-height: 16px;
  font-weight: 500;
  text-align: center;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.hl-f .fb {
  width: 100%;
  min-height: 48px;
  padding: 0 24px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  border: 0;
  background: transparent;
  font: inherit;
  font-weight: 500;
  text-align: left;
  cursor: pointer;
}
.hl-f .fb:hover {
  background: var(--ground);
}
.hl-f .fb:focus-visible {
  outline: 2px solid var(--text);
  outline-offset: -2px;
}
.hl-f .fa {
  flex: none;
  color: var(--muted);
  font-weight: 400;
  text-decoration: underline;
  text-underline-offset: 3px;
}

.hl-key {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 20px;
  padding: 14px 24px 18px;
  border-top: 1px solid var(--rule);
  font-size: 12px;
  line-height: 16px;
}
.hl-key .k {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
.kb {
  display: inline-block;
  width: 16px;
  height: 10px;
  box-sizing: border-box;
  border-radius: var(--r-pill);
}
.kb.shift {
  background: var(--ground);
  border: 1px solid var(--border);
}
.kb.bar {
  background: var(--surface-dark);
}
.kb.lunch {
  background: repeating-linear-gradient(135deg, var(--surface-dark) 0 2px, var(--surface) 2px 5px);
  border: 1px solid var(--surface-dark);
}
.kb.late {
  background: var(--gold);
}
.kb.miss {
  border: 2px dashed var(--status-pending);
}

.hl-tw {
  overflow-x: auto;
}
.hl-tb {
  width: 100%;
  border-collapse: collapse;
  font-size: 14px;
  font-variant-numeric: tabular-nums;
}
.hl-tb th,
.hl-tb td {
  height: 48px;
  padding: 0 12px;
  border-top: 1px solid var(--rule);
  text-align: left;
  font-weight: 400;
  white-space: nowrap;
}
.hl-tb th:first-child,
.hl-tb td:first-child {
  padding-left: 24px;
}
.hl-tb thead th {
  height: 32px;
  font-size: 12px;
  color: var(--muted);
}
.hl-tb tbody th {
  font-weight: 500;
}
.hl-tb td .b {
  margin-right: 8px;
  vertical-align: -1px;
}

@media (max-width: 767px) {
  .hl-head {
    display: none;
  }
  .hl-r {
    padding: 0 16px;
  }
  .hl-r {
    grid-template-columns: minmax(0, 1fr) auto;
    grid-template-areas:
      'd s'
      'i i'
      't t';
    row-gap: 8px;
    padding-top: 12px;
    padding-bottom: 12px;
  }
  .hl-r .d {
    grid-area: d;
  }
  .hl-r .s {
    grid-area: s;
  }
  .hl-r .i {
    grid-area: i;
  }
  .hl-r .t {
    grid-area: t;
  }
  .hl-f .fb,
  .hl-key {
    padding-left: 16px;
    padding-right: 16px;
  }
  .hl-tb th:first-child,
  .hl-tb td:first-child {
    padding-left: 16px;
  }
}
</style>
