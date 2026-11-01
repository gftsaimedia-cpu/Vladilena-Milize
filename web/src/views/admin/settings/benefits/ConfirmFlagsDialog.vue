<script setup lang="ts">
// Hộp thoại Kế toán xác nhận cờ miễn thuế, tính vào bảo hiểm của một khoản phụ cấp thêm: nhập căn cứ rồi xác nhận đúng cờ đang xem.
import { ref } from 'vue';
import { toast } from '@/components/shell/toast';
import AppModal from '@/components/ui/AppModal.vue';
import { confirmAllowanceFlags } from '@/services/admin-config';
import TextBox from '../fields/TextBox.vue';
import { REASON_MAX } from '../lib/rules';

const props = defineProps({
  row: { type: Object as () => any, required: true },
  flagsText: { type: String, default: '' },
  month: { type: String, required: true },
  rev: { type: Number, default: undefined }
});
const emit = defineEmits(['close', 'saved']);

const basis = ref('');
const saving = ref(false);
const error = ref('');

async function submit() {
  if (saving.value) return;
  saving.value = true;
  error.value = '';
  try {
    await confirmAllowanceFlags(props.row, { basis: basis.value.trim(), month: props.month, rev: props.rev });
    toast.ok('Đã xác nhận');
    emit('saved');
    emit('close');
  } catch (e) {
    error.value = e && e.message ? e.message : 'Không xác nhận được.';
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <AppModal title="Xác nhận cờ" :sub="row.label + ' · ' + flagsText" :width="520" :top="160" @close="emit('close')">
    <div v-if="error" class="note err" style="margin-bottom: 8px">{{ error }}</div>
    <div class="fld">
      <label>Căn cứ</label>
      <TextBox
        v-model="basis"
        area
        :maxlength="REASON_MAX"
        placeholder="Văn bản, điều khoản làm căn cứ"
        label="Căn cứ"
      />
    </div>
    <template #footer>
      <span class="sp"></span>
      <button type="button" class="btn" @click="emit('close')">Huỷ</button>
      <button type="button" class="btn pri" :disabled="saving" @click="submit">Xác nhận</button>
    </template>
  </AppModal>
</template>
