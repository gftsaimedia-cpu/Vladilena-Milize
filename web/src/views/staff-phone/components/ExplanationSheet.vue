<script setup lang="ts">
// Bảng trượt "Giải trình": trả lời yêu cầu giải trình của Admin (canAnswer), giải trình ngày vắng (canExplain), giải trình lại Check-out muộn bị từ chối (canResubmit)
// hoặc giải trình lần bấm Check-in / Check-out không hợp lệ (item.submit(text) bấm lại cùng thao tác kèm lý do).
import { ref } from 'vue';
import { EXPLANATION_MAX, checkExplanationText } from '@/builders/staff-requests/punch-explanation';
import { answerExplanation, submitAbsentExplanation, submitExplanation } from '@/services/staff-phone';
import { dayLong } from '@/utils/format';
import BottomSheet from './BottomSheet.vue';

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
    else if (props.item.canAnswer) await answerExplanation({ id: props.item.id, text: checked.text });
    else if (props.item.canExplain) await submitAbsentExplanation({ date: props.item.date, text: checked.text });
    else await submitExplanation({ sessionId: props.item.sessionId, text: checked.text });
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
  <BottomSheet
    title="Giải trình"
    :sub="item.date ? `${dayLong(item.date)}/${item.date.slice(0, 4)}` : ''"
    @close="emit('close')"
  >
    <div class="fld">
      <label for="ex-text">{{ item.prompt }}</label>
      <div class="inp"><textarea id="ex-text" v-model="text" rows="4" :maxlength="EXPLANATION_MAX" /></div>
    </div>
    <div v-if="error" class="note err" role="alert">
      <div>{{ error }}</div>
    </div>
    <div v-if="item.decisionNote" class="note err">
      <div>{{ item.decisionNote }}</div>
    </div>
    <div class="bt">
      <button type="button" @click="emit('close')">Huỷ</button>
      <button type="button" class="pri" :disabled="busy" @click="submit">Gửi giải trình</button>
    </div>
  </BottomSheet>
</template>

<style scoped>
.ph-sheet .inp textarea {
  width: 100%;
  border: 0;
  outline: 0;
  background: none;
  font: inherit;
  color: inherit;
  resize: none;
}
</style>
