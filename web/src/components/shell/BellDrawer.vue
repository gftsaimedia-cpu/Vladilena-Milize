<script setup lang="ts">
// Ngăn kéo "Thông báo" mở từ chuông trên thanh trên, theo bảng thiết kế BellInbox: lọc Tất cả / Cần duyệt / Hệ thống,
// mỗi việc chờ hoặc tin hệ thống một dòng; bấm dòng mở thẻ chi tiết (BellDetail) bên trái ngăn kéo.
// Hợp đồng: không props; emit('close') khi đóng (bấm nền, nút Đóng, Esc); emit('leave') khi đóng để đi tới màn khác
// (liên kết tự đổi địa chỉ, nên khung không được đổi địa chỉ chen vào).
// Danh sách đọc từ nguồn việc chung và tải lại mỗi khi useShellStore().version đổi; tin đã đọc nằm ở useShellStore().seen.
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';
import { lockScroll, registerOverlayFocus, unlockScroll } from '@/components/ui/overlay-lock';
import { useLoad } from '@/composables/useLoad';
import { INBOX_GROUPS, SYSTEM_GROUP_LABEL } from '@/constants/labels';
import type { InboxItem, SystemNote } from '@/mock/inbox';
import { getInbox } from '@/services/admin-main';
import { useShellStore } from '@/stores/shell';
import BellDetail from './BellDetail.vue';
import { BELL_ICONS, CLOSE_ICON, type BellGroup } from './bell-icons';

const emit = defineEmits(['close', 'leave']);

type Filter = 'all' | 'need' | 'sys';
type Row = {
  id: string;
  group: BellGroup;
  groupLabel: string;
  /** Dòng 1 (đậm) và dòng 2 (xám) của dòng. */
  title: string;
  line2: string;
  age: string;
  unread: boolean;
  item?: InboxItem;
  news?: SystemNote;
};

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'Tất cả' },
  { key: 'need', label: 'Cần duyệt' },
  { key: 'sys', label: 'Hệ thống' }
];
const EMPTY: Record<Filter, string> = {
  all: 'Không còn thông báo nào.',
  need: 'Không còn yêu cầu nào chờ duyệt.',
  sys: 'Không có tin hệ thống nào.'
};

const shell = useShellStore();
const { data } = useLoad(getInbox, () => shell.version);

const root = ref<HTMLElement | null>(null);
const filter = ref<Filter>('all');
const status = ref('');
// Giữ nguyên bản dòng đang chọn: thẻ chi tiết còn đó cho tới khi xử lý xong, dù danh sách đã tải lại.
const selected = shallowRef<Row | null>(null);
// Thứ tự hiện (theo mục lọc) lúc dòng đang chọn còn trong danh sách, để chọn dòng kế tiếp kể cả khi danh sách đã đổi.
let order: Row[] = [];
// Màn hẹp (dưới 900px): thẻ chi tiết phủ lên ngăn kéo, nên phần ngăn kéo bị che phải `inert` để Tab không chui vào nút ẩn.
const narrow = ref(false);
const covered = computed(() => narrow.value && !!selected.value);

// Dòng 2 là "họ tên · phòng ban" chỉ khi `role` có dạng "Phòng ban · Chức danh" (dữ liệu giả). Máy chủ thật chỉ có
// chức danh hoặc "—", không có phòng ban, nên chỉ hiện họ tên.
function personLine(item: InboxItem) {
  return item.role.includes(' · ') ? `${item.name} · ${item.role.split(' · ')[0]}` : item.name;
}
const itemRow = (item: InboxItem): Row => ({
  id: item.id,
  group: item.group,
  groupLabel: item.groupLabel,
  title: item.group === 'adv' ? item.head : [item.what, item.when].filter(Boolean).join(' · '),
  line2: personLine(item),
  age: item.age,
  unread: !!item.unread,
  item
});
const noteRow = (news: SystemNote): Row => ({
  id: news.id,
  group: 'sys',
  groupLabel: SYSTEM_GROUP_LABEL,
  title: news.text,
  line2: news.area,
  age: news.age,
  unread: !!news.unread,
  news
});

