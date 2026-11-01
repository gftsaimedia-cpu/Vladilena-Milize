<script setup lang="ts">
// Hộp "Mở lại" một bước kỳ lương: lý do gửi nguyên văn cho máy chủ; lỗi của máy chủ hiện nguyên văn.
import { ref } from 'vue';
import AppModal from '@/components/ui/AppModal.vue';
import Icon from '@/components/ui/Icon.vue';
import { reopenStep } from '@/services/admin-payroll';
import { monthShort } from '@/utils/format';
import DlgField from './DlgField.vue';

const props = defineProps({
  month: { type: String, required: true },
  step: { type: String, required: true }, // 'hours' | 'draft' | 'approval'
  label: { type: String, default: 'Mở lại' }
});
const emit = defineEmits(['close', 'done']);

const reason = ref('');
const error = ref('');
const busy = ref(false);

async function submit() {
  busy.value = true;
  error.value = '';
  try {
    await reopenStep(props.month, props.step, reason.value);
    emit('done');
  } catch (e) {
    error.value = e.message;
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <AppModal :title="label" :sub="`Kỳ lương tháng ${monthShort(month)}`" :width="640" :top="260" @close="emit('close')">
    <DlgField v-model="reason" label="Lý do" area :maxlength="300" />
    <div v-if="error" class="note err" style="margin-top: 12px">
      <Icon name="alert" />
      <div>{{ error }}</div>
    </div>
    <template #footer>
      <span class="sp" />
      <button type="button" class="btn" @click="emit('close')">Huỷ</button>
      <button type="button" class="btn pri" :disabled="busy" @click="submit"><Icon name="unlock" />{{ label }}</button>
    </template>
  </AppModal>
</template>
