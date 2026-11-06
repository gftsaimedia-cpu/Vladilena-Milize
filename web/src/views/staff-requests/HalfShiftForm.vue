<script setup lang="ts">
// Nghỉ giữa ca (yêu cầu FE của BE mục 1): Ngày, Nửa ca, lý do. Dùng lại khung của Đơn nghỉ (J9), không có board riêng.
// "Ngày" là choices["half-shift-leave"].dates; "Nửa ca" là hai cách chia ca của ngày đó do BE đưa (days[].halfShift), FE không
// tự chia. Hộp tóm tắt chỉ hiện sau lần xem trước của BE: số giờ cần bù (summary.owedMinutes) và tháng phải bù.
// Hợp đồng form như LeaveForm: nhận ctx, preview (useNewRequest.shownPreview); phát `draft` đủ trường hoặc null.
import { computed, ref, useId, watch } from 'vue';
import { dateLabel, halfShiftChoices, halfShiftOwedLines, startDates } from '@/builders/api/staff-requests';
import type { HalfShift, HalfShiftDraft, PreviewResult, RequestContext } from '@/mock/staff-requests-types';
import PhIcon from '@/views/staff-phone/components/PhIcon.vue';
import RequestSummary from './RequestSummary.vue';

const props = defineProps<{ ctx: RequestContext; ngay?: string | null; preview?: PreviewResult<'half-shift-leave'> | null }>();
const emit = defineEmits<{ draft: [draft: HalfShiftDraft | null] }>();

const id = useId();
const date = ref('');
const half = ref<HalfShift | ''>('');
const reason = ref('');

const dates = computed(() => startDates(props.ctx, 'half-shift-leave'));
const halves = computed(() => halfShiftChoices(props.ctx, date.value));
const lines = computed(() => (props.preview?.ok ? halfShiftOwedLines(props.preview.summary) : []));

// Bỏ lựa chọn không còn hợp lệ (đổi ngày, tải lại request-context sau khi server từ chối).
function fit() {
  if (!dates.value.includes(date.value)) date.value = '';
  if (!halves.value.some(h => h.half === half.value)) half.value = '';
}
watch([date, () => props.ctx], fit);

const draft = computed<HalfShiftDraft | null>(() =>
  date.value && half.value && reason.value.trim() ? { date: date.value, half: half.value, reason: reason.value.trim() } : null
);
watch(draft, d => emit('draft', d), { immediate: true });
</script>

<template>
  <div class="nr-fl">
    <label :for="`${id}-ngay`">Ngày</label>
    <div class="nr-box nr-dt">
      <select :id="`${id}-ngay`" v-model="date" class="nr-in">
        <option value="" disabled>Chọn ngày</option>
        <option v-for="d in dates" :key="d" :value="d">{{ dateLabel(d) }}</option>
      </select>
      <PhIcon name="cal" />
    </div>
  </div>
  <div class="nr-fl nr-range">
    <div class="nr-fl">
      <label :for="`${id}-nua`">Nửa ca</label>
      <div class="nr-box nr-sel">
        <select :id="`${id}-nua`" v-model="half" class="nr-in" :disabled="!date">
          <option value="" disabled>Chọn nửa ca làm</option>
          <option v-for="h in halves" :key="h.half" :value="h.half">{{ h.label }}</option>
        </select>
        <PhIcon name="down" />
      </div>
    </div>
    <RequestSummary :lines="lines" :preview="preview" />
  </div>
  <div class="nr-fl">
    <label :for="`${id}-ly`">Lý do</label>
    <textarea :id="`${id}-ly`" v-model="reason" class="nr-in" placeholder="Ví dụ: việc gia đình buổi chiều" />
  </div>
</template>
