<script setup lang="ts">
// J14 · Nghỉ có làm bù (spec staff-requests 4.4, brief FE mục 3): Từ ngày – Đến ngày, các dòng khung bù, lý do.
// Ngày nghỉ do BE đưa (request-context choices: tháng chưa có OT, "Đến ngày" cùng tháng, sau đó còn ngày để bù).
// Chọn xong ngày nghỉ thì hiện "Khung bù": mỗi dòng là ngày bù, giờ bắt đầu và giờ kết thúc. BE tính hết (POST
// /me/requests/leave-with-makeup/plan): số phút đã xếp / cần bù, chỉnh lại các dòng không còn hợp lệ và đưa giờ chọn được của
// từng dòng (bỏ giờ dòng khác cùng ngày đã chiếm, không quá số giờ còn thiếu). Form chỉ gửi các dòng đang điền, hiện kết quả và
// xếp hàng các thao tác để không chồng lượt gọi. Đổi giờ bắt đầu thì giờ kết thúc giữ nguyên nếu còn hợp lệ, không thì lấy giờ xa
// nhất (board J14). Bộ đếm "Đã xếp x / y giờ" ở đầu khung bù; hộp tóm tắt giữa hai ô ngày và khung bù như board.
// Bản nháp chỉ gồm các dòng đủ ba ô.
// Hợp đồng form như LeaveForm: nhận ctx, ngay, preview; phát `draft` đủ trường hoặc null, ngay trong watcher (không chờ).
import { computed, nextTick, ref, useId, watch } from 'vue';
import { toast } from '@/components/shell/toast';
import {
  dateLabel,
  endDates,
  fitEnd,
  leaveSummary,
  makeupCountLine,
  makeupNeedLine,
  slotDates,
  startDates
} from '@/builders/api/staff-requests';
import type { MakeupPlan } from '@/mock/makeup-plan';
import type { MakeupDraft, MakeupSlot, PreviewResult, RequestContext } from '@/mock/staff-requests-types';
import { planMakeup } from '@/services/staff-requests';
import PhIcon from '@/views/staff-phone/components/PhIcon.vue';
import RequestSummary from './RequestSummary.vue';

const props = defineProps<{
  ctx: RequestContext;
  ngay?: string | null;
  preview?: PreviewResult<'leave-with-makeup'> | null;
}>();
const emit = defineEmits<{ draft: [draft: MakeupDraft | null]; hint: [text: string] }>();

const KIND = 'leave-with-makeup';
const id = useId();
const startDate = ref('');
const endDate = ref('');
const reason = ref('');
const slots = ref<MakeupSlot[]>([]);
const keys = ref<number[]>([]); // khoá ổn định của từng dòng (bỏ dòng giữa không làm các dòng sau vẽ lại sai)
let nextKey = 0;
const empty = (): MakeupSlot => ({ date: '', startTime: '', endTime: '' });

const starts = computed(() => startDates(props.ctx, KIND));
const ends = computed(() => endDates(props.ctx, KIND, startDate.value));
const ranged = computed(() => !!startDate.value && !!endDate.value);
const slotDays = computed(() => slotDates(props.ctx, endDate.value));

// Kế hoạch mới nhất BE trả (null: chưa có). Mọi thao tác đi qua `queue` để chạy lần lượt trên trạng thái mới nhất.
const plan = ref<MakeupPlan | null>(null);
let queue: Promise<unknown> = Promise.resolve();
let epoch = 0; // đổi ngày nghỉ thì lượt cũ về muộn bị bỏ
const required = computed(() => plan.value?.requiredMinutes ?? 0);
const planned = computed(() => plan.value?.plannedMinutes ?? 0);
// Thêm dòng chỉ khi BE nói còn thiếu giờ bù (form chỉ đưa thao tác hợp lệ).
const canAdd = computed(() => ranged.value && !!plan.value?.canAdd);
const countLine = computed(() => makeupCountLine(planned.value, required.value));
const lines = computed(() =>
  ranged.value ? [leaveSummary(props.ctx, startDate.value, endDate.value), makeupNeedLine(required.value, endDate.value)] : []
);
const rows = computed(() =>
  slots.value.map((s, i) => ({
    ...s,
    key: keys.value[i],
    n: i + 1,
    starts: plan.value?.slots[i]?.startOptions ?? [],
    ends: plan.value?.slots[i]?.endOptions ?? []
  }))
);

