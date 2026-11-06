<script setup lang="ts">
// J14 · Nghỉ có làm bù (spec staff-requests 4.4, brief FE mục 3): Từ ngày – Đến ngày, các dòng khung bù, lý do.
// Ngày nghỉ do BE đưa (request-context choices: tháng chưa có OT, "Đến ngày" cùng tháng, sau đó còn ngày để bù).
// Chọn xong ngày nghỉ thì hiện "Khung bù": mỗi dòng là ngày bù (BE: slotDates), giờ bắt đầu và giờ kết thúc lấy từ bảng giờ
// `hours` của BE. Form không tự chặn khung chồng nhau hay quá số giờ phải bù: BE kiểm khi xem trước, câu từ chối hiện ở hộp
// tóm tắt và nút Gửi chờ xem trước ok. Đổi giờ bắt đầu thì giờ kết thúc giữ nguyên nếu còn trong bảng giờ, không thì lấy giờ xa
// nhất (board J14). Đổi ngày nghỉ hay tải lại request-context thì bỏ giá trị không còn trong bảng (fitSlots).
// Bộ đếm "Đã xếp x / y giờ" ở đầu khung bù (y do BE đòi); hộp tóm tắt giữa hai ô ngày và khung bù như board.
// Bản nháp chỉ gồm các dòng đủ ba ô.
// Hợp đồng form như LeaveForm: nhận ctx, ngay, preview; phát `draft` đủ trường hoặc null, ngay trong watcher (không chờ).
import { computed, nextTick, ref, useId, watch } from 'vue';
import {
  dateLabel,
  endDates,
  endHours,
  fitEnd,
  fitSlots,
  leaveSummary,
  makeupCountLine,
  makeupCounter,
  makeupNeedLine,
  slotDates,
  startDates,
  startHours
} from '@/builders/api/staff-requests';
import type { MakeupDraft, MakeupSlot, PreviewResult, RequestContext } from '@/mock/staff-requests-types';
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

const hh = (h: number) => `${String(h).padStart(2, '0')}:00`;
const hourOf = (t: string) => Number(t.slice(0, 2));
const dayOf = (date: string) => props.ctx.days.find(d => d.date === date);

const starts = computed(() => startDates(props.ctx, KIND));
const ends = computed(() => endDates(props.ctx, KIND, startDate.value));
const ranged = computed(() => !!startDate.value && !!endDate.value);
const slotDays = computed(() => slotDates(props.ctx, endDate.value));
const counter = computed(() => makeupCounter(props.ctx, startDate.value, endDate.value, slots.value));
const countLine = computed(() => makeupCountLine(props.ctx, startDate.value, endDate.value, slots.value));
const lines = computed(() =>
  ranged.value
    ? [leaveSummary(props.ctx, startDate.value, endDate.value), makeupNeedLine(props.ctx, startDate.value, endDate.value)]
    : []
);

// Lựa chọn giờ của từng dòng: các dòng khác giữ giờ của chúng.
function hoursFor(list: MakeupSlot[], i: number) {
  const s = list[i];
  const hours = dayOf(s.date)?.hours ?? [];
  return {
    starts: startHours(hours).map(hh),
    ends: s.startTime ? endHours(hours, hourOf(s.startTime)).map(e => hh(e.end)) : []
  };
}
const rows = computed(() => slots.value.map((s, i) => ({ ...s, key: keys.value[i], n: i + 1, ...hoursFor(slots.value, i) })));

// Ngày nghỉ hay request-context đổi: bỏ lựa chọn không còn hợp lệ. Có ngày nghỉ mà chưa có dòng nào thì mở sẵn một dòng.
function fitAll() {
  if (!starts.value.includes(startDate.value)) startDate.value = '';
  endDate.value = startDate.value ? fitEnd(props.ctx, KIND, startDate.value, endDate.value) : '';
  if (!endDate.value) {
    slots.value = [];
    keys.value = [];
    return;
  }
  if (!slots.value.length) {
    slots.value = [empty()];
    keys.value = [nextKey++];
  }
  slots.value = fitSlots(props.ctx, endDate.value, slots.value);
}
watch([startDate, endDate, () => props.ctx], fitAll);

const valueOf = (e: Event) => (e.target as HTMLSelectElement).value;
function setRow(i: number, patch: Partial<MakeupSlot>) {
  const next = slots.value.map((s, j) => (j === i ? { ...s, ...patch } : s));
  if ('startTime' in patch) {
    const ends = hoursFor(next, i).ends;
    if (!ends.includes(next[i].endTime)) next[i] = { ...next[i], endTime: ends[ends.length - 1] ?? '' };
  }
  slots.value = fitSlots(props.ctx, endDate.value, next);
}

const root = ref<HTMLElement | null>(null);
async function addRow() {
  if (!ranged.value) return;
  slots.value = [...slots.value, empty()];
  keys.value = [...keys.value, nextKey++];
  await nextTick();
  const selects = root.value?.querySelectorAll<HTMLElement>('.nr-slot select[aria-label^="Ngày bù"]');
  selects?.[selects.length - 1]?.focus();
}
async function removeRow(i: number) {
  keys.value = keys.value.filter((_, j) => j !== i);
  slots.value = fitSlots(
    props.ctx,
    endDate.value,
    slots.value.filter((_, j) => j !== i)
  );
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
  () => (ranged.value ? `Xếp đủ ${counter.value.required / 60} giờ bù thì mới gửi được` : ''),
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
    <button type="button" class="nr-b2" @click="addRow">
      <PhIcon name="plus" :size="16" :stroke="2" />Thêm khung bù
    </button>
  </div>
  <div class="nr-fl">
    <label :for="`${id}-ly`">Lý do</label>
    <textarea :id="`${id}-ly`" v-model="reason" class="nr-in" placeholder="Ví dụ: việc gia đình buổi sáng" />
  </div>
</template>
