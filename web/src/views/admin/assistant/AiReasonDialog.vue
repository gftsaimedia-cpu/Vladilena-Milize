<script setup>
// Hộp thoại "Lý do AI cảnh báo" của một cảnh báo (dlg-ai-ly-do), mở từ Trợ lý AI và từ thẻ Cảnh báo AI của Tổng quan.
// Props: id = mã cảnh báo.  Emit: close; skipped (đã bấm "Bỏ qua cảnh báo này", màn gọi tải lại danh sách).
import { ref } from 'vue';
import AppModal from '@/components/ui/AppModal.vue';
import { useLoad } from '@/composables/useLoad.js';
import { getWarning, skipWarning } from '@/services/admin-main.js';
import WarningCard from './WarningCard.vue';

const props = defineProps({ id: { type: String, required: true } });
const emit = defineEmits(['close', 'skipped']);
const { data: warning } = useLoad(
  () => getWarning(props.id),
  () => props.id
);
const busy = ref(false);

async function skip() {
  if (busy.value) return;
  busy.value = true;
  try {
    await skipWarning(props.id);
    emit('skipped');
    emit('close');
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <AppModal
    title="Lý do AI cảnh báo"
    sub="Quy tắc nào, số liệu nào, ngưỡng nào · AI chỉ gợi ý, bạn quyết định"
    :width="600"
    :top="150"
    @close="emit('close')"
  >
    <WarningCard v-if="warning" :warning="warning" show-person @skip="!busy && skip()" />
    <template #footer>
      <span class="sp" />
      <button type="button" class="btn" @click="emit('close')">Đóng</button>
    </template>
  </AppModal>
</template>
