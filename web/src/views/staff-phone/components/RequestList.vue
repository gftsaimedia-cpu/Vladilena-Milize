<script setup lang="ts">
// Thanh lọc trạng thái + danh sách yêu cầu nhóm theo tháng gửi (J4 mục 7.1, K1 cột 1). Dùng ở RequestsView và TodayColumn.
// Tab đang chọn chỉ nằm trong ref của component, không lên URL. Hai gốc (tablist, tabpanel) nên nằm thẳng trong cột flex của màn cha.
// scrollLabel: máy tính (D15) — tabpanel tự cuộn, có tên riêng và tabindex 0; không có thì tabpanel đặt tên theo tab đang chọn (điện thoại).
// Đơn đã huỷ (status 'cancel', chấm xám) không có tab riêng: chỉ nằm trong "Tất cả" (spec staff-requests 4.6).
//   <RequestList :view="data" tablist-label="Lọc theo trạng thái" replace />
import { computed, nextTick, ref } from 'vue';
import type { RequestsView } from '@/mock/staff-phone';
import RequestRow from './RequestRow.vue';

type Filter = 'all' | 'pend' | 'done' | 'rej';
const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'Tất cả' },
  { key: 'pend', label: 'Chờ duyệt' },
  { key: 'done', label: 'Đã duyệt' },
  { key: 'rej', label: 'Từ chối' }
];

const props = withDefaults(
  defineProps<{ view: RequestsView; tablistLabel: string; scrollLabel?: string; replace?: boolean }>(),
  { scrollLabel: undefined, replace: false }
);

const tab = ref<Filter>('all');
const tabEls = ref<HTMLElement[]>([]);
const groups = computed(() =>
  props.view.groups
    .map(g => ({ ...g, rows: g.rows.filter(r => tab.value === 'all' || r.status === tab.value) }))
    .filter(g => g.rows.length)
);

function pick(i: number, focus = false) {
  tab.value = FILTERS[i].key;
  if (focus) nextTick(() => tabEls.value[i]?.focus());
}
function onTabKey(e: KeyboardEvent, i: number) {
  const n = FILTERS.length;
  const to = { ArrowRight: (i + 1) % n, ArrowLeft: (i + n - 1) % n, Home: 0, End: n - 1 }[e.key];
  if (to === undefined) return;
  e.preventDefault();
  pick(to, true);
}
</script>

<template>
  <div class="rq-tabs" role="tablist" :aria-label="tablistLabel">
    <button
      v-for="(f, i) in FILTERS"
      :id="`rq-tab-${f.key}`"
      :key="f.key"
      :ref="el => (tabEls[i] = el as HTMLElement)"
      type="button"
      role="tab"
      class="rq-tab"
      :aria-selected="tab === f.key"
      aria-controls="rq-panel"
      :tabindex="tab === f.key ? 0 : -1"
      @click="pick(i)"
      @keydown="onTabKey($event, i)"
    >
      {{ f.label }} {{ view.counts[f.key] }}
    </button>
  </div>
  <div
    id="rq-panel"
    class="rq-panel"
    :class="{ 'rq-scroll': scrollLabel }"
    role="tabpanel"
    :aria-label="scrollLabel"
    :aria-labelledby="scrollLabel ? undefined : `rq-tab-${tab}`"
    :tabindex="scrollLabel ? 0 : undefined"
  >
    <section v-for="g in groups" :key="g.month" class="rq-group">
      <div class="rq-gh">{{ g.label }}</div>
      <div class="card ls">
        <RequestRow v-for="r in g.rows" :key="r.id" :row="r" :replace="replace" />
      </div>
    </section>
  </div>
</template>

<style scoped>
.rq-tabs {
  display: flex;
  gap: 4px;
  padding: 4px;
  border-radius: 50px;
  background: var(--surface);
}
.rq-tab {
  flex: 1 1 auto;
  height: 36px;
  padding: 0 6px;
  border: 0;
  border-radius: 50px;
  background: transparent;
  font: inherit;
  font-size: 13px;
  color: var(--muted);
  white-space: nowrap;
  cursor: pointer;
}
.rq-tab[aria-selected='true'] {
  background: var(--surface-dark);
  color: #ffffff;
  font-weight: 600;
}
/* min-width: 0 cho phép tab co lại dưới độ rộng chữ; màn dưới 360px thu đệm tab để chữ và số đếm vẫn đọc đủ trong thanh. */
.rq-tab {
  min-width: 0;
}
@media (max-width: 359px) {
  .rq-tab {
    padding: 0 3px;
  }
}
.rq-panel {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.rq-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.rq-gh {
  padding: 0 4px;
  font-size: 12px;
  line-height: 16px;
  font-weight: 600;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
</style>
