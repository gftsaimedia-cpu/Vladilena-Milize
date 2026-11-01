<script setup lang="ts">
// Hộp "Tính lương tháng …" (dlg-t10-tinh-luong): mỗi lần tính tạo một bản nháp mới.
import { computed, ref } from 'vue';
import AppModal from '@/components/ui/AppModal.vue';
import Icon from '@/components/ui/Icon.vue';
import { calculate } from '@/services/admin-payroll';
import { monthShort } from '@/utils/format';

const props = defineProps({
  month: { type: String, required: true },
  closedAt: { type: String, default: '' }
});
const emit = defineEmits(['close', 'done']);
const busy = ref(false);
const error = ref('');

async function submit() {
  busy.value = true;
  try {
    await calculate(props.month);
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
    :title="`Tính lương tháng ${monthShort(month)}`"
    :sub="closedAt ? `Từ bảng công đã chốt lúc ${closedAt}` : ''"
    :width="600"
    :top="300"
    @close="emit('close')"
  >
    <div class="note warn">
      <Icon name="alert" />
      <div>
        Mỗi lần tính tạo một bản mới; bản trước được giữ lại với trạng thái <b>Đã thay thế</b>, không bị xoá. Số trên
        bảng là <b>bản nháp</b> cho tới khi phê duyệt kỳ.
      </div>
    </div>
    <div v-if="error" class="note err" style="margin-top: 12px">
      <Icon name="alert" />
      <div>{{ error }}</div>
    </div>
    <template #footer>
      <span class="sp" />
      <button type="button" class="btn" @click="emit('close')">Huỷ</button>
      <button type="button" class="btn pri" :disabled="busy" @click="submit"><Icon name="play" />Tính lương</button>
    </template>
  </AppModal>
</template>