const itemRows = computed(() => (data.value?.items ?? []).map(itemRow));
const noteRows = computed(() => (data.value?.notes ?? []).map(noteRow));
// Thứ tự nhóm như bảng thiết kế: các nhóm việc chờ rồi tới Hệ thống.
const groups = computed(() => [
  ...INBOX_GROUPS.map(g => ({ key: g.key as BellGroup, label: g.label, rows: itemRows.value.filter(r => r.group === g.key) })),
  { key: 'sys' as BellGroup, label: SYSTEM_GROUP_LABEL, rows: noteRows.value }
]);
const inFilter = (f: Filter, r: Row) => f === 'all' || (f === 'need' ? r.group !== 'sys' : r.group === 'sys');
const shownOf = (f: Filter) =>
  groups.value.map(g => ({ ...g, rows: g.rows.filter(r => inFilter(f, r)) })).filter(g => g.rows.length);
const shown = computed(() => shownOf(filter.value));
const flatOf = (f: Filter) => shownOf(f).flatMap(g => g.rows);
const flat = computed(() => shown.value.flatMap(g => g.rows));
const counts = computed<Record<Filter, number>>(() => ({
  all: itemRows.value.length + noteRows.value.length,
  need: itemRows.value.length,
  sys: noteRows.value.length
}));

const isUnread = (r: Row) => r.unread && !shell.seen[r.id];

watch(flat, list => {
  if (selected.value && list.some(r => r.id === selected.value!.id)) order = list;
});

const focusDetail = () => nextTick(() => root.value?.querySelector<HTMLElement>('.bdd')?.focus());
const focusFilter = (f: Filter) =>
  nextTick(() => root.value?.querySelector<HTMLElement>(`[data-filter="${f}"]`)?.focus());

// Mọi lần chọn (bấm dòng, đổi mục lọc, chọn việc kế tiếp) đều đánh dấu tin đã đọc.
function choose(row: Row | null, list: Row[]) {
  order = list;
  selected.value = row;
  if (row) shell.markSeen(row.id);
}
function select(row: Row) {
  choose(row, flat.value);
  focusDetail();
}
// Đổi mục lọc: thẻ đang mở thì giữ việc đang xem nếu nó thuộc mục mới, không thì mở dòng đầu của mục đó.
// Chưa mở thẻ nào thì vẫn không mở.
function setFilter(next: Filter) {
  if (filter.value === next) return;
  filter.value = next;
  const current = selected.value;
  if (!current) return;
  const list = flatOf(next);
  if (list.some(r => r.id === current.id)) order = list;
  else choose(list[0] ?? null, list);
}
function markAllRead() {
  shell.markSeen(...[...itemRows.value, ...noteRows.value].filter(r => r.unread).map(r => r.id));
}
// Dòng đứng sau dòng vừa xử lý trong thứ tự hiện; không có thì dòng đầu; hết dòng thì về nút lọc đang chọn.
function onDecided({ id, text }: { id: string; ok: boolean; text: string }) {
  status.value = text;
  const at = order.findIndex(r => r.id === id);
  const rest = order.filter(r => r.id !== id);
  choose(rest[at] ?? rest[0] ?? null, rest);
  if (selected.value) focusDetail();
  else focusFilter(filter.value);
}
// Esc và nút "Đóng chi tiết": có thẻ đang mở thì đóng thẻ và trả focus về dòng đó, không thì đóng ngăn kéo.
function closeTop() {
  const current = selected.value;
  if (!current) return emit('close');
  selected.value = null;
  nextTick(() => root.value?.querySelector<HTMLElement>(`[data-id="${current.id}"]`)?.focus());
}

