<script setup lang="ts">
// Ô ngày nhập dd/mm/yyyy, giá trị là 'YYYY-MM-DD' ('' khi chưa nhập hoặc sai).
// boxed = khung .inp của hộp thoại (có biểu tượng lịch); mặc định là khung .fi.l.
import { ref, watch } from 'vue';
import { dmy } from '@/utils/format';
import Icon from '@/components/ui/Icon.vue';
import { parseDmy } from '../lib/date';
import '../settings-extra.css';

const props = defineProps({
  modelValue: { type: String, default: '' },
  boxed: { type: Boolean, default: false },
  placeholder: { type: String, default: 'dd/mm/yyyy' },
  label: { type: String, default: '' }
});
const emit = defineEmits(['update:modelValue']);

const text = ref(dmy(props.modelValue));
watch(
  () => props.modelValue,
  v => {
    if (parseDmy(text.value) !== v) text.value = dmy(v);
  }
);
function onInput(e?) {
  text.value = e.target.value;
  emit('update:modelValue', parseDmy(text.value) || '');
}
function onBlur() {
  const iso = parseDmy(text.value);
  if (iso) text.value = dmy(iso);
}
</script>

<template>
  <div v-if="boxed" class="inp">
    <input
      type="text"
      inputmode="numeric"
      autocomplete="off"
      :value="text"
      :placeholder="placeholder"
      :aria-label="label || undefined"
      @input="onInput"
      @blur="onBlur"
    />
    <span class="end"><Icon name="cal" /></span>
  </div>
  <label v-else class="fi l">
    <input
      type="text"
      inputmode="numeric"
      autocomplete="off"
      :value="text"
      :placeholder="placeholder"
      :aria-label="label || undefined"
      @input="onInput"
      @blur="onBlur"
    />
  </label>
</template>
