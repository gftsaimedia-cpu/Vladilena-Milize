<script setup lang="ts">
// J16 · Đổi ca (spec staff-requests 4.4, brief FE mục 5): Từ ngày – Đến ngày, một trong 6 khung ca, lý do.
// Ngày là mọi ngày trong window (builder startDates / endDates); đổi "Từ ngày" thì "Đến ngày" giữ nguyên nếu còn hợp lệ (fitEnd).
// Khung ca là nhóm radio "Ca mới", hai cột như board, lấy từ ctx.shiftFrames. Tóm tắt (sau khung ca, như board) do builder đếm:
// "5 ngày đổi sang Flex 06–15: …"; ngày nghỉ trong khoảng giữ nguyên, câu cảnh báo đến từ lần xem trước.
// Hợp đồng form như LeaveForm: nhận ctx, ngay, preview; phát `draft` đủ trường hoặc null, ngay trong watcher (không chờ).
import { computed, ref, useId, watch } from 'vue';
import { dateLabel, endDates, fitEnd, frameLabel, shiftChangeSummary, startDates } from '@/builders/api/staff-requests';
import type { PreviewResult, RequestContext, ShiftChangeDraft } from '@/mock/staff-requests-types';
import PhIcon from '@/views/staff-phone/components/PhIcon.vue';
import RequestSummary from './RequestSummary.vue';

const props = defineProps<{ ctx: RequestContext; ngay?: string | null; preview?: PreviewResult<'shift-change'> | null }>();
const emit = defineEmits<{ draft: [draft: ShiftChangeDraft | null] }>();

const KIND = 'shift-change';
const id = useId();
const startDate = ref('');
const endDate = ref('');
const frameKey = ref('');
const reason = ref('');

const starts = computed(() => startDates(props.ctx, KIND));
const ends = computed(() => endDates(props.ctx, KIND, startDate.value));
// 'Flex 06–15' → tên đậm 'Flex' và giờ '06–15' (board J16).
const frames = computed(() =>
  props.ctx.shiftFrames.map(f => {
    const label = frameLabel(f.shiftType, f.start, f.end);
    const cut = label.indexOf(' ');
    return { key: `${f.shiftType}|${f.start}`, frame: f, label, name: label.slice(0, cut), time: label.slice(cut + 1) };
  })
);
const chosen = computed(() => frames.value.find(f => f.key === frameKey.value) ?? null);
// Ca đang làm: ca của ngày làm đầu tiên từ "Từ ngày" (chưa chọn thì từ hôm nay).
const current = computed(() => {
  const day = props.ctx.days.find(d => d.date >= (startDate.value || props.ctx.today) && d.shift);
  return day?.shift ? frameLabel(day.shift.type, day.shift.start, day.shift.end) : '';
});
const lines = computed(() =>
  startDate.value && endDate.value && chosen.value
    ? [shiftChangeSummary(props.ctx, startDate.value, endDate.value, chosen.value.label)]
    : []
);

watch(startDate, start => {
  endDate.value = start ? fitEnd(props.ctx, KIND, start, endDate.value) : '';
});
// Tải lại request-context (server từ chối lần gửi): bỏ lựa chọn không còn hợp lệ.
watch(
  () => props.ctx,
  ctx => {
    if (!frames.value.some(f => f.key === frameKey.value)) frameKey.value = '';
    if (!starts.value.includes(startDate.value)) startDate.value = '';
    else endDate.value = fitEnd(ctx, KIND, startDate.value, endDate.value);
  }
);

const draft = computed<ShiftChangeDraft | null>(() =>
  startDate.value && endDate.value && chosen.value && reason.value.trim()
    ? {
        startDate: startDate.value,
        endDate: endDate.value,
        shiftType: chosen.value.frame.shiftType,
        startTime: chosen.value.frame.start,
        reason: reason.value.trim()
      }
    : null
);
watch(draft, d => emit('draft', d), { immediate: true });
</script>

<template>
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
  <div class="nr-fl" role="radiogroup" :aria-labelledby="`${id}-ca`">
    <div class="nr-sh">
      <span :id="`${id}-ca`" class="nr-lb">Ca mới</span>
      <span v-if="current" class="mut sm">Ca hiện tại: {{ current }}</span>
    </div>
    <div class="nr-frames">
      <label v-for="f in frames" :key="f.key" class="nr-op">
        <input v-model="frameKey" type="radio" :name="`${id}-ca`" :value="f.key" />
        <span><b>{{ f.name }}</b> {{ f.time }}</span>
      </label>
    </div>
    <span class="mut sm">Ca Night kết thúc vào sáng hôm sau</span>
  </div>
  <RequestSummary :lines="lines" :preview="preview" />
  <div class="nr-fl">
    <label :for="`${id}-ly`">Lý do</label>
    <textarea :id="`${id}-ly`" v-model="reason" class="nr-in" placeholder="Ví dụ: đưa đón con tuần này" />
  </div>
</template>
