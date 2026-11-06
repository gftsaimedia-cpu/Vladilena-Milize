<script setup lang="ts">
// Phiếu lương một người (board H): ngăn kéo nổi gồm đầu phiếu, định danh, chấm công tháng và bảng Tổng hợp lương.
// Chấm điểm KPI ngay trong phiếu: điểm đang gõ nằm ở `draft`, `view` là phiếu tính lại theo draft (hiện ngay khi gõ).
// Việc lưu thuộc về màn Bảng lương (prop `save`: lưu, thay phiếu đang mở, tải lại bảng) vì ngăn kéo có thể đã tháo khỏi
// trang khi lưu xong. Rời ô thì lưu; đóng, sang phiếu khác hay phiếu đổi từ ngoài thì lưu hết điểm chưa lưu (flush).
// Duyệt / từ chối cũng thuộc về màn (prop `decide`), cùng lý do; chân ngăn kéo chỉ có nút khi phiếu là Nháp hay Chờ duyệt,
// còn lại là dòng trạng thái (và lý do từ chối nếu có). Từ chối hai bước: Từ chối mở ô lý do không bắt buộc, Xác nhận từ chối
// mới quyết; Huỷ quay lại và bỏ chữ đang gõ. In phiếu mở trang A4 của phiếu ở tab mới, trang đó tự bật hộp in (?in=1).
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import AppDrawer from '@/components/ui/AppDrawer.vue';
import Icon from '@/components/ui/Icon.vue';
import { kindLevelText } from '@/constants/labels';
import type { Payslip } from '@/mock/payroll';
import type { KpiPart, KpiScores } from '@/mock/payroll-calc';
import { previewPayslip } from '@/services/admin-payroll';
import { usePeriodStore } from '@/stores/period';
import { monthShort } from '@/utils/format';
import StatusPill from '../parts/StatusPill.vue';
import SlipAttendance from './SlipAttendance.vue';
import SlipHistory from './SlipHistory.vue';
import SlipKpi from './SlipKpi.vue';
import SlipSummary from './SlipSummary.vue';

const props = defineProps<{
  slip: Payslip;
  month: string;
  hasPrev: boolean;
  hasNext: boolean;
  save: (id: string, part: KpiPart, value: number | null) => Promise<void>;
  decide: (id: string, decision: 'approve' | 'reject', note?: string) => Promise<boolean | void>;
}>();
const emit = defineEmits<{ close: []; prev: []; next: [] }>();

// Trạng thái kỳ: chỉ duyệt / từ chối phiếu khi kỳ đã tính sau chốt công ('calculated'); kỳ đã phê duyệt hoặc đã trả thì
// khoá luôn điểm KPI (BE trả PAYROLL_FINALIZED).
const periodStatus = computed(() => usePeriodStore().view?.status);
const canDecide = computed(() => periodStatus.value === 'calculated');
const finalized = computed(() => periodStatus.value === 'approved' || periodStatus.value === 'paid');
const lockedNote = computed(() =>
  finalized.value
    ? 'Kỳ lương đã phê duyệt: không duyệt, từ chối hay sửa điểm KPI được nữa. Huỷ phê duyệt kỳ để sửa.'
    : 'Chỉ duyệt phiếu khi kỳ lương đã tính sau chốt công.'
);

const draft = ref<KpiScores>({ ...props.slip.kpi.scores });
const PARTS = Object.keys(draft.value) as KpiPart[];
// `owner`: phiếu mà draft đang giữ điểm và điểm đã lưu của nó (không phản ứng; chỉ để biết cột nào chưa lưu).
let owner = { id: props.slip.id, saved: { ...props.slip.kpi.scores } };
const view = computed(() => previewPayslip(props.slip, draft.value));

// Ô Tình trạng: trạng thái nhân sự (Thử việc / Chính thức) rồi nhãn hợp đồng; thiếu phần nào thì bỏ phần đó.
const standing = computed(
  () => [props.slip.employmentStatus, props.slip.contract].filter(t => t && t !== '—').join(' · ') || '—'
);

