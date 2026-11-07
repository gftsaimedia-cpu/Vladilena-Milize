<script setup lang="ts">
// Chấm công theo tuần trên dữ liệu giả: 6 chỉ số, lưới 28 ngày (tab Tuần) và danh sách việc cần xử lý (tab Cần xử lý).
// Tab, lọc tên, cặp bộ lọc nhân sự, việc đang chọn và hộp chi tiết ngày đều nằm trên URL (?xem, ?q, ?ns (trạng thái nhân sự),
// ?pb (phòng ban do BE trả), ?viec, ?hop) và đổi bằng router.replace.
// Tab "Cần xử lý" từ 900px: danh sách bên trái, chi tiết việc đang chọn (BellDetail) bên phải; hẹp hơn thì chỉ có danh sách và
// bấm dòng mở hộp chi tiết ngày như trước.
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import BulkButton from '@/components/select-mode/BulkButton.vue';
import ResultLine from '@/components/select-mode/ResultLine.vue';
import SelectBar from '@/components/select-mode/SelectBar.vue';
import { useSelectMode } from '@/components/select-mode/useSelectMode';
import BellDetail from '@/components/shell/BellDetail.vue';
import StaffScopeFilter from '@/components/staff-scope/StaffScopeFilter.vue';
import { isPst, matchScope, useMineDepts, type StaffPst } from '@/components/staff-scope/staffScope';
import { toast } from '@/components/shell/toast';
import Icon from '@/components/ui/Icon.vue';
import { useLoad } from '@/composables/useLoad';
import PageLoadError from '@/components/shell/PageLoadError.vue';
import type { InboxItem } from '@/mock/inbox';
import { getAttendance } from '@/services/admin-attendance';
import { useRealtimeReload } from '@/composables/useRealtimeReload';
import { usePeriodStore } from '@/stores/period';
import { useShellStore } from '@/stores/shell';
import DayDetailDialog from './DayDetailDialog.vue';
import PendingList from './parts/PendingList.vue';
import WeekGrid from './parts/WeekGrid.vue';
import { focusLost, untilIdle, useDayHop } from './useDayHop';
import './attendance.css';

const TILE_SWATCH: Record<string, string> = { todo: 'todo', present: 'work', late: 'late', leave: 'leave', absent: 'absent' };

const route = useRoute();
const router = useRouter();
const str = (v: unknown) => (typeof v === 'string' ? v : '');
const q = computed(() => str(route.query.q));
const dept = computed(() => str(route.query.pb));
// Trạng thái nhân sự lọc phía máy khách trên các dòng BE trả về (06/11); giá trị lạ trên URL thì bỏ.
const pst = computed<StaffPst>(() => (isPst(route.query.ns) ? route.query.ns : 'all'));
const mine = useMineDepts();
const period = usePeriodStore();
const shell = useShellStore();

// Lọc tên và nhóm do BE làm: đổi ?q hoặc ?pb thì tải lại.
const { data, loading, error, reload, refresh } = useLoad(
  () => getAttendance(period.month, q.value, dept.value),
  () => `${period.month}|${shell.version}|${q.value}|${dept.value}`
);
// Đơn nghỉ được duyệt đổi ô ngày; kỳ lương đổi thì cờ khoá công đổi; nhân sự đổi thì danh sách người đổi.
useRealtimeReload(refresh, { types: ['attendance.punched', 'attendance.changed', 'request.filed', 'request.decided', 'period.changed', 'staff.changed'] });

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
// Nhóm lạ trên URL (không có trong groups của BE) thì bỏ khỏi bộ lọc.
watch(
  () => data.value?.groups,
  groups => {
    if (groups && dept.value && !groups.some(g => g.key === dept.value)) setQuery({ pb: '' });
  }
);
watch(
  () => route.query.ns,
  ns => {
    if (ns !== undefined && !isPst(ns)) setQuery({ ns: '' });
  },
  { immediate: true }
);
const setPst = (v: StaffPst) => setQuery({ ns: v === 'all' ? '' : v });
const setDept = (v: string) => setQuery({ pb: v });
const depts = computed(() => (data.value?.groups ?? []).map(g => g.key));

// Phòng ban đã lọc ở BE (?pb); ở đây chỉ còn trạng thái nhân sự (và phạm vi "tôi quản lý" theo phòng ban của dòng).
const inScope = (x: { dept: string; ps?: Parameters<typeof matchScope>[0]['ps'] }) =>
  matchScope(x, { pst: pst.value, dept: '' }, mine);
const rows = computed(() => (data.value?.rows ?? []).filter(inScope));
const pending = computed(() => (data.value?.pending ?? []).filter(inScope));
const matched = computed(() => (pst.value === 'all' ? (data.value?.matched ?? 0) : rows.value.length));
const filtered = computed(() => !!dept.value || !!q.value.trim() || pst.value !== 'all');

