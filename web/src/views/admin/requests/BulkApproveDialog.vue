<script setup lang="ts">
// Hộp thoại "Đồng ý N yêu cầu" (dlg-yc-dong-y-5): đồng ý cả loạt các yêu cầu không có cảnh báo AI.
// Props: items = các yêu cầu đã chọn.  Emit: close; done (đã lưu hoặc danh sách đã cũ, màn tải lại).
import { computed, ref } from 'vue';
import AppModal from '@/components/ui/AppModal.vue';
import Icon from '@/components/ui/Icon.vue';
import { approveRequests } from '@/services/admin-main';
import { dm } from '@/utils/format';
import FieldArea from './FieldArea.vue';
import { monthNo } from './helpers';

const props = defineProps({ items: { type: Array as () => any[], required: true } });
const emit = defineEmits(['close', 'done']);
const note = ref('');
const busy = ref(false);
const error = ref('');

async function submit() {
  busy.value = true;
  error.value = '';
  const res = await approveRequests(
    props.items.map(r => r.id),
    { note: note.value.trim() }
  );
  if (res.ok) {
    emit('done');
    emit('close');
    return;
  }
  busy.value = false;
  error.value = res.message;
  // Có khoản vừa bị đổi: cả loạt không được lưu, danh sách tải lại
  if (res.error === 'stale') emit('done');
}
</script>

<template>
  <AppModal
    :title="`Đồng ý ${items.length} yêu cầu`"
    :sub="`Tháng ${monthNo(items[0]?.month)}`"
    :width="600"
    :top="160"
    @close="emit('close')"
  >
    <div class="fld">
      <label>Yêu cầu</label>
      <div class="lines">
        <div v-for="r in items" :key="r.id">{{ r.name }} · {{ r.kind }} {{ dm(r.date) }}</div>
      </div>
    </div>
    <div style="height: 12px" />
    <div class="note">
      <Icon name="info" />
      <div>
        Mỗi lần gửi tối đa 200 yêu cầu. Nếu có yêu cầu vừa bị sửa, cả loạt không được lưu và danh sách sẽ tải lại.
      </div>
    </div>
    <div v-if="error" class="note err" style="margin-top: 12px">
      <Icon name="alert" />
      <div>{{ error }}</div>
    </div>
    <div class="fld">
      <label>Ghi chú <small>(không bắt buộc)</small></label>
      <FieldArea v-model="note" placeholder="Ví dụ: đã đối chiếu với lịch làm việc" />
    </div>
    <template #footer>
      <span class="sp" />
      <button type="button" class="btn" @click="emit('close')">Huỷ</button>
      <button type="button" class="btn pri" :disabled="busy || !items.length" @click="submit">
        <Icon name="check" />
        Đồng ý {{ items.length }} yêu cầu
      </button>
    </template>
  </AppModal>
</template>

<style scoped>
.lines {
  font-size: 14px;
  line-height: 22px;
}
.btn:disabled {
  opacity: 0.45;
}
</style>