let unregisterFocus = () => {};
let narrowQuery: MediaQueryList | null = null;
const onNarrow = (event: MediaQueryListEvent) => {
  narrow.value = event.matches;
};
onMounted(() => {
  narrowQuery = window.matchMedia('(max-width: 899px)');
  narrow.value = narrowQuery.matches;
  narrowQuery.addEventListener('change', onNarrow);
  lockScroll();
  if (!root.value) return;
  // registerOverlayFocus nhớ nút đã mở chuông (để trả focus khi đóng) rồi đưa focus vào phần tử đầu tiên, là nút
  // "Đánh dấu đã đọc"; Enter thêm một lần sẽ xoá mọi chấm chưa đọc. Nên focus đầu tiên đặt ở nút lọc đang chọn.
  unregisterFocus = registerOverlayFocus(root.value, closeTop, () => true);
  root.value.querySelector<HTMLElement>(`[data-filter="${filter.value}"]`)?.focus();
});
onBeforeUnmount(() => {
  narrowQuery?.removeEventListener('change', onNarrow);
  unregisterFocus();
  unlockScroll();
});
</script>

<template>
  <div class="bd-root">
    <div class="bd-scrim" @click="emit('close')" />
    <aside ref="root" class="bd" role="dialog" aria-modal="true" aria-label="Thông báo" tabindex="-1">
      <div class="bd-h" :inert="covered">
        <h2>Thông báo</h2>
        <button type="button" class="bd-mk" @click="markAllRead">Đánh dấu đã đọc</button>
        <button type="button" class="bd-x" aria-label="Đóng" @click="emit('close')">
          <svg
            aria-hidden="true"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            v-html="CLOSE_ICON"
          />
        </button>
      </div>

      <div class="bd-flt" :inert="covered">
        <div class="bd-fl" role="group" aria-label="Lọc thông báo">
          <button
            v-for="f in FILTERS"
            :key="f.key"
            type="button"
            class="bd-fi"
            :class="{ on: filter === f.key }"
            :data-filter="f.key"
            :aria-pressed="filter === f.key"
            @click="setFilter(f.key)"
          >
            {{ f.label }} <span class="bd-fc">{{ counts[f.key] }}</span>
          </button>
        </div>
      </div>

      <div
        class="bd-body"
        tabindex="0"
        role="region"
        aria-label="Danh sách thông báo, cuộn để xem thêm"
        :inert="covered"
      >
        <template v-for="g in shown" :key="g.key">
          <h3 v-if="filter !== 'sys'" class="bd-grp">
            {{ g.label }} <span class="bd-gn">{{ g.rows.length }}</span>
          </h3>
          <button
            v-for="r in g.rows"
            :key="r.id"
            type="button"
            class="bd-row"
            :class="{ on: selected?.id === r.id }"
            :data-id="r.id"
            :aria-current="selected?.id === r.id ? 'true' : undefined"
            :aria-label="`${r.title}, ${r.line2}`"
            @click="select(r)"
          >
            <i v-if="isUnread(r)" class="bd-ud" aria-hidden="true" />
            <span class="bd-ic" aria-hidden="true">
              <svg
                aria-hidden="true"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.8"
                stroke-linecap="round"
                stroke-linejoin="round"
                v-html="BELL_ICONS[r.group]"
              />
            </span>
            <span class="bd-tx">
              <span class="bd-hd">
                <span class="bd-nm">{{ r.title }}</span>
                <span class="bd-ag">{{ r.age }}</span>
              </span>
              <span class="bd-mt">{{ r.line2 }}</span>
            </span>
          </button>
        </template>
        <p v-if="data && !flat.length" class="bd-empty">{{ EMPTY[filter] }}</p>
      </div>

      <div class="sr-only"><span aria-live="polite">{{ status }}</span></div>

      <BellDetail
        v-if="selected"
        :key="selected.id"
        :item="selected.item"
        :news="selected.news"
        :group="selected.groupLabel"
        @decided="onDecided"
        @close="closeTop"
        @leave="emit('leave')"
      />
    </aside>
  </div>
</template>