const update = (part: KpiPart, value: number | null) => (draft.value = { ...draft.value, [part]: value });
// Các lần lưu đang bay, để Duyệt / Từ chối chờ chúng xong: lưu trễ trả phiếu cũ (chưa duyệt) sẽ đè phiếu đã duyệt.
const inflight = new Set<Promise<void>>();
const save = (part: KpiPart) => {
  owner.saved[part] = draft.value[part];
  const p = props.save(owner.id, part, draft.value[part]);
  inflight.add(p);
  const done = () => inflight.delete(p);
  p.then(done, done);
  return p;
};
// Lưu mọi cột có draft khác điểm đã lưu. Gọi lặp là vô hại: lần sau không còn cột nào khác.
// Trả lời hẹn xong khi mọi lần lưu đang bay (kể cả lần bắt đầu từ trước, lúc rời ô) đã trả về; các nơi gọi khác không cần chờ.
function flush(): Promise<void> {
  for (const part of PARTS) if (draft.value[part] !== owner.saved[part]) save(part);
  return Promise.allSettled([...inflight]).then(() => {});
}
watch(
  () => props.slip,
  slip => {
    if (slip.id === owner.id) {
      owner.saved = { ...slip.kpi.scores };
      return;
    }
    // Phiếu đổi ngoài nút Đóng và hai mũi tên (Back, sửa địa chỉ): lưu điểm chưa lưu của phiếu cũ trước khi đặt lại draft.
    flush();
    owner = { id: slip.id, saved: { ...slip.kpi.scores } };
    draft.value = { ...slip.kpi.scores };
    // Sang phiếu khác thì bỏ ô lý do từ chối đang mở của phiếu cũ.
    asking.value = false;
    reason.value = '';
  }
);
onBeforeUnmount(flush);
const router = useRouter();
const enc = encodeURIComponent;
const print = () =>
  window.open(router.resolve({ path: `/in/phieu-luong/${enc(props.month)}/${enc(props.slip.id)}`, query: { in: '1' } }).href, '_blank');
const close = () => {
  flush();
  emit('close');
};
const go = (to: 'prev' | 'next') => {
  flush();
  if (to === 'prev') emit('prev');
  else emit('next');
};

// Đang chờ một quyết định: các nút tắt để bấm đúp chỉ quyết một lần.
const deciding = ref(false);
const status = ref<HTMLElement | null>(null);
const decided = computed(() =>
  props.slip.status === 'done'
    ? `Đã duyệt phiếu lương của ${props.slip.name}.`
    : props.slip.status === 'rejected'
      ? `Đã từ chối phiếu lương của ${props.slip.name}.`
      : ''
);
const decidedNote = computed(() => (props.slip.status === 'rejected' ? props.slip.decisionNote || '' : ''));

// Từ chối hai bước. `asking`: đang hỏi lý do; `reason`: chữ đang gõ (bỏ khi Huỷ hay sang phiếu khác).
const asking = ref(false);
const reason = ref('');
const reasonBox = ref<HTMLTextAreaElement | null>(null);
const rejectBtn = ref<HTMLButtonElement | null>(null);
async function askReject() {
  asking.value = true;
  await nextTick();
  reasonBox.value?.focus();
}
async function cancelReject() {
  asking.value = false;
  reason.value = '';
  await nextTick();
  rejectBtn.value?.focus();
}
const confirmReject = () => decideNow('reject', reason.value.trim() || undefined);

async function decideNow(decision: 'approve' | 'reject', note?: string) {
  if (deciding.value) return;
  deciding.value = true;
  const id = props.slip.id;
  try {
    await flush();
    const ok = await props.decide(id, decision, note);
    if (ok !== false && props.slip.id === id) {
      asking.value = false;
      reason.value = '';
    }
  } finally {
    deciding.value = false;
  }
  // Hai nút vừa biến mất nên tiêu điểm rơi về body: đưa sang dòng trạng thái (để đọc kết quả). Tiêu điểm đã ở chỗ khác
  // trong ngăn kéo thì giữ nguyên; ngăn kéo đã tháo hay sang phiếu khác thì không làm gì.
  await nextTick();
  const now = document.activeElement;
  if (props.slip.id === id && status.value && (!now || now === document.body)) status.value.focus();
}

