<script setup lang="ts">
// Hộp "Phê duyệt N phiếu" (dlg-t10-phe-duyet-50): phê duyệt cả loạt phiếu không có cảnh báo AI, hoặc không phiếu nào.
import { computed, ref } from 'vue';
import AppModal from '@/components/ui/AppModal.vue';
import Icon from '@/components/ui/Icon.vue';
import { approveBatch } from '@/services/admin-payroll';

const props = defineProps({
  month: { type: String, required: true },
  run: { type: Number, default: 1 },
  usernames: { type: Array as () => any[], default: () => [] },
  others: { type: Number, default: 0 },
  names: { type: Array as () => any[], default: () => [] },
  more: { type: Number, default: 0 },
  total: { type: Number, default: 0 }
});
const emit = defineEmits(['close', 'done']);
const busy = ref(false);
const error = ref('');

async function submit() {
  busy.value = true;
  try {
    await approveBatch(props.month, props.usernames, props.others);
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
    :title="`Phê duyệt ${total} phiếu`"
    :sub="`Bản nháp lần tính ${run}`"
    :width="640"
    :top="260"
    @close="emit('close')"
  >
    <div class="note warn">
      <Icon name="alert" />
      <div>Phê duyệt cả loạt hoặc không phiếu nào: nếu một phiếu sai, cả loạt bị từ chối và báo rõ phiếu nào.</div>
    </div>
    <div class="fld">
      <label>Phiếu</label>
      <div class="names">
        {{ names.join(', ') }}
        <span v-if="more" class="more">và {{ more }} phiếu khác</span>
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
        <Icon name="check" />Phê duyệt {{ total }} phiếu
      </button>
    </template>
  </AppModal>
</template>

<style scoped>
.names {
  font-size: 14px;
  line-height: 22px;
}
.more {
  color: var(--muted);
}
</style>
