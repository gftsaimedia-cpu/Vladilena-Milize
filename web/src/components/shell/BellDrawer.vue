<script setup lang="ts">
// Ngăn kéo "Thông báo" mở từ chuông trên thanh trên: mỗi việc chờ xử lý một dòng, bấm mới mở thẻ chi tiết (InboxDetail).
// Hợp đồng: không props; emit('close') khi đóng (bấm nền, nút Đóng, Esc, hoặc đi tới màn khác).
// Danh sách đọc từ nguồn việc chung và tải lại mỗi khi useShellStore().version đổi.
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';
import { useRoute } from 'vue-router';
import { lockScroll, registerOverlayFocus, unlockScroll } from '@/components/ui/overlay-lock';
import { useLoad } from '@/composables/useLoad';
import { INBOX_GROUPS } from '@/constants/labels';
import type { InboxItem } from '@/mock/inbox';
import { getInbox } from '@/services/admin-main';
import { useShellStore } from '@/stores/shell';
import InboxDetail from './InboxDetail.vue';

const emit = defineEmits(['close']);
const IDLE = 'Bấm một yêu cầu để xem chi tiết.';

const shell = useShellStore();
const route = useRoute();
const { data } = useLoad(getInbox, () => shell.version);

const root = ref<HTMLElement | null>(null);
const needTab = ref<HTMLElement | null>(null);
const tab = ref<'need' | 'sys'>('need');
const status = ref(IDLE);
// Giữ nguyên bản việc đang chọn: thẻ chi tiết còn đó cho tới khi xử lý xong, dù danh sách đã tải lại.
const selected = shallowRef<InboxItem | null>(null);
// Thứ tự hiện lúc việc đang chọn còn trong danh sách, để chọn việc kế tiếp kể cả khi danh sách đã đổi.
let order: InboxItem[] = [];
// Màn hẹp (dưới 840px): thẻ chi tiết phủ lên ngăn kéo, nên phần ngăn kéo bị che phải `inert` để Tab không chui vào nút ẩn.
const narrow = ref(false);
const covered = computed(() => narrow.value && !!selected.value);

const items = computed<InboxItem[]>(() => data.value?.items ?? []);
const notes = computed(() => data.value?.notes ?? []);
const groups = computed(() =>
  INBOX_GROUPS.map(g => ({ ...g, items: items.value.filter(i => i.group === g.key) })).filter(g => g.items.length)
);
const flat = computed(() => groups.value.flatMap(g => g.items));

watch(flat, list => {
  if (selected.value && list.some(i => i.id === selected.value!.id)) order = list;
});

const rowLabel = (i: InboxItem) => `${i.name}, ${i.groupLabel}: ${i.what}${i.when ? ' ' + i.when : ''}`;
const thang = () => (route.query.thang ? { thang: route.query.thang } : {});

const focusDetail = () => nextTick(() => root.value?.querySelector<HTMLElement>('.idetail')?.focus());

