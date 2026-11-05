<script setup lang="ts">
// J14 · Nghỉ có làm bù (spec staff-requests 4.4, brief FE mục 3): Từ ngày – Đến ngày, các dòng khung bù, lý do.
// Ngày nghỉ như Đơn nghỉ, thêm: tháng chưa có OT, "Đến ngày" cùng tháng, sau đó còn ngày để bù (builder startDates / endDates).
// Chọn xong ngày nghỉ thì hiện "Khung bù": mỗi dòng là ngày bù (sau ngày nghỉ cuối, cùng tháng, còn giờ trống: slotDates), giờ
// bắt đầu và giờ kết thúc. Giờ của một dòng không chồng các dòng khác cùng ngày và không vượt số giờ còn thiếu (slotHourOptions),
// nên không bao giờ xếp quá số giờ phải bù. Đổi giờ bắt đầu thì giờ kết thúc giữ nguyên nếu còn hợp lệ, không thì lấy giờ xa nhất
// còn xếp được (board J14). Đổi ngày nghỉ hay tải lại request-context thì bỏ giá trị không còn hợp lệ (fitSlots).
// Bộ đếm "Đã xếp x / 8 giờ" ở đầu khung bù; hộp tóm tắt giữa hai ô ngày và khung bù như board.
// Bản nháp chỉ gồm các dòng đủ ba ô; xem trước nói còn thiếu bao nhiêu giờ, nút Gửi chỉ bật khi xếp đủ.
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
  slotHourOptions,
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
const emit = defineEmits<{ draft: [draft: MakeupDraft | null] }>();

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
const canAdd = computed(() => ranged.value && counter.value.planned < counter.value.required);

// Lựa chọn giờ của từng dòng: các dòng khác giữ giờ của chúng.
function hoursFor(list: MakeupSlot[], i: number) {
  const s = list[i];
  const day = dayOf(s.date);
  const opts = slotHourOptions(props.ctx, startDate.value, endDate.value, list, i);
  return {
    starts: day ? startHours(day, opts).map(hh) : [],
    ends: day && s.startTime ? endHours(day, hourOf(s.startTime), opts).map(e => hh(e.end)) : []
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
  slots.value = fitSlots(props.ctx, startDate.value, endDate.value, slots.value);
}
watch([startDate, endDate, () => props.ctx], fitAll);

const valueOf = (e: Event) => (e.target as HTMLSelectElement).value;
function setRow(i: number, patch: Partial<MakeupSlot>) {
  const next = slots.value.map((s, j) => (j === i ? { ...s, ...patch } : s));
  if ('startTime' in patch) {
    const ends = hoursFor(next, i).ends;
    if (!ends.includes(next[i].endTime)) next[i] = { ...next[i], endTime: ends[ends.length - 1] ?? '' };
  }
  slots.value = fitSlots(props.ctx, startDate.value, endDate.value, next);
}

const root = ref<HTMLElement | null>(null);
async function addRow() {
  if (!canAdd.value) return;
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
    startDate.value,
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