// AppDrawer đặt tiêu điểm vào ô bấm được đầu tiên, ở đây là mũi tên Phiếu trước, mà mũi tên đó có thể bị tắt ở đầu danh sách.
// Như các ngăn kéo khác, tiêu điểm đầu vào nút Đóng; Tab và Shift+Tab vẫn tới hai mũi tên. Phần tử này mount sau AppDrawer.
const head = ref<HTMLElement | null>(null);
const prevBtn = ref<HTMLButtonElement | null>(null);
const nextBtn = ref<HTMLButtonElement | null>(null);
const closeBtn = () => head.value?.closest('.drw')?.querySelector<HTMLElement>('.drw-h .x');
onMounted(() => closeBtn()?.focus());
// Mũi tên đang giữ tiêu điểm bị tắt ở đầu hay cuối danh sách: tiêu điểm sang mũi tên kia, cả hai tắt thì sang Đóng.
// Đọc activeElement trước khi DOM đổi (watch chạy trước lần vẽ lại), rồi đặt tiêu điểm sau nextTick.
watch([() => props.hasPrev, () => props.hasNext], async ([prev, next]) => {
  const was = document.activeElement;
  await nextTick();
  if (was === prevBtn.value && !prev) (next ? nextBtn.value : closeBtn())?.focus();
  else if (was === nextBtn.value && !next) (prev ? prevBtn.value : closeBtn())?.focus();
});
</script>

<template>
  <AppDrawer :title="`Phiếu lương của ${slip.name}`" floating @close="close">
    <template #head>
      <div ref="head" class="pd-head">
        <h2>Phiếu lương tháng {{ monthShort(month) }}</h2>
        <button type="button" class="pd-ib" aria-label="In phiếu" @click="print"><Icon name="print" /></button>
        <button ref="prevBtn" type="button" class="pd-ib" aria-label="Phiếu trước" :disabled="!hasPrev" @click="go('prev')">
          <Icon name="chevl" />
        </button>
        <button ref="nextBtn" type="button" class="pd-ib" aria-label="Phiếu sau" :disabled="!hasNext" @click="go('next')">
          <Icon name="chevr" />
        </button>
      </div>
    </template>

    <div class="pd-body">
      <div class="pd-id">
        <span class="pd-av" aria-hidden="true">{{ slip.initials }}</span>
        <div class="pd-who">
          <b>{{ slip.name }}</b>
          <span>{{ slip.dept }} · {{ slip.title }} · {{ slip.id }}</span>
        </div>
        <StatusPill :status="slip.status" />
      </div>
      <dl class="pd-info">
        <div>
          <dt>Loại · bậc</dt>
          <dd>{{ kindLevelText(slip.kind, slip.level) }}</dd>
        </div>
        <div>
          <dt>Tình trạng</dt>
          <dd>{{ standing }}</dd>
        </div>
        <div>
          <dt>Trả lương</dt>
          <dd>{{ slip.payday }}</dd>
        </div>
      </dl>
      <p class="pd-note">{{ slip.note }}</p>
      <ul v-if="slip.warnings?.length" class="pd-warn" role="status" aria-label="Cảnh báo của phiếu">
        <li v-for="w in slip.warnings" :key="w">{{ w }}</li>
      </ul>
    </div>

    <SlipAttendance :slip="slip" :month="month" />
    <SlipSummary :slip="view" :month="month">
      <template #kpi>
        <SlipKpi
          :key="slip.id"
          :scores="view.kpi.scores"
          :weights="slip.rates?.kpiWeights ?? null"
          :name="slip.name"
          :readonly="finalized"
          @update="update" @save="save" />
        <p v-if="finalized" class="pd-note" role="note">Điểm KPI chỉ xem: kỳ lương đã phê duyệt.</p>
      </template>
      <template #history><SlipHistory :key="slip.id" :history="view.kpi.history" /></template>
    </SlipSummary>

    <template #footer>
      <div class="pd-foot">
        <div v-if="asking && !decided && canDecide" class="pd-rs">
          <label for="pd-reason">Lý do từ chối (không bắt buộc)</label>
          <textarea
            id="pd-reason"
            ref="reasonBox"
            v-model="reason"
            placeholder="Ví dụ: điểm KPI của quản lý chưa đúng, cần chấm lại"
          ></textarea>
        </div>
        <div class="pd-acts">
          <div v-if="decided" ref="status" class="pd-status" role="status" aria-live="polite" tabindex="-1">
            <p>{{ decided }}</p>
            <p v-if="decidedNote" class="pd-why">Lý do: {{ decidedNote }}</p>
          </div>
          <p v-else-if="!canDecide" class="pd-lock" role="note">{{ lockedNote }}</p>
          <template v-else-if="asking">
            <button type="button" class="btn" :disabled="deciding" @click="cancelReject">Huỷ</button>
            <button type="button" class="btn pri pd-approve" :disabled="deciding" @click="confirmReject">Xác nhận từ chối</button>
          </template>
          <template v-else>
            <button ref="rejectBtn" type="button" class="btn" :disabled="deciding" @click="askReject">Từ chối</button>
            <button type="button" class="btn pri pd-approve" :disabled="deciding" @click="decideNow('approve')">Duyệt phiếu</button>
          </template>
        </div>
      </div>
    </template>
  </AppDrawer>