function select(item: InboxItem) {
  order = flat.value;
  selected.value = item;
  focusDetail();
}
function showTab(next: 'need' | 'sys') {
  tab.value = next;
  selected.value = null;
}
// Việc đứng sau việc vừa xử lý trong thứ tự hiện; không có thì việc đầu; hết việc thì về tab "Cần duyệt".
function onDecided({ id, text }: { id: string; ok: boolean; text: string }) {
  status.value = text;
  const at = order.findIndex(i => i.id === id);
  order = order.filter(i => i.id !== id);
  selected.value = order[at] ?? order[0] ?? null;
  if (selected.value) focusDetail();
  else nextTick(() => needTab.value?.focus());
}
// Esc và nút "Đóng chi tiết": có việc đang chọn thì bỏ chọn và trả focus về dòng đó, không thì đóng ngăn kéo.
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
  narrowQuery = window.matchMedia('(max-width: 839px)');
  narrow.value = narrowQuery.matches;
  narrowQuery.addEventListener('change', onNarrow);
  lockScroll();
  if (root.value) unregisterFocus = registerOverlayFocus(root.value, closeTop, () => true);
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
      <header class="bd-h" :inert="covered">
        <h2>Thông báo</h2>
        <button type="button" class="btn sm" @click="emit('close')">Đóng</button>
      </header>

      <div class="bd-tabs" role="tablist" aria-label="Loại thông báo" :inert="covered">
        <button
          id="bd-tab-need"
          ref="needTab"
          type="button"
          role="tab"
          aria-controls="bd-panel"
          :aria-selected="tab === 'need'"
          @click="showTab('need')"
        >
          Cần duyệt <span v-if="items.length" class="n">{{ items.length }}</span>
        </button>
        <button
          id="bd-tab-sys"
          type="button"
          role="tab"
          aria-controls="bd-panel"
          :aria-selected="tab === 'sys'"
          @click="showTab('sys')"
        >
          Tin hệ thống · {{ notes.length }}
        </button>
      </div>

      <div id="bd-panel" class="bd-body" role="tabpanel" :aria-labelledby="`bd-tab-${tab}`" :inert="covered">
        <template v-if="tab === 'need'">
          <p v-if="data && !flat.length" class="bd-empty">Không còn yêu cầu nào chờ duyệt.</p>
          <section v-for="g in groups" :key="g.key" class="bd-grp">
            <h3>
              {{ g.label }} <span>{{ g.items.length }}</span>
            </h3>
            <ul>
              <li v-for="item in g.items" :key="item.id">
                <button
                  type="button"
                  class="row"
                  :class="{ on: selected?.id === item.id }"
                  :data-id="item.id"
                  :aria-pressed="selected?.id === item.id"
                  :aria-label="rowLabel(item)"
                  @click="select(item)"
                >
                  <span class="av">{{ item.initials }}</span>
                  <span class="tx">
                    <b>{{ item.name }}</b>
                    <small>{{ item.what }}<template v-if="item.when"> · {{ item.when }}</template></small>
                  </span>
                  <span class="age">{{ item.age }}</span>
                </button>
              </li>
            </ul>
          </section>
        </template>
        <ul v-else class="notes">
          <li v-for="note in notes" :key="note.id">
            <span>{{ note.text }}</span>
            <small>{{ note.when }}</small>
          </li>
        </ul>
      </div>

      <footer class="bd-f" :inert="covered">
        <p class="bd-status" aria-live="polite">{{ status }}</p>
        <RouterLink :to="{ path: '/admin/yeu-cau', query: thang() }" class="link">Mở trang Yêu cầu</RouterLink>
      </footer>

      <div v-if="selected" class="bd-detail">
        <InboxDetail :key="selected.id" :item="selected" @decided="onDecided" @close="closeTop" @profile="emit('close')" />
      </div>
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
  width: 400px;
  display: flex;
  flex-direction: column;
  background: var(--surface);
  border-radius: 24px;
  outline: none;
}
.bd-h {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 24px 12px;
}
.bd-h h2 {
  margin: 0;
  font-size: 18px;
  line-height: 28px;
  font-weight: 600;
}
.bd-tabs {
  display: flex;
  gap: 24px;
  padding: 0 24px;
  border-bottom: 1px solid var(--rule);
}
.bd-tabs button {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 0 0 12px;
  margin-bottom: -1px;
  border: 0;
  border-bottom: 2px solid transparent;
  background: none;
  font: inherit;
  font-size: 14px;
  font-weight: 500;
  color: var(--muted);
  cursor: pointer;
}
.bd-h .btn:focus-visible,
.bd-tabs button:focus-visible,
.bd-f .link:focus-visible {
  outline: 2px solid var(--text);
  outline-offset: 2px;
}
.row:focus-visible {
  outline: 2px solid var(--text);
  outline-offset: -2px;
}
.bd-tabs button[aria-selected='true'] {
  color: var(--text);
  border-bottom-color: var(--text);
}
.n {
  min-width: 20px;
  height: 20px;
  padding: 0 6px;
  box-sizing: border-box;
  border-radius: var(--r-pill);
  display: inline-grid;
  place-items: center;
  background: var(--gold);
  color: var(--text);
  font-size: 12px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.bd-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 8px 12px;
}
.bd-empty {
  margin: 0;
  padding: 32px 12px;
  text-align: center;
  font-size: 14px;
  color: var(--muted);
}
.bd-grp h3 {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 12px 12px 4px;
  font-size: 12px;
  line-height: 16px;
  font-weight: 600;
  color: var(--muted);
}
ul {
  list-style: none;
  margin: 0;
  padding: 0;
}
.row {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  min-height: 56px;
  padding: 8px 12px;
  box-sizing: border-box;
  border: 0;
  border-radius: 12px;
  background: none;
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.row:hover {
  background: var(--raised);
}
.row.on {
  background: var(--gold-pale);
}
.tx {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.tx b {
  font-size: 14px;
  line-height: 20px;
  font-weight: 500;
  color: var(--text);
}
.tx small,
.age {
  font-size: 12px;
  line-height: 16px;
  color: var(--muted);
}
.tx b,
.tx small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.age {
  flex: none;
}
.notes li {
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 14px;
  line-height: 20px;
}
.notes small {
  font-size: 12px;
  color: var(--muted);
}
.bd-f {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 24px 16px;
  border-top: 1px solid var(--rule);
  font-size: 12px;
}
.bd-status {
  margin: 0;
  min-width: 0;
  color: var(--muted);
}
.bd-detail {
  position: fixed;
  top: 16px;
  right: 428px;
  box-sizing: border-box;
  width: 380px;
  max-height: calc(100vh - 32px);
  overflow-y: auto;
  padding: 20px 24px 24px;
  background: var(--surface);
  border-radius: 24px;
}
@media (max-width: 839px) {
  .bd {
    left: 16px;
    width: auto;
  }
  .bd-detail {
    left: 16px;
    right: 16px;
    bottom: 16px;
    width: auto;
    max-height: none;
  }
}
</style>
