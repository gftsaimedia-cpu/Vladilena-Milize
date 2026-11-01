<script setup lang="ts">
// Ô số của Cài đặt (khung .fi): gõ số thật. money = hàng nghìn ngăn bằng dấu chấm; dim = xám khi bằng 0.
//   <FieldNum v-model="row.value" unit="%" /> · <FieldNum v-model="x" money /> · <FieldNum v-model="x" prefix="×" />
import { computed, ref } from 'vue';
import { vnd } from '@/utils/format';
import '../settings-extra.css';

const props = defineProps({
  modelValue: { type: Number, default: null },
  unit: { type: String, default: '' },
  prefix: { type: String, default: '' },
  money: { type: Boolean, default: false },
  dim: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false },
  label: { type: String, default: '' }
});
const emit = defineEmits(['update:modelValue']);

const typing = ref(null); // chữ đang gõ dở (vd. "1,"); null = hiện theo giá trị
const shown = computed(() => {
  if (typing.value !== null) return typing.value;
  if (props.modelValue == null) return '';
  return props.money ? vnd(props.modelValue) : String(props.modelValue).replace('.', ',');
});

function onInput(e?) {
  if (props.money) {
    const digits = e.target.value.replace(/\D/g, '');
    const n = digits === '' ? null : Number(digits);
    e.target.value = n == null ? '' : vnd(n);
    emit('update:modelValue', n);
    return;
  }
  const raw = e.target.value.replace(/[^\d,]/g, '');
  const cut =
    raw.indexOf(',') < 0 ? raw : raw.slice(0, raw.indexOf(',') + 1) + raw.slice(raw.indexOf(',') + 1).replace(/,/g, '');
  typing.value = cut;
  e.target.value = cut;
  emit('update:modelValue', cut === '' ? null : Number(cut.replace(',', '.')));
}
</script>

<template>
  <label class="fi" :class="{ z: dim && modelValue === 0 }">
    <span v-if="prefix">{{ prefix }}</span>
    <input
      type="text"
      inputmode="decimal"
      autocomplete="off"
      :value="shown"
      :disabled="disabled"
      :aria-label="label || undefined"
      :style="{ width: Math.max(2, shown.length + 1) + 'ch' }"
      @input="onInput"
      @blur="typing = null"
    />
    <i v-if="unit">{{ unit }}</i>
  </label>
</template>
