<script setup lang="ts">
// Hộp "Đánh dấu đã trả lương" (dlg-t10-da-tra-luong): sau khi đánh dấu, kỳ không mở lại được.
import { ref } from 'vue';
import AppModal from '@/components/ui/AppModal.vue';
import Icon from '@/components/ui/Icon.vue';
import { markPaid } from '@/services/admin-payroll';
import { monthShort, vndc } from '@/utils/format';
import DlgField from './DlgField.vue';

const props = defineProps({
  month: { type: String, required: true },
  count: { type: Number, default: 0 },
  net: { type: Number, default: 0 },
  defaultDate: { type: String, default: '' }
});
const emit = defineEmits(['close', 'done']);

const date = ref(props.defaultDate);
const reference = ref('');
const error = ref('');
const busy = ref(false);

async function submit() {
  busy.value = true;
  error.value = '';
  try {
    await markPaid(props.month, { date: date.value, ref: reference.value });
    emit('done');
  } catch (e) {
    error.value = e.message;
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <AppModal
    title="Đánh dấu đã trả lương"
    :sub="`Kỳ lương tháng ${monthShort(month)} · ${count} phiếu · thực nhận ${vndc(net)}`"
    :width="640"
    :top="260"
    @close="emit('close')"
  >
    <div class="note warn">
      <Icon name="alert" />
      <div>Sau khi đánh dấu đã trả lương, kỳ không mở lại được. Điều chỉnh về sau đi theo kỳ tiếp theo.</div>
    </div>
    <div class="g2">
      <DlgField v-model="date" class="date" label="Ngày trả lương" type="date">
        <template #end><Icon name="cal" /></template>
      </DlgField>
      <DlgField
        v-model="reference"
        label="Mã tham chiếu"
        hint="(tuỳ chọn)"
        placeholder="Số lệnh chi hoặc ghi chú ngắn"
        :maxlength="100"
      />
    </div>
    <div v-if="error" class="note err" style="margin-top: 12px">
      <Icon name="alert" />
      <div>{{ error }}</div>
    </div>
    <template #footer>
      <span class="sp" />
      <button type="button" class="btn" @click="emit('close')">Huỷ</button>
      <button type="button" class="btn pri" :disabled="busy" @click="submit">
        <Icon name="check" />Đánh dấu đã trả lương
      </button>
    </template>
  </AppModal>
</template>

<style scoped>
/* Hộp chọn ngày của trình duyệt phủ lên cả ô; biểu tượng lịch của thiết kế nằm dưới, không bắt chuột */
.date :deep(input[type='date']::-webkit-calendar-picker-indicator) {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  opacity: 0;
  cursor: pointer;
}
.date :deep(.end) {
  pointer-events: none;
}
</style>
