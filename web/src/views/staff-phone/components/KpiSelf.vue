<script setup lang="ts">
// Ô điểm Tự đánh giá KPI của tháng đang xem: lưu qua PUT /kpi/scores; kỳ đã chốt thì chỉ đọc.
import { ref, watch } from 'vue';
import { toast } from '@/components/shell/toast';
import { getSelfKpi, saveSelfKpi } from '@/services/staff-phone';

const props = defineProps({ month: { type: String, required: true } });
const info = ref(null);
const text = ref('');
const busy = ref(false);

watch(
  () => props.month,
  async month => {
    info.value = null;
    if (!month) return;
    try {
      const res = await getSelfKpi(month);
      if (month !== props.month) return;
      info.value = res;
      text.value = res && res.self !== null ? String(res.self) : '';
    } catch {
      info.value = null;
    }
  },
  { immediate: true }
);

async function save() {
  if (busy.value || !info.value || info.value.locked || String(text.value).trim() === '') return;
  busy.value = true;
  try {
    const res = await saveSelfKpi({ month: props.month, self: Number(text.value) });
    info.value = { ...info.value, self: res.self };
    text.value = String(res.self);
    toast.ok('Đã lưu');
  } catch (e) {
    toast.error(e && e.message);
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <section v-if="info" class="sec">
    <div class="h2">Tự đánh giá KPI</div>
    <div class="card">
      <div class="row">
        <div class="inp">
          <input
            v-model="text"
            type="number"
            min="0"
            max="100"
            step="0.01"
            inputmode="decimal"
            aria-label="Điểm tự đánh giá"
            :disabled="info.locked || busy"
            @keydown.enter="save"
          />
        </div>
        <button
          v-if="!info.locked"
          type="button"
          class="btn pri"
          :disabled="busy || String(text).trim() === ''"
          @click="save"
        >
          Lưu
        </button>
      </div>
    </div>
  </section>
</template>

<style scoped>
.row {
  display: flex;
  gap: 12px;
  align-items: center;
  padding: 12px 16px;
}
.inp {
  flex: 1;
}
.inp input {
  width: 100%;
  border: 0;
  outline: 0;
  background: transparent;
  font: inherit;
  color: inherit;
}
</style>