// ---- Tab "Cần xử lý": việc đang chọn ----
// Từ 900px có khung chi tiết bên phải; hẹp hơn chỉ còn danh sách.
const narrowQuery = typeof window !== 'undefined' ? window.matchMedia('(max-width: 899px)') : null;
const wide = ref(!narrowQuery?.matches);
const onNarrow = (event: MediaQueryListEvent) => {
  wide.value = !event.matches;
};
onMounted(() => narrowQuery?.addEventListener('change', onNarrow));
onBeforeUnmount(() => narrowQuery?.removeEventListener('change', onNarrow));

const viecKey = computed(() => str(route.query.viec));
const visibleIds = computed(() => pending.value.map(p => p.item.id));

// Việc đang hiện ở khung phải là bản chụp: BellDetail tự gọi decide, decide tải lại danh sách và việc vừa xử lý biến mất khỏi nguồn
// trước khi thẻ kịp báo 'decided'; thẻ bị gỡ giữa chừng thì emit bị bỏ. Nên việc đã biến mất khỏi nguồn được giữ lại cho tới khi
// onDecided chuyển sang việc khác. ?viec thiếu, sai hoặc bị lọc mất thì hiện dòng đầu đang thấy.
// Việc vẫn còn trong nguồn (vừa nhắc giải trình) thì lấy bản mới để thẻ hiện "Đã nhắc" và nút "Nhắc lại".
const shown = shallowRef<InboxItem | null>(null);
// Đổi bộ lọc thì danh sách do BE trả lại khác hẳn: bỏ bản chụp cũ.
watch([q, dept, pst], () => (shown.value = null), { flush: 'sync' });
watch(
  [pending, viecKey],
  () => {
    const list = pending.value;
    const hit = list.find(p => p.item.id === viecKey.value);
    const target = hit ?? list[0];
    const current = shown.value;
    if (current && !hit && !visibleIds.value.includes(current.id)) return;
    if (current && target && current.id === target.item.id) {
      if (current !== target.item) shown.value = target.item;
      return;
    }
    shown.value = target?.item ?? null;
  },
  { immediate: true }
);

// Thứ tự danh sách ngay trước lần đổi gần nhất: để tìm việc liền sau việc vừa rời danh sách.
let previousIds: string[] = [];
watch(visibleIds, (_, before) => (previousIds = before ?? []), { flush: 'sync' });

function pickItem(id: string) {
  setQuery({ viec: id });
}
// Việc vừa nhắc giải trình (`kept`) ở lại danh sách nên vẫn chọn nó, như ở chuông; thẻ tự trả focus về nút "Nhắc lại".
async function onDecided({ id, ok, text, kept }: { id: string; ok: boolean; text: string; kept: boolean }) {
  if (ok) toast.ok(text);
  else toast.error(text);
  if (kept) return;
  const base = visibleIds.value.includes(id) ? visibleIds.value : previousIds.includes(id) ? previousIds : visibleIds.value;
  const at = base.indexOf(id);
  const rest = base.filter(x => x !== id && visibleIds.value.includes(x));
  const next = rest[at] ?? rest[0] ?? null;
  shown.value = pending.value.find(p => p.item.id === next)?.item ?? null;
  setQuery({ viec: next ?? '' });
  await nextTick();
  const row = next ? document.querySelector<HTMLElement>(`.pend .pr[data-id="${next}"]`) : null;
  (row ?? pendingTabEl())?.focus();
}

