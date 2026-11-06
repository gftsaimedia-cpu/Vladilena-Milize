<script setup lang="ts">
// Thẻ Việc cần duyệt (bảng thiết kế Main): đúng danh sách "Cần duyệt" của chuông, nhóm như chuông, cuộn trong thẻ.
// Bấm dòng hoặc nút Từ chối mở cửa sổ phê duyệt (ApprovalDialog); nút Duyệt duyệt ngay (báo lên màn qua emit).
// Quên chấm công không có Từ chối / Duyệt, chỉ có dấu ›.
// "Xem tất cả" mở ngăn kéo chuông ngay trên Tổng quan (?hop=chuong, giữ ?thang).
// Sau khi xử lý, focus về dòng đang ở cùng vị trí (nút Duyệt nếu bấm Duyệt, nút mở nếu xử lý trong cửa sổ),
// không còn dòng đó thì về dòng cuối; hết dòng thì về "Xem tất cả".
import { computed, nextTick, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { CHEVRON_ICON } from '@/components/shell/bell-icons';
import { bellRowTitle, personLine } from '@/components/shell/bell-rows';
import { toast } from '@/components/shell/toast';
import Icon from '@/components/ui/Icon.vue';
import { INBOX_GROUPS } from '@/constants/labels';
import type { InboxItem } from '@/mock/inbox';
import type { OverviewView } from '@/mock/overview';
import ApprovalDialog from './ApprovalDialog.vue';

const props = defineProps<{ approvals: OverviewView['approvals'] }>();
const emit = defineEmits<{ approve: [id: string] }>();

const route = useRoute();
const bellLink = () => ({
  path: '/admin/tong-quan',
  query: { ...(route.query.thang ? { thang: route.query.thang } : {}), hop: 'chuong' }
});

// Thứ tự và nhãn nhóm lấy từ INBOX_GROUPS, như ngăn kéo chuông; nhóm rỗng thì ẩn.
const groups = computed(() =>
  INBOX_GROUPS.map(g => ({
    key: g.key,
    label: g.label,
    // Số đếm của nhóm do máy chủ tính (danh sách chỉ có vài việc đầu).
    count: props.approvals.groups.find(x => x.key === g.key)?.count ?? 0,
    rows: props.approvals.items.filter(r => r.group === g.key)
  })).filter(g => g.rows.length)
);
const flat = computed(() => groups.value.flatMap(g => g.rows));

const root = ref<HTMLElement | null>(null);

// Việc đang chờ danh sách đổi để đặt lại focus: vị trí lúc bấm, id, và nút nào nhận focus.
let pending: { index: number; id: string; kind: 'yes' | 'open' } | null = null;
async function settleFocus() {
  const wait = pending;
  if (!wait || props.approvals.items.some(r => r.id === wait.id)) return;
  pending = null;
  const index = Math.min(wait.index, flat.value.length - 1);
  await nextTick();
  if (index < 0) {
    root.value?.querySelector<HTMLElement>('.all')?.focus();
    return;
  }
  const row = root.value?.querySelectorAll<HTMLElement>('li.ap-row')[index];
  const target = (wait.kind === 'yes' && row?.querySelector<HTMLElement>('.ib.yes')) || row?.querySelector<HTMLElement>('.apo');
  target?.focus();
}
watch(() => props.approvals.items, settleFocus);

function approve(id: string) {
  pending = { index: flat.value.findIndex(r => r.id === id), id, kind: 'yes' };
  emit('approve', id);
}

// Cửa sổ phê duyệt: việc đang mở, vị trí lúc mở, có đưa focus vào ô ghi chú không.
const open = ref<{ item: InboxItem; index: number; note: boolean } | null>(null);
function openDialog(id: string, note: boolean) {
  const index = flat.value.findIndex(r => r.id === id);
  if (index >= 0) open.value = { item: flat.value[index], index, note };
}
async function onDecided({ id, ok, text }: { id: string; ok: boolean; text: string }) {
  const at = open.value?.index ?? 0;
  open.value = null;
  if (ok) toast.ok(text);
  else toast.error(text);
  pending = { index: at, id, kind: 'open' };
  await nextTick();
  settleFocus();
}
</script>

<template>
  <section ref="root" class="card ap" aria-labelledby="ov-ap-h">
    <div class="head">
      <h2 id="ov-ap-h">Việc cần duyệt</h2>
      <span class="count">{{ approvals.total }}</span>
      <RouterLink :to="bellLink()" class="link all">Xem tất cả</RouterLink>
    </div>

    <div v-if="flat.length" class="queue" tabindex="0" role="region" aria-label="Việc cần duyệt, cuộn để xem thêm">
      <template v-for="g in groups" :key="g.key">
        <h3 class="apg">
          {{ g.label }} <span class="gn">{{ g.count }}</span>
        </h3>
        <ul :aria-label="g.label">
          <li v-for="r in g.rows" :key="r.id" class="ap-row">
            <button
              type="button"
              class="apo"
              :aria-label="`Mở cửa sổ duyệt: ${bellRowTitle(r)}, ${personLine(r)}`"
              @click="openDialog(r.id, false)"
            >
              <span class="ap-av" aria-hidden="true">{{ r.initials }}</span>
              <span class="tx">
                <span class="nm">{{ r.name }}</span>
                <span class="l2">{{ bellRowTitle(r) }}</span>
              </span>
              <span v-if="r.action === 'remind'" class="ap-chev" aria-hidden="true">
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  v-html="CHEVRON_ICON"
                />
              </span>
            </button>
            <span v-if="r.action === 'decide'" class="acts">
              <button
                type="button"
                class="ib no"
                :aria-label="`Từ chối yêu cầu của ${r.name}`"
                @click="openDialog(r.id, true)"
              >
                <Icon name="x" :size="16" />
              </button>
              <button type="button" class="ib yes" :aria-label="`Duyệt yêu cầu của ${r.name}`" @click="approve(r.id)">
                <Icon name="check" :size="16" />
              </button>
            </span>
          </li>
        </ul>
      </template>
    </div>
    <p v-else class="empty">Không còn yêu cầu nào chờ duyệt.</p>

    <ApprovalDialog
      v-if="open"
      :key="open.item.id"
      :item="open.item"
      :focus-note="open.note"
      @decided="onDecided"
      @close="open = null"
      @leave="open = null"
    />
  </section>
</template>

<style scoped>
.ap {
  padding: 24px 24px 8px;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.head {
  display: flex;
  align-items: center;
  gap: 8px;
}
h2 {
  margin: 0;
  font-size: 18px;
  line-height: 24px;
  font-weight: 600;
}
.count {
  min-width: 24px;
  height: 24px;
  padding: 0 8px;
  border-radius: var(--r-pill);
  display: inline-grid;
  place-items: center;
  background: var(--surface-dark);
  color: #fff;
  font-size: 12px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.all {
  margin-left: auto;
  font-size: 14px;
}
/* Danh sách tự lấp phần cao còn lại của thẻ (thẻ cao theo hai thẻ bên cạnh) và cuộn bên trong;
   lề âm kéo thanh cuộn ra sát mép thẻ. */
.queue {
  flex: 1 1 0;
  min-height: 240px;
  margin: 0 -24px;
  padding: 0 24px;
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-width: thin;
}
.queue:focus-visible {
  outline: 2px solid var(--text);
  outline-offset: -2px;
}
.queue ul {
  margin: 0;
  padding: 0;
  list-style: none;
}
.apg {
  position: sticky;
  top: 0;
  z-index: 1;
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0;
  padding: 12px 0 4px;
  background: var(--surface, #fff);
  font-size: 12px;
  line-height: 16px;
  font-weight: 600;
  color: var(--muted);
}
.gn {
  font-weight: 400;
}
.ap-row {
  display: flex;
  align-items: center;
  gap: 12px;
  border-bottom: 1px solid var(--border);
}
.apo {
  flex: 1 1 0;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 0;
  border: 0;
  background: transparent;
  font: inherit;
  color: var(--text);
  text-align: left;
  cursor: pointer;
}
.apo:hover .nm {
  text-decoration: underline;
  text-underline-offset: 3px;
}
.apo:focus-visible {
  outline: 2px solid var(--text);
  outline-offset: -2px;
  border-radius: var(--r-ctl);
}
.ap-av {
  width: 36px;
  height: 36px;
  flex: none;
  border-radius: 50px;
  display: grid;
  place-items: center;
  background: var(--status-draft);
  font-size: 12px;
  font-weight: 600;
}
.tx {
  flex: 1 1 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.nm {
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.l2 {
  font-size: 12px;
  line-height: 16px;
  color: var(--muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.ap-chev {
  width: 40px;
  height: 40px;
  flex: none;
  display: grid;
  place-items: center;
  color: var(--muted);
}
.acts {
  flex: none;
  display: flex;
  gap: 8px;
}
.ib {
  width: 40px;
  height: 40px;
  border-radius: var(--r-ctl);
  display: grid;
  place-items: center;
  cursor: pointer;
}
.ib.no {
  background: var(--surface);
  color: var(--text);
  border: 1px solid var(--control);
}
.ib.yes {
  background: #000;
  color: #fff;
  border: 1px solid #000;
}
.empty {
  margin: 0;
  padding: 24px 0;
  border-top: 1px solid var(--rule);
  font-size: 14px;
  color: var(--muted);
  text-align: center;
}
/* Cùng mốc 1280px với .trio của OverviewView: dưới mốc, các thẻ xếp một cột, danh sách cao tối đa 420px. */
@media (max-width: 1280px) {
  .queue {
    flex: none;
    min-height: 0;
    max-height: 420px;
  }
}
@media (max-width: 480px) {
  .ap {
    padding: 20px 16px 8px;
  }
  .queue {
    margin: 0 -16px;
    padding: 0 16px;
  }
}
</style>
