<script setup lang="ts">
// Tab Yêu cầu (board Q1–Q4, 06/11): mọi đơn nhân viên gửi, đơn chờ duyệt trước (cũ nhất trước), đơn đã xử lý sau.
// - Thẻ đếm là bộ lọc trạng thái đơn; cột trái lọc theo loại đơn (số cam = đơn đang chờ của loại đó).
// - Cặp bộ lọc nhân sự và ô "Lọc theo tên" lọc tại chỗ. Bộ lọc thuộc về màn, không ghi lên đường dẫn.
// - Duyệt ngay trên dòng; Từ chối mở ngăn chi tiết với ô ghi chú (bắt buộc khi từ chối).
// - ?don=<id> mở ngăn chi tiết, ?tuchoi=1 mở để ghi lý do từ chối; id không có thì bỏ cả hai khỏi đường dẫn.
// Duyệt / từ chối qua useShellStore().decide (cùng đường với chuông); màn tải lại theo shell.version.
import { computed, nextTick, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { toast } from '@/components/shell/toast';
import BulkButton from '@/components/select-mode/BulkButton.vue';
import ResultLine from '@/components/select-mode/ResultLine.vue';
import SelectBar from '@/components/select-mode/SelectBar.vue';
import { useSelectMode } from '@/components/select-mode/useSelectMode';
import StaffScopeFilter from '@/components/staff-scope/StaffScopeFilter.vue';
import { deptOptions, matchScope, useMineDepts, type StaffPst } from '@/components/staff-scope/staffScope';
import Icon from '@/components/ui/Icon.vue';
import {
  KIND_LABEL,
  KIND_ORDER,
  STATUS_DOT,
  STATUS_LABEL,
  type ReqKind,
  type ReqRow,
  type ReqStatus
} from '@/builders/api/admin-requests';
import { ALREADY_HANDLED, decisionText } from '@/services/admin-main';
import { getRequests } from '@/services/admin-requests';
import { useShellStore } from '@/stores/shell';
import { foldText } from '@/utils/format';
import LoadFail from '@/views/admin/settings/fields/LoadFail.vue';
import ReqDrawer from './parts/ReqDrawer.vue';
import ReqTable from './parts/ReqTable.vue';

type Tab = 'all' | ReqStatus;

const route = useRoute();
const router = useRouter();
const shell = useShellStore();

const all = ref<ReqRow[] | null>(null);
const failed = ref(false);
// Dòng vừa duyệt trên bảng: nút Duyệt biến mất nên focus chuyển sang nút Xem của chính dòng đó sau khi tải lại.
let focusAfter = '';

// Lần tải chồng nhau (duyệt liên tiếp, cập nhật trực tiếp): chỉ lần bắt đầu sau cùng được ghi, lần cũ xong muộn bị bỏ.
let loadSeq = 0;
async function load() {
  const mine = ++loadSeq;
  try {
    const rows = await getRequests();
    if (mine !== loadSeq) return;
    all.value = rows;
    failed.value = false;
  } catch {
    if (mine === loadSeq) failed.value = true;
    return;
  }
  if (focusAfter) {
    const id = focusAfter;
    focusAfter = '';
    nextTick(() => document.querySelector<HTMLElement>(`[data-req="${CSS.escape(id)}"] .rq-sb3`)?.focus());
  }
}
watch(() => shell.version, load, { immediate: true });

// ---------- Bộ lọc ----------
const tab = ref<Tab>('all');
const kind = ref<'all' | ReqKind>('all');
const pst = ref<StaffPst>('all');
const dept = ref('');
const q = ref('');
const mine = useMineDepts();

const rows = computed(() => all.value ?? []);
const depts = computed(() => deptOptions(rows.value));
const count = computed(() => {
  const c: Record<Tab, number> = { all: rows.value.length, pend: 0, ok: 0, rej: 0, cancel: 0 };
  for (const r of rows.value) c[r.status] += 1;
  return c;
});
const firstPend = computed(() => rows.value.find(r => r.status === 'pend'));
const TILES: [Tab, string][] = [
  ['all', 'Tất cả'],
  ['pend', 'Chờ duyệt'],
  ['ok', 'Đã duyệt'],
  ['rej', 'Từ chối'],
  ['cancel', 'Đã huỷ']
];
const tileSub = (t: Tab) =>
  ({
    all: 'cả đơn đã xử lý',
    pend: firstPend.value ? `cũ nhất từ ${firstPend.value.date}` : 'không còn đơn nào',
    ok: 'đã báo kết quả cho nhân viên',
    rej: 'kèm lý do cho nhân viên',
    cancel: 'nhân viên tự huỷ khi còn chờ'
  })[t];
const kinds = computed(() =>
  (['all', ...KIND_ORDER] as const).map(k => ({
    key: k,
    label: k === 'all' ? 'Tất cả loại' : KIND_LABEL[k],
    n: rows.value.filter(r => r.status === 'pend' && (k === 'all' || r.kind === k)).length
  }))
);

const shown = computed(() => {
  const f = foldText(q.value.trim());
  const scope = { pst: pst.value, dept: dept.value };
  return rows.value.filter(
    r =>
      (tab.value === 'all' || r.status === tab.value) &&
      (kind.value === 'all' || r.kind === kind.value) &&
      matchScope(r, scope, mine) &&
      (!f || foldText(r.name).includes(f))
  );
});

// ---------- Ngăn chi tiết theo ?don / ?tuchoi ----------
const openId = computed(() => (typeof route.query.don === 'string' ? route.query.don : ''));
const current = computed(() => (openId.value ? (rows.value.find(r => r.id === openId.value) ?? null) : null));
const rejecting = computed(() => route.query.tuchoi === '1' && current.value?.status === 'pend');

function setQuery(patch: Record<string, string | undefined>) {
  const query: Record<string, any> = { ...route.query, ...patch };
  for (const k of Object.keys(query)) if (query[k] === undefined) delete query[k];
  router.replace({ query });
}
// Đường dẫn sai: ?don không khớp đơn nào thì bỏ ?don và ?tuchoi; ?tuchoi không dùng được (đơn đã xử lý, không có ?don) thì bỏ ?tuchoi.
watch(
  [all, () => route.query.don, () => route.query.tuchoi],
  () => {
    if (!all.value) return;
    if (route.query.don !== undefined && !current.value) setQuery({ don: undefined, tuchoi: undefined });
    else if (route.query.tuchoi !== undefined && !rejecting.value) setQuery({ tuchoi: undefined });
  },
  { immediate: true }
);
const open = (r: ReqRow, reject = false) => setQuery({ don: r.id, tuchoi: reject ? '1' : undefined });
const close = () => setQuery({ don: undefined, tuchoi: undefined });

// ---------- Duyệt / từ chối ----------
const busyId = ref<string | null>(null);
async function decide(r: ReqRow, verb: 'approve' | 'reject', note?: string): Promise<boolean> {
  if (busyId.value) return false;
  busyId.value = r.id;
  try {
    const hit = await shell.decide(r.id, verb, note);
    if (hit) toast.ok(decisionText(verb, r.name));
    else toast.warnings([ALREADY_HANDLED]);
    return !!hit;
  } catch {
    // Lỗi của máy chủ đã hiện nguyên văn (services/admin-main); đơn giữ nguyên trạng thái.
    return false;
  } finally {
    busyId.value = null;
  }
}
async function approveRow(r: ReqRow) {
  focusAfter = r.id;
  if (!(await decide(r, 'approve'))) focusAfter = '';
}
async function onDecide(d: { verb: 'approve' | 'reject'; note?: string }) {
  const r = current.value;
  if (!r) return;
  await decide(r, d.verb, d.note);
  if (route.query.tuchoi !== undefined) setQuery({ tuchoi: undefined });
}

// ---------- Duyệt nhiều đơn (board Q5) ----------
// Chỉ đơn chờ đang hiện chọn được; Từ chối vẫn làm ở từng đơn vì cần ghi lý do. Đếm và gửi đi chỉ các đơn chờ đang hiện.
const sel = useSelectMode<'approve'>();
const result = ref('');
const approving = ref(false);
// Đơn chờ mà máy chủ không cho duyệt (approveBlock) không vào Duyệt nhiều đơn.
const pendShown = computed(() => shown.value.filter(r => r.status === 'pend' && !r.approveBlock).map(r => r.id));
const chosen = computed(() => sel.pickedIn(pendShown.value));
function startBulk() {
  result.value = '';
  sel.enter('approve');
}
async function runBulk() {
  const ids = chosen.value;
  if (!ids.length || approving.value) return;
  approving.value = true;
  let done = 0;
  let gone = 0;
  try {
    for (const id of ids) {
      if (await shell.decide(id, 'approve')) done += 1;
      else gone += 1;
    }
    result.value = gone ? `Đã duyệt ${done} đơn. ${gone} đơn đã được xử lý trước đó.` : `Đã duyệt ${done} đơn.`;
    sel.quit();
  } catch (e) {
    // Lỗi của máy chủ đã hiện nguyên văn; báo thêm số đơn đã duyệt trước khi lỗi, giữ chế độ chọn để làm tiếp.
    if (done) toast.error(`Đã duyệt ${done} đơn, rồi dừng vì lỗi: ${(e as Error).message}`);
  } finally {
    approving.value = false;
  }
}
</script>

<template>
  <div>
    <div class="title">
      <div>
        <h1>Yêu cầu</h1>
        <p>Đơn từ nhân viên: đơn chờ duyệt xếp trước, cũ nhất trước.</p>
      </div>
    </div>

    <LoadFail v-if="failed && !all" what="danh sách yêu cầu" @retry="load" />
    <template v-else-if="all">
      <section class="rq-tiles" aria-label="Lọc theo trạng thái đơn">
        <button
          v-for="[key, label] in TILES"
          :key="key"
          type="button"
          class="rq-sc"
          :class="{ on: tab === key }"
          :aria-pressed="tab === key"
          @click="tab = key"
        >
          <span class="rq-lb">
            <span v-if="key !== 'all'" class="rq-dot" :style="{ background: STATUS_DOT[key] }" />{{ label }}
          </span>
          <span class="rq-nb">{{ count[key] }}</span>
          <span class="rq-sub">{{ tileSub(key) }}</span>
        </button>
      </section>

      <section class="rq-split" aria-label="Danh sách yêu cầu">
        <nav class="rq-rail" aria-label="Loại đơn">
          <div class="rq-mt rq-rh">Loại đơn</div>
          <button
            v-for="k in kinds"
            :key="k.key"
            type="button"
            class="rq-kb"
            :class="{ on: kind === k.key }"
            :aria-pressed="kind === k.key"
            @click="kind = k.key"
          >
            <span>{{ k.label }}</span>
            <span v-if="k.n" class="rq-ct" :aria-label="`${k.n} chờ duyệt`">{{ k.n }}</span>
          </button>
          <p class="rq-mt rq-rnote">Số cam là đơn đang chờ duyệt.</p>
        </nav>
        <div class="rq-main">
          <div class="rq-bar">
            <StaffScopeFilter v-model:pst="pst" v-model:dept="dept" :depts="depts" />
            <span class="rq-sp" />
            <label class="rq-find">
              <Icon name="search" :size="16" />
              <input v-model="q" type="search" placeholder="Lọc theo tên…" aria-label="Lọc theo tên" />
            </label>
            <BulkButton v-if="!sel.mode.value && pendShown.length" icon="check" @click="startBulk">Duyệt nhiều đơn</BulkButton>
          </div>
          <SelectBar
            v-if="sel.mode.value"
            title="Duyệt nhiều đơn"
            :count="chosen.length"
            :total="pendShown.length"
            unit="đơn"
            note="Từ chối vẫn làm ở từng đơn vì cần ghi lý do"
            :go-label="approving ? 'Đang duyệt…' : chosen.length ? `Duyệt ${chosen.length} đơn` : 'Chọn ít nhất 1 đơn'"
            :go-disabled="!chosen.length || approving"
            :running="approving"
            @quit="sel.quit()"
            @run="runBulk"
          />
          <ResultLine v-else :text="result" />
          <ReqTable
            v-if="shown.length"
            :rows="shown"
            :open-id="openId"
            :busy-id="busyId"
            :selecting="!!sel.mode.value"
            :picked="sel.picked.value"
            :all-state="sel.stateOf(pendShown)"
            @open="open($event)"
            @reject="open($event, true)"
            @approve="approveRow"
            @toggle="sel.toggle"
            @toggle-all="sel.toggleAll(pendShown)"
          />
          <p v-else class="rq-none">Không có yêu cầu nào khớp bộ lọc.</p>
        </div>
      </section>
    </template>

    <ReqDrawer
      v-if="current"
      :key="current.id"
      :row="current"
      :rejecting="rejecting"
      :busy="busyId === current.id"
      @close="close"
      @decide="onDecide"
    />
  </div>
</template>

<style scoped>
.rq-mt {
  font-size: 12px;
  line-height: 16px;
  color: var(--muted);
}
.rq-dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  flex: none;
  border-radius: 50px;
}
.rq-tiles {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 160px), 1fr));
  gap: 16px;
  margin-bottom: 24px;
}
/* Thẻ đếm cũng là bộ lọc; thẻ đang chọn nền đen. */
.rq-sc {
  min-height: 112px;
  min-width: 0;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 8px;
  padding: 16px 20px;
  border-radius: var(--r-md);
  background: var(--surface);
  border: 1px solid var(--border);
  color: var(--text);
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.rq-sc:hover {
  border-color: var(--control);
}
.rq-lb {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  line-height: 16px;
  font-weight: 500;
  color: var(--muted);
}
.rq-nb {
  font-size: 28px;
  line-height: 32px;
  font-weight: 500;
  letter-spacing: -0.56px;
  font-variant-numeric: tabular-nums;
}
.rq-sub {
  font-size: 12px;
  line-height: 16px;
  color: var(--muted);
}
.rq-sc.on {
  background: var(--surface-dark);
  border-color: var(--surface-dark);
  color: var(--on-primary);
}
.rq-sc.on .rq-lb {
  color: var(--on-primary);
}
.rq-sc.on .rq-nb {
  color: var(--gold);
}
.rq-sc.on .rq-sub {
  color: var(--ink-on-dark-muted);
}
.rq-split {
  display: grid;
  grid-template-columns: 232px minmax(0, 1fr);
  border-radius: var(--r-card);
  background: var(--surface);
  border: 1px solid var(--border);
  overflow: hidden;
}
.rq-rail {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 20px 12px;
  border-right: 1px solid var(--border);
}
.rq-rh {
  padding: 0 12px 8px;
  font-weight: 500;
}
.rq-kb {
  width: 100%;
  min-height: 40px;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 12px;
  border: 0;
  border-radius: var(--r-ctl);
  background: transparent;
  font: inherit;
  color: var(--text);
  text-align: left;
  cursor: pointer;
}
.rq-kb:hover {
  background: var(--ground);
}
.rq-kb.on {
  background: var(--gold-pale);
  font-weight: 600;
}
.rq-ct {
  margin-left: auto;
  min-width: 22px;
  height: 20px;
  box-sizing: border-box;
  padding: 0 6px;
  border-radius: 6px;
  display: grid;
  place-items: center;
  background: var(--status-pending);
  color: var(--text);
  font-size: 12px;
  line-height: 16px;
  font-weight: 600;
}
.rq-rnote {
  margin: 12px 12px 0;
}
.rq-main {
  min-width: 0;
  display: flex;
  flex-direction: column;
  padding-bottom: 16px;
}
.rq-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  padding: 16px 20px;
}
.rq-sp {
  flex-grow: 1;
}
.rq-find {
  width: 220px;
  max-width: 100%;
  height: 40px;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 12px;
  border-radius: var(--r-ctl);
  background: var(--surface);
  border: 1px solid var(--control);
  color: var(--muted);
}
.rq-find:focus-within {
  outline: 2px solid var(--text);
  outline-offset: 2px;
}
.rq-find input {
  flex-grow: 1;
  min-width: 0;
  border: 0;
  outline: 0;
  background: transparent;
  font: inherit;
  color: var(--text);
}
.rq-none {
  margin: 48px 20px;
  text-align: center;
  color: var(--muted);
}
.rq-sc:focus-visible,
.rq-kb:focus-visible {
  outline: 2px solid var(--text);
  outline-offset: 2px;
}
@media (max-width: 900px) {
  .rq-split {
    grid-template-columns: minmax(0, 1fr);
  }
  .rq-rail {
    border-right: 0;
    border-bottom: 1px solid var(--border);
  }
}
</style>