const toSlots = (p: MakeupPlan): MakeupSlot[] => p.slots.map(({ date, startTime, endTime }) => ({ date, startTime, endTime }));
// Hỏi BE về danh sách dòng `list`, áp kết quả (các dòng đã chỉnh) nếu chưa đổi ngày nghỉ trong lúc chờ.
async function ask(list: MakeupSlot[]): Promise<MakeupPlan | null> {
  const mine = epoch;
  try {
    const p = await planMakeup(startDate.value, endDate.value, list);
    if (mine !== epoch) return null;
    plan.value = p;
    slots.value = toSlots(p);
    return p;
  } catch (e) {
    toast.error((e as Error).message);
    return null;
  }
}
const enqueue = (job: () => Promise<unknown>) => (queue = queue.then(job, job));

// Ngày nghỉ hay request-context đổi: BE chỉnh lại các dòng. Có ngày nghỉ mà chưa có dòng nào thì mở sẵn một dòng.
function fitAll() {
  if (!starts.value.includes(startDate.value)) startDate.value = '';
  endDate.value = startDate.value ? fitEnd(props.ctx, KIND, startDate.value, endDate.value) : '';
  epoch++;
  if (!endDate.value) {
    slots.value = [];
    keys.value = [];
    plan.value = null;
    return;
  }
  if (!slots.value.length) {
    slots.value = [empty()];
    keys.value = [nextKey++];
  }
  enqueue(() => ask(slots.value));
}
watch([startDate, endDate, () => props.ctx], fitAll);

const valueOf = (e: Event) => (e.target as HTMLSelectElement).value;
function setRow(i: number, patch: Partial<MakeupSlot>) {
  enqueue(async () => {
    const next = slots.value.map((s, j) => (j === i ? { ...s, ...patch } : s));
    let p = await ask(next);
    // Đổi giờ bắt đầu mà giờ kết thúc không còn hợp lệ thì lấy giờ xa nhất.
    const row = p?.slots[i];
    if (p && 'startTime' in patch && row?.startTime && !row.endTime && row.endOptions.length) {
      const again = toSlots(p).map((s, j) => (j === i ? { ...s, endTime: row.endOptions[row.endOptions.length - 1] } : s));
      p = await ask(again);
    }
  });
}

const root = ref<HTMLElement | null>(null);
// Thêm / bỏ dòng chạy trong hàng đợi, trên danh sách dòng mới nhất lúc tới lượt: sửa `slots` ngoài hàng đợi thì một kết quả cũ
// về sau sẽ ghi đè mất dòng vừa thêm.
async function addRow() {
  if (!canAdd.value) return;
  await enqueue(async () => {
    slots.value = [...slots.value, empty()];
    keys.value = [...keys.value, nextKey++];
    await ask(slots.value);
  });
  await nextTick();
  const selects = root.value?.querySelectorAll<HTMLElement>('.nr-slot select[aria-label^="Ngày bù"]');
  selects?.[selects.length - 1]?.focus();
}
async function removeRow(i: number) {
  await enqueue(async () => {
    keys.value = keys.value.filter((_, j) => j !== i);
    slots.value = slots.value.filter((_, j) => j !== i);
    await ask(slots.value);
  });
  await nextTick();
  const add = root.value?.querySelector<HTMLButtonElement>('.nr-b2');
  (add && !add.disabled ? add : root.value?.querySelector<HTMLElement>('.nr-slot select'))?.focus();
}

const complete = computed(() => slots.value.filter(s => s.date && s.startTime && s.endTime));
const draft = computed<MakeupDraft | null>(() =>
  startDate.value && endDate.value && reason.value.trim() && complete.value.length
    ? {
        startDate: startDate.value,
        endDate: endDate.value,
        slots: complete.value.map(s => ({ ...s })),
        reason: reason.value.trim()
      }
    : null
);
watch(draft, d => emit('draft', d), { immediate: true });
// Dưới nút Gửi khoá (board J14, chỉ hiện khi chưa gửi được): nói cần xếp đủ bao nhiêu giờ (BE đòi).
watch(
  () => (ranged.value && required.value ? `Xếp đủ ${required.value / 60} giờ bù thì mới gửi được` : ''),
  t => emit('hint', t),
  { immediate: true }
);
</script>

