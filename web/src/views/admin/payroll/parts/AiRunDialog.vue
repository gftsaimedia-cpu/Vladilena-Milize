<script setup>
// Hộp "Chạy AI kiểm tra" (dlg-t10-chay-ai): AI kiểm tra theo quy tắc, chỉ gợi ý, không sửa số.
import { ref } from 'vue';
import AppModal from '@/components/ui/AppModal.vue';
import Icon from '@/components/ui/Icon.vue';
import { runAiReview } from '@/services/admin-payroll.js';

const props = defineProps({
  month: { type: String, required: true },
  run: { type: Number, default: 1 },
  total: { type: Number, default: 0 }
});
const emit = defineEmits(['close', 'done']);
const busy = ref(false);
const error = ref('');

async function submit() {
  busy.value = true;
  try {
    await runAiReview(props.month);
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
    title="Chạy AI kiểm tra"
    :sub="`Bản nháp lần tính ${run} · ${total} phiếu`"
    :width="600"
    :top="300"
    @close="emit('close')"
  >
    <div class="note gold">
      <Icon name="spark" />
      <div>
        AI kiểm tra theo 22 quy tắc trên dữ liệu của kỳ và gắn cảnh báo vào từng phiếu. AI chỉ gợi ý, không sửa số. Xong
        bước này phiếu chuyển sang <b>Chờ phê duyệt</b>.
      </div>
    </div>
    <div v-if="error" class="note err" style="margin-top: 12px">
      <Icon name="alert" />
      <div>{{ error }}</div>
    </div>
    <template #footer>
      <span class="sp" />
      <button type="button" class="btn" @click="emit('close')">Huỷ</button>
      <button type="button" class="btn pri" :disabled="busy" @click="submit">
        <Icon name="spark" />Chạy AI kiểm tra
      </button>
    </template>
  </AppModal>
</template>
