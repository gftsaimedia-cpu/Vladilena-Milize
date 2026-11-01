<script setup lang="ts">
// Ô chọn thật. variant 'sel' = khung .sel nhỏ (trong bảng, ngăn kéo); 'inp' = khung .inp của hộp thoại.
// options: ['A', 'B'] hoặc [{ value, label }].
import { computed } from 'vue';
import Icon from '@/components/ui/Icon.vue';
import '../settings-extra.css';

const props = defineProps({
  modelValue: { type: [String, Number], default: '' },
  options: { type: Array as () => any[], default: () => [] },
  variant: { type: String, default: 'sel' },
  disabled: { type: Boolean, default: false },
  label: { type: String, default: '' }
});
defineEmits(['update:modelValue']);

const items = computed(() => props.options.map(o => (typeof o === 'object' ? o : { value: o, label: o })));
</script>

<template>
  <component :is="variant === 'inp' ? 'div' : 'span'" :class="variant === 'inp' ? 'inp' : 'sel'">
    <select
      :value="modelValue"
      :disabled="disabled"
      :aria-label="label || undefined"
      @change="$emit('update:modelValue', ($event.target as HTMLInputElement).value)"
    >
      <option v-for="o in items" :key="o.value" :value="o.value">{{ o.label }}</option>
    </select>
    <span v-if="variant === 'inp'" class="end"><Icon name="chev" /></span>
    <Icon v-else name="chev" />
  </component>
</template>