<style scoped>
.bd-scrim {
  position: fixed;
  inset: 0;
  z-index: 60;
  background: color-mix(in srgb, var(--surface-dark) 32%, transparent);
}
.bd {
  position: fixed;
  top: 16px;
  right: 16px;
  bottom: 16px;
  z-index: 61;
  box-sizing: border-box;
  width: 440px;
  max-width: calc(100vw - 32px);
  display: flex;
  flex-direction: column;
  background: var(--surface);
  border-radius: 24px;
  color: var(--text);
  outline: none;
}
.bd-h {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 20px 16px 12px 24px;
}
.bd-h h2 {
  margin: 0;
  flex-grow: 1;
  font-size: 18px;
  line-height: 24px;
  font-weight: 600;
}
.bd-mk {
  border: 0;
  padding: 4px;
  background: transparent;
  font: inherit;
  font-size: 13px;
  color: var(--text);
  text-decoration: underline;
  text-underline-offset: 3px;
  cursor: pointer;
  white-space: nowrap;
}
.bd-x {
  width: 36px;
  height: 36px;
  display: grid;
  place-items: center;
  border: 0;
  border-radius: var(--r-ctl);
  background: transparent;
  color: var(--muted);
  cursor: pointer;
}
/* 3 mục lọc trên một hàng: rãnh xám nhạt, mục đang chọn nền đen chữ trắng, số vàng. */
.bd-flt {
  padding: 0 24px 8px;
}
.bd-fl {
  display: inline-flex;
  gap: 2px;
  padding: 4px;
  border-radius: var(--r-ctl);
  background: var(--ground);
}
.bd-fi {
  flex: none;
  height: 32px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 0 10px;
  box-sizing: border-box;
  border: 1px solid transparent;
  border-radius: 6px;
  background: transparent;
  color: #424242;
  font: inherit;
  font-size: 13px;
  white-space: nowrap;
  cursor: pointer;
}
.bd-fi:hover {
  color: var(--text);
}
.bd-fc {
  color: #757575;
}
.bd-fi.on {
  background: var(--primary);
  color: var(--on-primary);
  font-weight: 500;
}
.bd-fi.on .bd-fc {
  color: var(--gold);
  font-weight: 600;
}
.bd-body {
  flex: 1 1 0;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-width: thin;
  padding: 4px 12px 12px;
}
.bd-grp {
  position: sticky;
  top: 0;
  z-index: 1;
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0;
  padding: 16px 12px 4px;
  background: var(--surface);
  font-size: 12px;
  line-height: 16px;
  font-weight: 600;
  color: var(--muted);
}
.bd-gn {
  font-weight: 400;
}
/* Dòng: biểu tượng loại, dòng 1 đậm + tuổi, dòng 2 xám; chấm xanh = tin chưa đọc. */
.bd-row {
  position: relative;
  width: 100%;
  min-height: 56px;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 12px;
  border: 0;
  border-radius: 12px;
  background: transparent;
  font: inherit;
  color: var(--text);
  text-align: left;
  cursor: pointer;
}
.bd-row:hover {
  background: var(--ground);
}
.bd-row.on {
  background: var(--gold-pale);
}
.bd-row.on .bd-nm {
  text-decoration: underline;
  text-underline-offset: 3px;
}
.bd-ud {
  position: absolute;
  left: 2px;
  top: 50%;
  width: 6px;
  height: 6px;
  margin-top: -3px;
  border-radius: 50px;
  background: var(--status-done);
}
.bd-ic {
  width: 32px;
  height: 32px;
  flex: none;
  border-radius: 50px;
  display: grid;
  place-items: center;
  background: var(--ground);
  color: var(--text);
}
.bd-tx {
  flex: 1 1 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.bd-hd {
  display: flex;
  align-items: baseline;
  gap: 8px;
}
.bd-nm {
  flex: 1 1 auto;
  min-width: 0;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.bd-ag,
.bd-mt {
  font-size: 12px;
  line-height: 16px;
  color: var(--muted);
}
.bd-ag {
  flex: none;
}
.bd-empty {
  margin: 48px 12px;
  text-align: center;
  color: var(--muted);
}
.bd-mk:focus-visible,
.bd-x:focus-visible,
.bd-body:focus-visible {
  outline: 2px solid var(--text);
  outline-offset: 2px;
}
.bd-fi:focus-visible,
.bd-row:focus-visible {
  outline: 2px solid var(--text);
  outline-offset: -2px;
}
</style>