</template>

<style scoped>
.pd-lock {
  margin: 0;
  font-size: 13px;
  line-height: 20px;
  color: var(--muted);
}
.pd-head {
  display: flex;
  align-items: center;
  gap: 4px;
}
.pd-head h2 {
  flex: 1;
  min-width: 0;
  margin: 0;
  font-size: 18px;
  line-height: 26px;
  font-weight: 600;
}
.pd-ib {
  width: 36px;
  height: 36px;
  flex: none;
  display: grid;
  place-items: center;
  padding: 0;
  border: 0;
  border-radius: 8px;
  background: none;
  color: var(--text);
  cursor: pointer;
}
.pd-ib:hover:not(:disabled) {
  background: var(--ground);
}
.pd-ib:focus-visible {
  outline: 2px solid var(--text);
  outline-offset: 2px;
}
.pd-ib:disabled {
  opacity: 0.35;
  cursor: default;
}
.pd-foot {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.pd-acts {
  display: flex;
  align-items: center;
  gap: 10px;
}
.pd-rs {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.pd-rs label {
  font-weight: 500;
}
/* Ô lý do theo board: góc 8px, cao 72px, viền --control, chữ của trang, vòng tiêu điểm mực 2px, không bóng. */
.pd-rs textarea {
  height: 72px;
  box-sizing: border-box;
  padding: 8px 12px;
  border-radius: var(--r-ctl, 8px);
  border: 1px solid var(--control, #8a8a8a);
  background: var(--surface, #fff);
  box-shadow: none;
  font: inherit;
  color: var(--text, #212121);
  resize: vertical;
}
.pd-rs textarea::placeholder {
  color: var(--muted, #616161);
}
.pd-rs textarea:focus-visible {
  outline: 2px solid var(--text, #212121);
  outline-offset: 1px;
}
.pd-approve {
  flex: 1;
  justify-content: center;
}
.pd-status {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.pd-status p {
  margin: 0;
  font-weight: 500;
}
.pd-status p.pd-why {
  font-size: 12px;
  line-height: 16px;
  font-weight: 400;
  color: var(--muted);
}
.pd-status:focus-visible {
  outline: 2px solid var(--text);
  outline-offset: 2px;
  border-radius: 4px;
}
.pd-body {
  padding: 8px 24px 0;
}
.pd-id {
  display: flex;
  align-items: center;
  gap: 12px;
}
.pd-av {
  width: 48px;
  height: 48px;
  flex: none;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: var(--gold-light);
  font-size: 16px;
  font-weight: 600;
}
.pd-who {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.pd-who b {
  font-size: 16px;
  line-height: 24px;
  font-weight: 600;
}
.pd-who span {
  font-size: 12px;
  line-height: 16px;
  color: var(--muted);
}
.pd-info {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  margin: 16px 0 0;
  border: 1px solid var(--border);
  border-radius: 12px;
}
.pd-info > div {
  padding: 10px 14px;
  min-width: 0;
}
.pd-info > div + div {
  border-left: 1px solid var(--border);
}
.pd-info dt {
  font-size: 12px;
  line-height: 16px;
  color: var(--muted);
}
.pd-info dd {
  margin: 2px 0 0;
  font-weight: 500;
}
.pd-note {
  margin: 12px 0 0;
  font-size: 12px;
  line-height: 16px;
  color: var(--muted);
}
.pd-warn {
  margin: 12px 0 0;
  padding: 10px 12px 10px 28px;
  border-radius: 12px;
  background: var(--gold-pale, #fff9ec);
  border: 1px solid var(--gold, #e8c372);
  color: #212121;
  font-size: 13px;
  line-height: 18px;
  max-height: 168px;
  overflow-y: auto;
}
.pd-warn li + li {
  margin-top: 4px;
}
</style>
