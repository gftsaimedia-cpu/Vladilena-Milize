<script setup lang="ts">
// Hộp "Giải trình": trả lời yêu cầu giải trình của Admin (canAnswer), giải trình ngày vắng (canExplain), giải trình lại Check-out muộn bị từ chối (canResubmit)
// hoặc giải trình lần bấm Check-in / Check-out không hợp lệ (item.submit(text) bấm lại cùng thao tác kèm lý do).
import { ref } from 'vue';
import { EXPLANATION_MAX, checkExplanationText } from '@/builders/staff-requests/punch-explanation';
import AppModal from '@/components/ui/AppModal.vue';
import Icon from '@/components/ui/Icon.vue';
import { answerStaffExplanation, submitStaffAbsentExplanation, submitStaffExplanation } from '@/services/staff-desktop';
import { dmy } from '@/utils/format';

const props = defineProps({ item: { type: Object as () => any, required: true } });
const emit = defineEmits(['close', 'saved']);

const text = ref('');
const busy = ref(false);
const error = ref('');

async function submit() {
  if (busy.value) return;
  const checked = checkExplanationText(text.value);
  error.value = checked.error || '';
  if (checked.error) return;
  busy.value = true;
  try {
    if (props.item.submit) await props.item.submit(checked.text);
    else if (props.item.canAnswer) await answerStaffExplanation({ id: props.item.id, text: checked.text });
    else if (props.item.canExplain) await submitStaffAbsentExplanation({ date: props.item.date, text: checked.text });
    else await submitStaffExplanation({ sessionId: props.item.sessionId, text: checked.text });
    emit('saved');
    emit('close');
  } catch (e) {
    error.value = (e && e.message) || 'Không gửi được giải trình';
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <AppModal title="Giải trình" :sub="item.date ? dmy(item.date) : ''" :width="520" @close="emit('close')">
    <div class="fld">
      <label for="ex-text">{{ item.prompt }}</label>
      <div class="inp"><textarea id="ex-text" v-model="text" rows="4" :maxlength="EXPLANATION_MAX" /></div>
    </div>
    <div v-if="error" class="note err" role="alert">
      <Icon name="alert" />
      <div>{{ error }}</div>
    </div>
    <template #footer>
      <span class="sp" />
      <button type="button" class="btn" @click="emit('close')">Huỷ</button>
      <button type="button" class="btn pri" :disabled="busy" @click="submit">Gửi giải trình</button>
    </template>
  </AppModal>
</template>

<style scoped>
.inp textarea {
  width: 100%;
  border: 0;
  outline: 0;
  background: none;
  font: inherit;
  color: inherit;
  resize: none;
}
</style>
