<script setup>
// Một phát hiện của AI: nhãn AI, nội dung, nút Bỏ qua. Bỏ qua cần lý do 10–300 ký tự (mở ô nhập ngay dưới dòng).
import { ref } from 'vue';
import Icon from '@/components/ui/Icon.vue';
import { skipFinding } from '@/services/admin-payroll.js';
import DlgField from './DlgField.vue';

const props = defineProps({
  month: { type: String, required: true },
  finding: { type: Object, required: true },
  readonly: { type: Boolean, default: false }
});
const emit = defineEmits(['skipped']);
const open = ref(false);
const reason = ref('');
const error = ref('');
const busy = ref(false);

async function submit() {
  busy.value = true;
  error.value = '';
  try {
    await skipFinding(props.month, props.finding.id, reason.value);
    open.value = false;
    emit('skipped', props.finding.id);
  } catch (e) {
    error.value = e.message;
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div class="aif" :class="{ done: finding.skipped }">
    <span class="tag"><Icon name="spark" :size="11" />AI</span>
    <span>{{ finding.text }}</span>
    <span v-if="finding.skipped" class="gone">Đã bỏ qua</span>
    <button v-else-if="!readonly" type="button" class="btn sm" :aria-expanded="open" @click="open = !open">
      Bỏ qua
    </button>
  </div>
  <div v-if="open && !finding.skipped" class="why">
    <DlgField
      v-model="reason"
      label="Lý do bỏ qua"
      hint="(10–300 ký tự, ghi vào nhật ký)"
      area
      placeholder="Ghi rõ lý do để lưu vào nhật ký"
      :maxlength="300"
    />
    <div v-if="error" class="err">{{ error }}</div>
    <div class="acts">
      <button type="button" class="btn sm" @click="open = false">Huỷ</button>
      <button type="button" class="btn sm pri" :disabled="busy" @click="submit">Bỏ qua phát hiện này</button>
    </div>
  </div>
</template>

<style scoped>
.gone {
  margin-left: auto;
  font-size: 12px;
}
.why {
  padding: 0 0 8px;
}
.why .acts {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 8px;
}
.why .err {
  color: var(--err-ink);
  font-size: 12px;
  margin-top: 6px;
}
</style>
