<script setup lang="ts">
// Hộp "Tạm ứng": số tiền do máy chủ tính; nhân viên chỉ bấm xin hoặc rút yêu cầu đang chờ.
import { ref } from 'vue';
import { toast } from '@/components/shell/toast';
import AppModal from '@/components/ui/AppModal.vue';
import Icon from '@/components/ui/Icon.vue';
import { useLoad } from '@/composables/useLoad';
import { getStaffAdvance, requestStaffAdvance, withdrawStaffAdvance } from '@/services/staff-desktop';
import { vndc } from '@/utils/format';

const emit = defineEmits(['close']);
const { data, error } = useLoad(() => getStaffAdvance());
const busy = ref(false);

async function act(fn?) {
  if (busy.value) return;
  busy.value = true;
  try {
    data.value = await fn(data.value);
  } catch (e) {
    toast.error(e && e.message);
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <AppModal v-if="data || error" title="Tạm ứng" :width="480" @close="emit('close')">
    <div v-if="data" class="adv">
      <span>Số tiền</span>
      <b>{{ vndc(data.amount) }}</b>
      <span v-if="data.status" class="pill" :class="'p-' + (data.status === 'err' ? 'err' : data.status)">{{
        data.statusLabel
      }}</span>
    </div>
    <div v-if="data && !data.eligible && data.reason" class="note err" role="alert">
      <Icon name="alert" />
      <div>{{ data.reason }}</div>
    </div>
    <div v-if="error" class="note err" role="alert">
      <Icon name="alert" />
      <div>{{ error.message }}</div>
    </div>
    <template #footer>
      <span class="sp" />
      <button type="button" class="btn" @click="emit('close')">Đóng</button>
      <button
        v-if="data && data.canWithdraw"
        type="button"
        class="btn pri"
        :disabled="busy"
        @click="act(withdrawStaffAdvance)"
      >
        Rút yêu cầu
      </button>
      <button
        v-else-if="data && data.canRequest"
        type="button"
        class="btn pri"
        :disabled="busy"
        @click="act(requestStaffAdvance)"
      >
        Xin tạm ứng
      </button>
    </template>
  </AppModal>
</template>

<style scoped>
.adv {
  display: flex;
  align-items: center;
  gap: 12px;
  justify-content: space-between;
  padding: 4px 0 8px;
}
.adv b {
  font-size: 22px;
  margin-left: auto;
}
</style>
