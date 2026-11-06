<script setup lang="ts">
// J15 · Làm thêm giờ (spec staff-requests 4.4, brief FE mục 4): Ngày, Từ – Đến (giờ tròn), lý do.
// "Ngày" do BE đưa (choices.overtime: ngày còn giờ trống, tháng chưa có Nghỉ có làm bù và chưa đủ 40 giờ). "Từ" và "Đến" lấy từ
// `otHours` của ngày (BE đã bỏ khung vượt số phút OT còn lại của tháng). Đổi ngày thì giữ giờ còn trong bảng; "Đến" không còn
// thì về giờ kết thúc đầu tiên (board J15).
// Hộp tóm tắt nằm giữa hai ô giờ và Lý do: số giờ của khung đang chọn và số giờ OT đã đăng ký trong tháng (builder).
// Hợp đồng form như LeaveForm: nhận ctx, ngay, preview; phát `draft` đủ trường hoặc null, ngay trong watcher (không chờ).
import { computed, ref, useId, watch } from 'vue';
import {
  dateLabel,
  endHours,
  otHoursLine,
  otMonthLine,
  startDates,
  startHours
} from '@/builders/api/staff-requests';
import type { OvertimeDraft, PreviewResult, RequestContext } from '@/mock/staff-requests-types';
import PhIcon from '@/views/staff-phone/components/PhIcon.vue';
import RequestSummary from './RequestSummary.vue';

const props = defineProps<{ ctx: RequestContext; ngay?: string | null; preview?: PreviewResult<'overtime'> | null }>();
const emit = defineEmits<{ draft: [draft: OvertimeDraft | null] }>();

const id = useId();
const otDate = ref('');
const startTime = ref(''); // 'HH:00'
const endTime = ref('');
const reason = ref('');

const hh = (h: number) => `${String(h).padStart(2, '0')}:00`;
const hourOf = (t: string) => Number(t.slice(0, 2));
const month = computed(() => otDate.value.slice(0, 7));

const dates = computed(() => startDates(props.ctx, 'overtime'));
const day = computed(() => props.ctx.days.find(d => d.date === otDate.value) ?? null);
const starts = computed(() => (day.value ? startHours(day.value.otHours).map(hh) : []));
const ends = computed(() =>
  day.value && startTime.value ? endHours(day.value.otHours, hourOf(startTime.value)).map(e => hh(e.end)) : []
);
const lines = computed(() =>
  day.value
    ? [
        startTime.value && endTime.value ? otHoursLine(day.value, hourOf(startTime.value), hourOf(endTime.value)) : '',
        otMonthLine(props.ctx, month.value)
      ]
    : []
);

// Bỏ lựa chọn không còn hợp lệ (đổi ngày, đổi "Từ", tải lại request-context sau khi server từ chối).
function fit() {
  if (!dates.value.includes(otDate.value)) otDate.value = '';
  if (!starts.value.includes(startTime.value)) startTime.value = '';
  if (!ends.value.includes(endTime.value)) endTime.value = startTime.value ? (ends.value[0] ?? '') : '';
}
watch([otDate, startTime, () => props.ctx], fit);

const draft = computed<OvertimeDraft | null>(() =>
  otDate.value && startTime.value && endTime.value && reason.value.trim()
    ? { otDate: otDate.value, startTime: startTime.value, endTime: endTime.value, reason: reason.value.trim() }
    : null
);
watch(draft, d => emit('draft', d), { immediate: true });
</script>

<template>
  <div class="nr-fl">
    <label :for="`${id}-ngay`">Ngày</label>
    <div class="nr-box nr-sel">
      <select :id="`${id}-ngay`" v-model="otDate" class="nr-in">
        <option value="" disabled>Chọn ngày</option>
        <option v-for="d in dates" :key="d" :value="d">{{ dateLabel(d) }}</option>
      </select>
      <PhIcon name="down" />
    </div>
  </div>
  <div class="nr-fl nr-range">
    <div class="nr-two">
      <div class="nr-fl">
        <label :for="`${id}-tu`">Giờ bắt đầu</label>
        <div class="nr-box nr-sel">
          <select :id="`${id}-tu`" v-model="startTime" class="nr-in" :disabled="!otDate">
            <option value="" disabled>Chọn giờ</option>
            <option v-for="h in starts" :key="h" :value="h">{{ h }}</option>
          </select>
          <PhIcon name="down" />
        </div>
      </div>
      <div class="nr-fl">
        <label :for="`${id}-den`">Giờ kết thúc</label>
        <div class="nr-box nr-sel">
          <select :id="`${id}-den`" v-model="endTime" class="nr-in" :disabled="!startTime">
            <option value="" disabled>Chọn giờ</option>
            <option v-for="h in ends" :key="h" :value="h">{{ h }}</option>
          </select>
          <PhIcon name="down" />
        </div>
      </div>
    </div>
    <RequestSummary :lines="lines" :preview="preview" />
  </div>
  <div class="nr-fl">
    <label :for="`${id}-ly`">Lý do</label>
    <textarea :id="`${id}-ly`" v-model="reason" class="nr-in" placeholder="Ví dụ: chạy bảng lương cuối tháng" />
  </div>
</template>
