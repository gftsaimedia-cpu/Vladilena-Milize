<script setup lang="ts">
// J17 · Giải trình (spec staff-requests 3.2, 4.4, brief FE mục 6): Ngày, trường hợp (chữ, không sửa được), giờ thực tế theo
// trường hợp, một lý do chung.
// "Ngày" chỉ gồm ngày máy báo cần giải trình (explanationDays). `ngay` (?ngay= của liên kết nhắc hay chi tiết ngày) chỉ được chọn
// sẵn khi đúng là một ngày như vậy; ngày khác hay giá trị rác thì để trống (Review Focus 2).
// Ô giờ chỉ hiện khi `needs` đòi: thiếu giờ vào là "Giờ vào thực tế", thiếu giờ ra là "Giờ ra thực tế", quên chấm công là cả
// hai; các trường hợp còn lại chỉ cần lý do. Đổi ngày thì xoá giờ đã nhập.
// Hợp đồng form như LeaveForm: nhận ctx, ngay, preview; phát `draft` đủ trường hoặc null, ngay trong watcher (không chờ).
import { computed, ref, useId, watch } from 'vue';
import { caseDetail, caseText, dateLabel, startDates } from '@/builders/api/staff-requests';
import type { ExplanationDraft, PreviewResult, RequestContext } from '@/mock/staff-requests-types';
import PhIcon from '@/views/staff-phone/components/PhIcon.vue';
import RequestSummary from './RequestSummary.vue';

const props = defineProps<{ ctx: RequestContext; ngay?: string | null; month?: string | null; preview?: PreviewResult<'explanation'> | null }>();
const emit = defineEmits<{ draft: [draft: ExplanationDraft | null] }>();

const id = useId();
// Chỉ ngày của tháng đang xem (nếu biết tháng); không biết tháng thì đủ các ngày máy báo.
const dates = computed(() => startDates(props.ctx, 'explanation').filter(d => !props.month || d.startsWith(props.month)));
const monthNo = computed(() => (props.month ? Number(props.month.slice(5, 7)) : null));
const workDate = ref(props.ngay && dates.value.includes(props.ngay) ? props.ngay : '');
const checkIn = ref('');
const checkOut = ref('');
const reason = ref('');

const due = computed(() => props.ctx.explanationDays.find(d => d.date === workDate.value) ?? null);
const needs = computed(() => due.value?.needs ?? { checkIn: false, checkOut: false });
// Giờ Admin nhắc theo giờ VN (UTC+7): "Admin nhắc giải trình lúc 09:30 28/10" (board J17).
const remind = computed(() => {
  const at = due.value?.remindedAt;
  if (!at) return '';
  const vn = new Date(Date.parse(at) + 7 * 3600000).toISOString();
  return `Admin nhắc giải trình lúc ${vn.slice(11, 16)} ${vn.slice(8, 10)}/${vn.slice(5, 7)}`;
});
const hint = computed(() =>
  needs.value.checkIn && needs.value.checkOut
    ? 'Ví dụ: quên chấm công cả ngày'
    : needs.value.checkIn
      ? 'Ví dụ: quên bấm Check-in khi đến'
      : needs.value.checkOut
        ? 'Ví dụ: quên bấm Check-out khi về'
        : 'Ví dụ: kẹt xe trên đường đi làm'
);

watch(workDate, () => {
  checkIn.value = '';
  checkOut.value = '';
});
// Tải lại request-context (server từ chối lần gửi): ngày không còn cần giải trình thì bỏ.
watch(
  () => props.ctx,
  () => {
    if (!dates.value.includes(workDate.value)) workDate.value = '';
  }
);

const draft = computed<ExplanationDraft | null>(() => {
  const n = needs.value;
  if (!due.value || !reason.value.trim() || (n.checkIn && !checkIn.value) || (n.checkOut && !checkOut.value)) return null;
  return {
    workDate: workDate.value,
    ...(n.checkIn ? { actualCheckIn: checkIn.value } : {}),
    ...(n.checkOut ? { actualCheckOut: checkOut.value } : {}),
    reason: reason.value.trim()
  };
});
watch(draft, d => emit('draft', d), { immediate: true });
</script>

<template>
  <div class="nr-fl">
    <label :for="`${id}-ngay`">Ngày</label>
    <div class="nr-box nr-sel">
      <select :id="`${id}-ngay`" v-model="workDate" class="nr-in" :disabled="!dates.length" :aria-describedby="`${id}-ngay-d`">
        <option value="" disabled>Chọn ngày</option>
        <option v-for="d in dates" :key="d" :value="d">{{ dateLabel(d) }}</option>
      </select>
      <PhIcon name="down" />
    </div>
    <span v-if="monthNo && !dates.length" :id="`${id}-ngay-d`" class="mut sm" role="status">Tháng {{ monthNo }} không có ngày nào cần giải trình</span>
    <span v-else :id="`${id}-ngay-d`" class="mut sm">
      {{ monthNo ? `Ngày của tháng ${monthNo} mà máy báo cần giải trình và chưa gửi đơn` : 'Chỉ có những ngày máy báo cần giải trình và chưa gửi đơn' }}
    </span>
  </div>
  <template v-if="due">
    <div class="nr-fl">
      <span :id="`${id}-th`" class="nr-lb">Trường hợp</span>
      <div class="nr-sum nr-case" role="group" :aria-labelledby="`${id}-th`" aria-live="polite">
        <b>{{ caseText(due.cases) }}</b>
        <div class="mut">{{ caseDetail(due) }}</div>
        <div v-if="remind" class="nr-remind"><span class="nr-dot" aria-hidden="true" />{{ remind }}</div>
      </div>
    </div>
    <div v-if="needs.checkIn" class="nr-fl">
      <label :for="`${id}-vao`">Giờ vào thực tế</label>
      <input :id="`${id}-vao`" v-model="checkIn" type="time" class="nr-in" />
    </div>
    <div v-if="needs.checkOut" class="nr-fl">
      <label :for="`${id}-ra`">Giờ ra thực tế</label>
      <input :id="`${id}-ra`" v-model="checkOut" type="time" class="nr-in" />
    </div>
    <p v-if="!needs.checkIn && !needs.checkOut" class="nr-note mut">Trường hợp này không cần nhập giờ, chỉ cần lý do.</p>
  </template>
  <RequestSummary :lines="[]" :preview="preview" />
  <div class="nr-fl">
    <label :for="`${id}-ly`">Lý do</label>
    <textarea :id="`${id}-ly`" v-model="reason" class="nr-in" :placeholder="hint" />
  </div>
</template>

<style scoped>
.nr-remind {
  margin-top: 6px;
}
.nr-dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  margin-right: 6px;
  border-radius: 50px;
  background: var(--status-pending);
  vertical-align: 1px;
}
</style>