<template>
  <div class="nr-fl nr-range">
    <div class="nr-two">
      <div class="nr-fl">
        <label :for="`${id}-tu`">Từ ngày</label>
        <div class="nr-box nr-sel">
          <select :id="`${id}-tu`" v-model="startDate" class="nr-in">
            <option value="" disabled>Chọn ngày</option>
            <option v-for="d in starts" :key="d" :value="d">{{ dateLabel(d) }}</option>
          </select>
          <PhIcon name="down" />
        </div>
      </div>
      <div class="nr-fl">
        <label :for="`${id}-den`">Đến ngày</label>
        <div class="nr-box nr-sel">
          <select :id="`${id}-den`" v-model="endDate" class="nr-in" :disabled="!startDate">
            <option value="" disabled>Chọn ngày</option>
            <option v-for="d in ends" :key="d" :value="d">{{ dateLabel(d) }}</option>
          </select>
          <PhIcon name="down" />
        </div>
      </div>
    </div>
    <RequestSummary :lines="lines" :preview="preview" />
  </div>
  <div v-if="ranged" ref="root" class="nr-fl" role="group" :aria-labelledby="`${id}-kb`">
    <div class="nr-sh">
      <span :id="`${id}-kb`" class="nr-lb">Khung bù</span>
      <span class="nr-cnt" aria-live="polite">{{ countLine }}</span>
    </div>
    <div v-if="rows.length" class="nr-slot nr-slot-head mut sm" aria-hidden="true">
      <span>Ngày</span><span>Từ</span><span>Đến</span><span></span>
    </div>
    <div v-for="r in rows" :key="r.key" class="nr-slot">
      <div class="nr-box nr-sel">
        <select
          class="nr-in"
          :aria-label="`Ngày bù, khung ${r.n}`"
          :value="r.date"
          @change="setRow(r.n - 1, { date: valueOf($event) })"
        >
          <option value="" disabled>Chọn</option>
          <option v-for="d in slotDays" :key="d" :value="d">{{ dateLabel(d) }}</option>
        </select>
        <PhIcon name="down" :size="16" />
      </div>
      <div class="nr-box nr-sel">
        <select
          class="nr-in"
          :aria-label="`Từ giờ, khung ${r.n}`"
          :value="r.startTime"
          :disabled="!r.date"
          @change="setRow(r.n - 1, { startTime: valueOf($event) })"
        >
          <option value="" disabled>Chọn</option>
          <option v-for="h in r.starts" :key="h" :value="h">{{ h }}</option>
        </select>
        <PhIcon name="down" :size="16" />
      </div>
      <div class="nr-box nr-sel">
        <select
          class="nr-in"
          :aria-label="`Đến giờ, khung ${r.n}`"
          :value="r.endTime"
          :disabled="!r.startTime"
          @change="setRow(r.n - 1, { endTime: valueOf($event) })"
        >
          <option value="" disabled>Chọn</option>
          <option v-for="h in r.ends" :key="h" :value="h">{{ h }}</option>
        </select>
        <PhIcon name="down" :size="16" />
      </div>
      <button type="button" class="nr-xb" :aria-label="`Bỏ khung ${r.n}`" @click="removeRow(r.n - 1)">
        <PhIcon name="x" :size="16" :stroke="2" />
      </button>
    </div>
    <button type="button" class="nr-b2" :disabled="!canAdd" @click="addRow">
      <PhIcon name="plus" :size="16" :stroke="2" />Thêm khung bù
    </button>
  </div>
  <div class="nr-fl">
    <label :for="`${id}-ly`">Lý do</label>
    <textarea :id="`${id}-ly`" v-model="reason" class="nr-in" placeholder="Ví dụ: việc gia đình buổi sáng" />
  </div>
</template>
