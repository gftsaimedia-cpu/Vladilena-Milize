<script setup lang="ts">
// Bảng trượt "Tạm ứng": số tiền do máy chủ tính; nhân viên chỉ bấm xin hoặc rút yêu cầu đang chờ.
import { ref } from 'vue';
import { toast } from '@/components/shell/toast';
import { useLoad } from '@/composables/useLoad';
import { getMyAdvance, requestAdvance, withdrawAdvance } from '@/services/staff-phone';
import { vndc } from '@/utils/format';
import BottomSheet from './BottomSheet.vue';

const emit = defineEmits(['close']);
const { data, error } = useLoad(() => getMyAdvance());
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
  <BottomSheet v-if="data || error" title="Tạm ứng" @close="emit('close')">
    <template #badge>
      <span v-if="data && data.status" class="pill" :class="'p-' + data.status">{{ data.statusLabel }}</span>
    </template>
    <div v-if="data" class="card">
      <div class="kv">
        <span class="k">Số tiền</span><span class="v">{{ vndc(data.amount) }}</span>
      </div>
    </div>
    <div v-if="data && !data.eligible && data.reason" class="note err" role="alert">
      <div>{{ data.reason }}</div>
    </div>
    <div v-if="error" class="note err" role="alert">
      <div>{{ error.message }}</div>
    </div>
    <div class="bt">
      <button type="button" @click="emit('close')">Đóng</button>
      <button v-if="data && data.canWithdraw" type="button" class="pri" :disabled="busy" @click="act(withdrawAdvance)">
        Rút yêu cầu
      </button>
      <button
        v-else-if="data && data.canRequest"
        type="button"
        class="pri"
        :disabled="busy"
        @click="act(requestAdvance)"
      >
        Xin tạm ứng
      </button>
    </div>
  </BottomSheet>
</template>
