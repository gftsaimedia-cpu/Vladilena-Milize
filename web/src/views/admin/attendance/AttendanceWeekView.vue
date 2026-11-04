<script setup lang="ts">
// Chấm công theo tuần trên dữ liệu giả: 6 chỉ số, lưới 28 ngày (tab Tuần) và danh sách việc cần xử lý (tab Cần xử lý).
// Tab, lọc tên, lọc phòng ban và hộp chi tiết ngày đều nằm trên URL (?xem, ?q, ?pb, ?hop) và đổi bằng router.replace.
import { computed, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { fold } from '@/builders/admin-attendance/common';
import Icon from '@/components/ui/Icon.vue';
import { useLoad } from '@/composables/useLoad';
import { getAttendance } from '@/services/admin-attendance';
import { usePeriodStore } from '@/stores/period';
import { useShellStore } from '@/stores/shell';
import DayDetailDialog from './DayDetailDialog.vue';
import PendingList from './parts/PendingList.vue';
import WeekGrid from './parts/WeekGrid.vue';
import { focusLost, untilIdle, useDayHop } from './useDayHop';
import './attendance.css';

const DEPARTMENTS = ['Tài chính', 'Kỹ thuật', 'Kinh doanh', 'Nhân sự', 'Marketing', 'Sản xuất'];
const TILE_SWATCH: Record<string, string> = { todo: 'todo', present: 'work', late: 'late', leave: 'leave', absent: 'absent' };

const route = useRoute();
const router = useRouter();
const period = usePeriodStore();
const shell = useShellStore();

const { data, loading } = useLoad(
  () => getAttendance(period.month),
  () => `${period.month}|${shell.version}`
);

// Trả focus sau hộp chi tiết ngày. Nút mở còn thì focus về nút đó (AppModal đã làm). Xử lý xong mà nút biến mất thì:
//  - dòng trong "Cần xử lý": dòng đang đứng đúng chỗ đó (dòng sau dồn lên), không có thì dòng liền trước, hết dòng thì tab "Cần xử lý";
//  - ô trong lưới (vd. ngày làm bù về "không ca" thành span): ô bấm được gần nhất cùng hàng, hai bên cách đều thì lấy bên trái
//    (bên phải dễ nằm ngoài tuần đang xem, focus vào đó làm lưới cuộn đi); không có ô nào thì tab "Cần xử lý".
type OpenerAt = { kind: 'pending'; index: number } | { kind: 'cell'; row: HTMLTableRowElement; col: number } | null;
const pendingTabEl = () => document.getElementById('att-tab-pending');
const { day, openDay, closeDay } = useDayHop<OpenerAt>({
  capture(opener) {
    const item = opener.closest('li');
    if (item?.parentElement?.classList.contains('pend')) {
      return { kind: 'pending', index: Array.from(item.parentElement.children).indexOf(item) };
    }
    const cell = opener.closest('td');
    return cell?.parentElement instanceof HTMLTableRowElement ? { kind: 'cell', row: cell.parentElement, col: cell.cellIndex } : null;
  },
  async restore(opener, at) {
    await untilIdle(loading);
    if (!focusLost()) return;
    if (opener.isConnected) return opener.focus();
    let target: HTMLElement | null | undefined = null;
    if (at?.kind === 'pending') {
      const rows = Array.from(document.querySelectorAll<HTMLElement>('.pend .pr'));
      target = rows[at.index] ?? rows[at.index - 1];
    } else if (at?.kind === 'cell' && at.row.isConnected) {
      const cells = at.row.cells;
      for (let gap = 1; gap < cells.length && !target; gap++) {
        target = cells[at.col - gap]?.querySelector<HTMLElement>('button') ?? cells[at.col + gap]?.querySelector<HTMLElement>('button');
      }
    }
    (target ?? pendingTabEl())?.focus();
  }
});

const str = (v: unknown) => (typeof v === 'string' ? v : '');
const q = computed(() => str(route.query.q));
const dept = computed(() => (DEPARTMENTS.includes(str(route.query.pb)) ? str(route.query.pb) : ''));
const view = computed(() => (route.query.xem === 'can-xu-ly' ? 'pending' : 'week'));
const monthNo = computed(() => Number(period.month.slice(5, 7)));
const monthText = computed(() => `${monthNo.value}/${period.month.slice(0, 4)}`);

/** Đổi các khoá lọc trên URL, giữ nguyên các khoá khác; giá trị rỗng thì bỏ khoá. */
function setQuery(patch: Record<string, string>) {
  const query: Record<string, any> = { ...route.query };
  for (const [key, value] of Object.entries(patch)) {
    if (value) query[key] = value;
    else delete query[key];
  }
  router.replace({ query });
}
watch(
  () => route.query.pb,
  pb => {
    if (pb !== undefined && !DEPARTMENTS.includes(str(pb))) setQuery({ pb: '' });
  },
  { immediate: true }
);

const keep = (person: { name: string; dept: string }) =>
  (!dept.value || person.dept === dept.value) && (!q.value.trim() || fold(person.name).includes(fold(q.value.trim())));
const rows = computed(() => (data.value?.rows ?? []).filter(r => keep(r.person)));
const pending = computed(() => (data.value?.pending ?? []).filter(p => keep(p.person)));
const filtered = computed(() => !!dept.value || !!q.value.trim());

/** '113 / 128' → ['113', ' / 128'], '126 giờ' → ['126', ' giờ'], '11' → ['11', '']. */
function tileMain(value: string) {
  const m = /^([^ ]+)( .+)$/.exec(value);
  return m ? [m[1], m[2]] : [value, ''];
}

const TABS = ['week', 'pending'] as const;
function pickTab(next: (typeof TABS)[number]) {
  setQuery({ xem: next === 'pending' ? 'can-xu-ly' : '' });
}
function onTabKey(event: KeyboardEvent) {
  const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
  if (!step) return;
  event.preventDefault();
  const next = TABS[(TABS.indexOf(view.value) + step + TABS.length) % TABS.length];
  pickTab(next);
  document.getElementById(`att-tab-${next}`)?.focus();
}
</script>

<template>
  <div class="att">
    <div class="title">
      <div>
        <h1>Chấm công</h1>
        <p v-if="data">{{ data.subtitle }}</p>
      </div>
    </div>

    <template v-if="data">
      <section class="tiles" aria-label="Chỉ số chấm công">
        <article v-for="t in data.tiles" :key="t.key" class="tile" :class="{ dark: t.key === 'todo' }" :aria-label="t.label">
          <span class="tile-l">
            <span v-if="TILE_SWATCH[t.key]" class="b" :class="TILE_SWATCH[t.key]" aria-hidden="true" />{{ t.label }}
          </span>
          <span class="tile-v">{{ tileMain(t.value)[0] }}<span v-if="tileMain(t.value)[1]" class="of">{{ tileMain(t.value)[1] }}</span></span>
          <span class="tile-n">{{ t.note }}</span>
        </article>
      </section>

      <section class="card board" aria-label="Bảng công theo tuần">
        <div class="bar">
          <div class="tabs2" role="tablist" aria-label="Kiểu xem" @keydown="onTabKey">
            <button
              id="att-tab-week"
              type="button"
              role="tab"
              :aria-selected="view === 'week'"
              :tabindex="view === 'week' ? 0 : -1"
              @click="pickTab('week')"
            >
              Tuần
            </button>
            <button
              id="att-tab-pending"
              type="button"
              role="tab"
              :aria-selected="view === 'pending'"
              :tabindex="view === 'pending' ? 0 : -1"
              @click="pickTab('pending')"
            >
              Cần xử lý<span class="badge">{{ data.pending.length }}</span>
            </button>
          </div>
          <label class="fsearch">
            <Icon name="search" :size="16" />
            <input
              type="text"
              placeholder="Lọc theo tên…"
              aria-label="Lọc theo tên"
              :value="q"
              @input="setQuery({ q: ($event.target as HTMLInputElement).value })"
            />
          </label>
          <label class="fsel">
            <select
              aria-label="Phòng ban"
              :value="dept"
              @change="setQuery({ pb: ($event.target as HTMLSelectElement).value })"
            >
              <option value="">Phòng ban: Tất cả</option>
              <option v-for="d in DEPARTMENTS" :key="d" :value="d">{{ d }}</option>
            </select>
            <Icon name="chev" :size="16" />
          </label>
        </div>

        <WeekGrid v-if="view === 'week'" :days="data.days" :rows="rows" :month-no="monthNo" @open-day="openDay" />
        <template v-else>
          <p v-if="filtered && !pending.length && data.pending.length" class="none">Không có nhân viên nào khớp.</p>
          <PendingList v-else :pending="pending" @open-day="openDay" />
        </template>

        <div v-if="view === 'week'" class="foot">
          <span class="live"><span class="dot" aria-hidden="true" />Đang làm</span>
          <span class="cnt">Hiển thị {{ rows.length }} trong {{ data.total }} nhân viên</span>
        </div>
      </section>
    </template>
    <p v-else-if="!loading" class="none">Chưa có dữ liệu chấm công giả cho tháng {{ monthText }}.</p>

    <DayDetailDialog
      v-if="day"
      :key="`${day.personId}|${day.date}`"
      :person-id="day.personId"
      :date="day.date"
      @close="closeDay"
    />
  </div>
</template>

<style scoped>
.tiles {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 150px), 1fr));
  gap: 16px;
  margin-bottom: 24px;
}
.tile {
  min-height: 112px;
  min-width: 0;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 8px;
  padding: 16px 20px;
  border-radius: var(--r-md);
  background: var(--surface);
  border: 1px solid var(--border);
}
.tile.dark {
  background: var(--surface-dark);
  border-color: var(--surface-dark);
  color: var(--on-primary);
}
.tile-l {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  line-height: 16px;
  font-weight: 500;
  color: var(--muted);
}
.tile-l .b {
  width: 10px;
  height: 10px;
  border-radius: 3px;
}
.tile.dark .tile-l {
  color: var(--on-primary);
}
.tile-v {
  font-size: 28px;
  line-height: 32px;
  font-weight: 500;
  letter-spacing: -0.56px;
  font-variant-numeric: tabular-nums;
}
.tile-v .of {
  font-size: 18px;
  color: var(--muted);
}
.tile.dark .tile-v {
  color: var(--gold);
}
.tile-n {
  font-size: 12px;
  line-height: 16px;
  color: var(--muted);
}
.tile.dark .tile-n {
  color: var(--ink-on-dark-muted);
}
.board {
  overflow: hidden;
}
.bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  padding: 20px 20px 12px;
}
.tabs2 {
  display: inline-flex;
  padding: 4px;
  gap: 4px;
  border-radius: 50px;
  background: var(--ground);
  margin-right: auto;
}
.tabs2 button {
  height: 32px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 0 14px;
  border: 0;
  border-radius: 50px;
  background: transparent;
  font-weight: 500;
  cursor: pointer;
}
.tabs2 button[aria-selected='true'] {
  background: var(--surface-dark);
  color: var(--on-primary);
}
.tabs2 button:focus-visible {
  outline: 2px solid var(--text);
  outline-offset: 2px;
}
.badge {
  min-width: 20px;
  height: 18px;
  padding: 0 6px;
  display: inline-grid;
  place-items: center;
  border-radius: 50px;
  border: 2px solid var(--status-pending);
  background: var(--surface);
  color: var(--text);
  font-size: 12px;
  line-height: 16px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.fsearch,
.fsel {
  height: 40px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 12px;
  border: 1px solid var(--control);
  border-radius: var(--r-ctl);
  background: var(--surface);
  color: var(--faint);
}
.fsearch {
  flex: 0 1 200px;
  min-width: 0;
}
.fsel {
  position: relative;
  flex: 0 1 200px;
  min-width: 0;
}
.fsearch:focus-within,
.fsel:focus-within {
  border-color: var(--text);
}
.fsearch input,
.fsel select {
  flex: 1;
  min-width: 0;
  border: 0;
  outline: 0;
  padding: 0;
  background: transparent;
  font: inherit;
  color: var(--text);
}
.fsel select {
  appearance: none;
  cursor: pointer;
  padding-right: 20px;
  text-overflow: ellipsis;
}
.fsel :deep(svg) {
  position: absolute;
  right: 12px;
  pointer-events: none;
}
.fsearch input::placeholder {
  color: var(--faint);
}
.foot {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 16px;
  padding: 14px 20px 16px;
}
.foot .cnt {
  margin-left: auto;
}
.foot .live {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.foot .dot {
  width: 6px;
  height: 6px;
  border-radius: 50px;
  background: var(--gold);
}
.none {
  margin: 0;
  padding: 20px;
  color: var(--muted);
}
</style>
