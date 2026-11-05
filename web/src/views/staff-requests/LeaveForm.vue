<script setup lang="ts">
// J9 · Đơn nghỉ (spec staff-requests 4.4, brief FE mục 2): hình thức nghỉ, Từ ngày – Đến ngày, lý do. Chỉ nghỉ cả ngày.
// Ô ngày là danh sách chỉ gồm ngày chọn được (builder startDates / endDates): ngày làm trong window, không bị đơn nghỉ giữ;
// "Đến ngày" dừng trước ngày bị giữ kế tiếp. Đổi "Từ ngày" thì "Đến ngày" giữ nguyên nếu còn hợp lệ, không thì đặt lại (fitEnd).
// Hợp đồng form: phát `draft` là đơn đủ trường hoặc null; NewRequestBody lo xem trước, dòng tóm tắt, nút Gửi.
//   <LeaveForm :ctx="ctx" @draft="…" />
import { computed, ref, useId, watch } from 'vue';
import { dateLabel, endDates, fitEnd, startDates } from '@/builders/api/staff-requests';
import type { LeaveDraft, RequestContext } from '@/mock/staff-requests-types';
import PhIcon from '@/views/staff-phone/components/PhIcon.vue';

const props = defineProps<{ ctx: RequestContext; ngay?: string | null }>();
const emit = defineEmits<{ draft: [draft: LeaveDraft | null] }>();

const id = useId();
const leaveType = ref(props.ctx.leaveTypes[0]?.code ?? '');
const startDate = ref('');
const endDate = ref('');
const reason = ref('');

const starts = computed(() => startDates(props.ctx, 'leave'));
const ends = computed(() => endDates(props.ctx, 'leave', startDate.value));

watch(startDate, start => {
  endDate.value = start ? fitEnd(props.ctx, 'leave', start, endDate.value) : '';
});
// Tải lại request-context (server từ chối lần gửi): bỏ lựa chọn không còn hợp lệ.
watch(
  () => props.ctx,
  ctx => {
    if (!ctx.leaveTypes.some(t => t.code === leaveType.value)) leaveType.value = ctx.leaveTypes[0]?.code ?? '';
    if (!starts.value.includes(startDate.value)) startDate.value = '';
    else endDate.value = fitEnd(ctx, 'leave', startDate.value, endDate.value);
  }
);

const draft = computed<LeaveDraft | null>(() =>
  leaveType.value && startDate.value && endDate.value && reason.value.trim()
    ? { leaveType: leaveType.value, startDate: startDate.value, endDate: endDate.value, reason: reason.value.trim() }
    : null
);
watch(draft, d => emit('draft', d), { immediate: true });
</script>

<template>
  <div class="nr-fl">
    <label :for="`${id}-loai`">Hình thức nghỉ</label>
    <div class="nr-box nr-sel">
      <select :id="`${id}-loai`" v-model="leaveType" class="nr-in">
        <option v-for="t in ctx.leaveTypes" :key="t.code" :value="t.code">{{ t.label }}</option>
      </select>
      <PhIcon name="down" />
    </div>
  </div>
  <div class="nr-two">
    <div class="nr-fl">
      <label :for="`${id}-tu`">Từ ngày</label>
      <div class="nr-box nr-dt">
        <select :id="`${id}-tu`" v-model="startDate" class="nr-in">
          <option value="" disabled>Chọn ngày</option>
          <option v-for="d in starts" :key="d" :value="d">{{ dateLabel(d) }}</option>
        </select>
        <PhIcon name="cal" />
      </div>
    </div>
    <div class="nr-fl">
      <label :for="`${id}-den`">Đến ngày</label>
      <div class="nr-box nr-dt">
        <select :id="`${id}-den`" v-model="endDate" class="nr-in" :disabled="!startDate">
          <option value="" disabled>Chọn ngày</option>
          <option v-for="d in ends" :key="d" :value="d">{{ dateLabel(d) }}</option>
        </select>
        <PhIcon name="cal" />
      </div>
    </div>
  </div>
  <div class="nr-fl">
    <label :for="`${id}-ly`">Lý do</label>
    <textarea
      :id="`${id}-ly`"
      v-model="reason"
      class="nr-in"
      placeholder="Ghi rõ trường hợp, ví dụ: việc gia đình, kết hôn"
    />
  </div>
</template>
