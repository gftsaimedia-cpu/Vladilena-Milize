<script setup lang="ts">
// J4 · Yêu cầu của tôi (spec 7.1): h1 + nút "Tạo yêu cầu", thanh lọc trạng thái, danh sách nhóm theo tháng gửi.
// Bấm dòng mở J5 theo ?yc=<id> (router.replace); id lạ thì bỏ khỏi URL, không mở gì (spec 3.8).
// Tab đang chọn chỉ nằm trong ref của màn, không lên URL: đổi ?yc không tải lại danh sách và không dựng lại dòng.
import { computed, nextTick, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { toast } from '@/components/shell/toast';
import type { RequestDetail, RequestsView } from '@/mock/staff-phone';
import { getRequest, getRequests } from '@/services/staff-phone';
import PhIcon from './components/PhIcon.vue';
import RequestRow from './components/RequestRow.vue';
import RequestSheet from './components/RequestSheet.vue';

type Filter = 'all' | 'pend' | 'done' | 'rej';
const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'Tất cả' },
  { key: 'pend', label: 'Chờ duyệt' },
  { key: 'done', label: 'Đã duyệt' },
  { key: 'rej', label: 'Từ chối' }
];

const route = useRoute();
const router = useRouter();
const data = ref<RequestsView | null>(null);
getRequests().then(v => (data.value = v));

const root = ref<HTMLElement | null>(null);
const tab = ref<Filter>('all');
const tabEls = ref<HTMLElement[]>([]);
const groups = computed(() =>
  (data.value?.groups ?? [])
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

// Hộp J5: mở theo ?yc=. Kết quả của lần đọc cũ bị bỏ nếu ?yc đã đổi trong lúc chờ.
const detail = ref<RequestDetail | null>(null);
const dropYc = () => {
  const { yc: _yc, ...rest } = route.query;
  router.replace({ query: rest });
};
watch(
  () => route.query.yc,
  async yc => {
    if (!yc) {
      detail.value = null;
      return;
    }
    const id = String(yc);
    const found = await getRequest(id);
    if (String(route.query.yc ?? '') !== id) return;
    if (found) detail.value = found;
    else {
      detail.value = null;
      dropYc();
    }
  },
  { immediate: true }
);
// Hộp mở từ màn khác (J1) thì dòng mở hộp đã không còn để trả focus: đóng xong mà focus rơi xuống <body> thì đưa về dòng của yêu cầu đó.
async function closeSheet() {
  const id = detail.value?.id;
  detail.value = null;
  if (route.query.yc) dropYc();
  await nextTick();
  const a = document.activeElement;
  if (id && (!a || a === document.body)) root.value?.querySelector<HTMLElement>(`a.ro[data-yc="${id}"]`)?.focus();
}
</script>

<template>
  <div ref="root" class="ph rq">
    <header class="sh">
      <h1>Yêu cầu</h1>
      <button type="button" class="rq-add" @click="toast.warnings(['Chưa có luồng tạo yêu cầu trong bản mockup.'])">
        <PhIcon name="plus" :size="18" :stroke="2" />Tạo yêu cầu
      </button>
    </header>
    <template v-if="data">
      <div class="rq-tabs" role="tablist" aria-label="Lọc theo trạng thái">
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
          {{ f.label }} {{ data.counts[f.key] }}
        </button>
      </div>
      <div id="rq-panel" class="rq-panel" role="tabpanel" :aria-labelledby="`rq-tab-${tab}`">
        <section v-for="g in groups" :key="g.month" class="rq-group">
          <div class="rq-gh">{{ g.label }}</div>
          <div class="card ls">
            <RequestRow v-for="r in g.rows" :key="r.id" :row="r" replace />
          </div>
        </section>
      </div>
    </template>
    <RequestSheet v-if="detail" :request="detail" @close="closeSheet" />
  </div>
</template>

<style scoped>
.rq-add {
  height: 40px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 0 14px 0 10px;
  border-radius: 8px;
  border: 0;
  background: var(--surface-dark);
  color: #ffffff;
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}
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
