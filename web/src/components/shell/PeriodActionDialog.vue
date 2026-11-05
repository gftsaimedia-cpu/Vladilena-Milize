<script setup lang="ts">
// Hộp xác nhận các bước kỳ lương: Phê duyệt kỳ, Đã trả lương (chỉ xác nhận) và Mở lại công, Huỷ phê duyệt (bắt buộc ghi lý do).
import { computed, ref } from 'vue';
import AppModal from '@/components/ui/AppModal.vue';
import type { PeriodAction } from '@/builders/api/period';

const REASON_MAX = 1000;
const props = defineProps<{ action: PeriodAction; month: string; payday?: string; saving?: boolean; error?: string }>();
const emit = defineEmits<{ close: []; confirm: [reason?: string] }>();

const TEXT: Record<string, { title: string; sub: string; ok: string }> = {
  approve: {
    title: 'Phê duyệt kỳ lương',
    sub: 'Mọi phiếu đã duyệt sẽ được khoá: không tính lại, không sửa điểm KPI. Có thể huỷ phê duyệt khi cần, kèm lý do.',
    ok: 'Phê duyệt kỳ lương'
  },
  pay: { title: 'Xác nhận đã trả lương', sub: 'Kỳ lương chuyển sang Đã trả lương và không mở lại được nữa.', ok: 'Đã trả lương' },
  unapprove: {
    title: 'Huỷ phê duyệt',
    sub: 'Kỳ lương về bước Đã tính, các phiếu đã duyệt được giữ nguyên.',
    ok: 'Huỷ phê duyệt'
  },
  unlock: {
    title: 'Mở lại công',
    sub: 'Kỳ lương về bước Đang chấm công; phải chốt công và tính lương lại sau khi sửa.',
    ok: 'Mở lại công'
  }
};
const text = computed(() => TEXT[props.action]);
const needReason = computed(() => props.action === 'unapprove' || props.action === 'unlock');
const reason = ref('');
const valid = computed(() => !needReason.value || reason.value.trim() !== '');
const submit = () => valid.value && !props.saving && emit('confirm', needReason.value ? reason.value.trim() : undefined);
</script>

<template>
  <AppModal :title="`${text.title} ${month}`" :sub="text.sub" :width="520" :top="200" @close="emit('close')">
    <div v-if="needReason" class="fld">
      <label for="period-reason">Lý do <small>(bắt buộc)</small></label>
      <textarea id="period-reason" v-model="reason" :maxlength="REASON_MAX" rows="3" placeholder="Ví dụ: Sửa điểm KPI của một nhân viên" />
    </div>
    <p v-else-if="action === 'pay' && payday" class="pay">Ngày trả lương theo lịch: {{ payday }}.</p>
    <div v-if="error" class="note err" role="alert" style="margin-top: 12px">{{ error }}</div>
    <template #footer>
      <span class="sp"></span>
      <button type="button" class="btn" @click="emit('close')">Huỷ</button>
      <button type="button" class="btn" :class="valid ? 'pri' : 'off'" :disabled="!valid || saving" @click="submit">
        {{ saving ? 'Đang xử lý…' : text.ok }}
      </button>
    </template>
  </AppModal>
</template>

<style scoped>
textarea {
  width: 100%;
  box-sizing: border-box;
  padding: 8px 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
  font: inherit;
  resize: vertical;
}
.pay {
  margin: 0;
}
</style>