// ---- Nhắc giải trình nhiều người (board L3) ----
// Nút đếm số việc quên chấm công đang hiện (theo bộ lọc), khoá khi bằng 0. Trong chế độ chọn chỉ chọn được các việc đó;
// chạy thì nhắc lần lượt từng việc qua shell.decide (cùng đường với chuông), việc nhắc ở lại danh sách.
const sel = useSelectMode<'remind'>();
const result = ref('');
const remindIds = computed(() => pending.value.filter(p => p.item.action === 'remind').map(p => p.item.id));
const chosen = computed(() => sel.pickedIn(remindIds.value));
const targets = computed(() => pending.value.filter(p => sel.isPicked(p.item.id) && p.item.action === 'remind'));
function startRemind() {
  sel.enter('remind');
  result.value = '';
}
const reminding = ref(false);
async function runRemind() {
  if (!chosen.value.length || reminding.value) return;
  reminding.value = true;
  const items = targets.value.map(p => ({ id: p.item.id, personId: p.person.id }));
  const people = new Set<string>();
  try {
    for (const it of items) {
      await shell.decide(it.id, 'remind');
      people.add(it.personId);
    }
    result.value = `Đã gửi nhắc giải trình cho ${people.size} người.`;
    sel.quit();
  } catch (e) {
    toast.error(people.size ? `Đã nhắc ${people.size} người, rồi lỗi: ${(e as Error).message}` : (e as Error).message);
  } finally {
    reminding.value = false;
  }
}
// Sang tab Tuần thì thoát chế độ chọn và bỏ dòng kết quả.
watch(view, v => {
  if (v !== 'pending') {
    sel.quit();
    result.value = '';
  }
});

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

    <PageLoadError v-if="error && !data" what="bảng chấm công" :error="error" @retry="reload" />

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
              Cần xử lý<span class="badge">{{ pending.length }}</span>
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
          <StaffScopeFilter :pst="pst" :dept="dept" :depts="depts" @update:pst="setPst" @update:dept="setDept" />
          <BulkButton
            v-if="view === 'pending' && !sel.mode.value"
            icon="send"
            :count="remindIds.length"
            :disabled="!remindIds.length"
            :title="remindIds.length ? undefined : 'Không có việc quên chấm công nào đang hiện'"
            @click="startRemind"
          >
            Nhắc giải trình
          </BulkButton>
        </div>
        <SelectBar
          v-if="sel.mode.value"
          title="Nhắc giải trình"
          :count="chosen.length"
          :total="remindIds.length"
          unit="người"
          :go-label="reminding ? 'Đang nhắc…' : chosen.length ? `Nhắc ${chosen.length} người` : 'Chọn ít nhất 1 người'"
          :go-disabled="!chosen.length || reminding"
          :running="reminding"
          @quit="sel.quit()"
          @run="runRemind"
        />
        <ResultLine v-else-if="view === 'pending'" :text="result" />

        <WeekGrid v-if="view === 'week'" :days="data.days" :rows="rows" :month-no="monthNo" @open-day="openDay" />
        <template v-else>
          <p v-if="filtered && !pending.length && !rows.length" class="none">Không có nhân viên nào khớp.</p>
          <div v-else class="pv" :class="{ one: !wide }">
            <PendingList
              :pending="pending"
              :wide="wide"
              :selected-id="shown?.id ?? null"
              :selecting="!!sel.mode.value"
              :picked="sel.picked.value"
              :all-state="sel.stateOf(remindIds)"
              @open-day="openDay"
              @pick="pickItem"
              @toggle="sel.toggle"
              @toggle-all="sel.toggleAll(remindIds)"
            />
            <div v-if="wide && sel.mode.value" class="pd" role="region" aria-label="Người sẽ được nhắc" tabindex="0">
              <div class="pdi">
                <div class="pd-grp">Sẽ nhắc giải trình</div>
                <p v-if="!targets.length" class="pd-none">Chưa chọn ai.</p>
                <ul v-else class="tg">
                  <li v-for="p in targets" :key="p.item.id">
                    <span class="tg-av" aria-hidden="true">{{ p.person.initials }}</span>
                    <span class="tg-n">{{ p.person.name }}</span>
                    <span class="tg-w">{{ p.item.what }} · {{ p.item.when }}</span>
                  </li>
                </ul>
              </div>
            </div>
            <div
              v-else-if="wide"
              class="pd"
              role="region"
              aria-label="Chi tiết việc đang chọn"
              :tabindex="shown ? 0 : undefined"
            >
              <div v-if="shown" class="pdi">
                <div class="pd-grp">{{ shown.groupLabel }}</div>
                <BellDetail
                  :key="shown.id"
                  embedded
                  profile-link
                  :item="shown"
                  :group="shown.groupLabel"
                  @decided="onDecided"
                />
              </div>
            </div>
          </div>
        </template>

        <div v-if="view === 'week'" class="foot">
          <span class="live"><span class="dot" aria-hidden="true" />Đang làm</span>
          <span class="cnt">Hiển thị {{ matched }} trong {{ data.total }} nhân viên</span>
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
  background: var(--status-pending);
  color: var(--text);
  font-size: 11px;
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
/* Tab "Cần xử lý": danh sách 400px bên trái (PendingList), chi tiết bên phải cùng chiều cao với danh sách và tự cuộn khi dài hơn. */
.pv {
  display: grid;
  grid-template-columns: 400px minmax(0, 1fr);
  border-top: 1px solid var(--border);
}
.pv.one {
  grid-template-columns: minmax(0, 1fr);
}
.pd {
  min-width: 0;
  max-height: 640px;
  box-sizing: border-box;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 24px 32px 32px;
}
.pd:focus-visible {
  outline: 2px solid var(--text);
  outline-offset: -2px;
}
.pdi {
  max-width: 560px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}
.pd-none {
  margin: 0;
  color: var(--muted);
}
.tg {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.tg li {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 40px;
}
.tg-av {
  width: 32px;
  height: 32px;
  flex: none;
  display: grid;
  place-items: center;
  border-radius: 50px;
  background: var(--status-draft);
  font-size: 12px;
  font-weight: 600;
}
.tg-n {
  font-weight: 600;
}
.tg-w {
  margin-left: auto;
  font-size: 12px;
  line-height: 16px;
  color: var(--muted);
}
.pd-grp {
  font-size: 12px;
  line-height: 16px;
  font-weight: 600;
  color: var(--muted);
}
</style>
