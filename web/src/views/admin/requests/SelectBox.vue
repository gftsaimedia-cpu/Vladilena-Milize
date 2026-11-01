<script setup lang="ts">
// Ô chọn một giá trị (khung .select của thiết kế, bên trong là select thật).
// options: [{ value, label }]
import Icon from '@/components/ui/Icon.vue';

defineProps({
  modelValue: { type: String, default: '' },
  options: { type: Array as () => any[], default: () => [] },
  label: { type: String, default: '' }
});
defineEmits(['update:modelValue']);
</script>

<template>
  <span class="select">
    <select
      :value="modelValue"
      :aria-label="label || undefined"
      @change="$emit('update:modelValue', ($event.target as HTMLInputElement).value)"
    >
      <option v-for="o in options" :key="o.value" :value="o.value">{{ o.label }}</option>
    </select>
    <Icon name="chev" class="ch" />
  </span>
</template>

<style scoped>
.select {
  position: relative;
  padding-right: 0;
}
select {
  appearance: none;
  border: 0;
  background: transparent;
  font: inherit;
  color: inherit;
  cursor: pointer;
  padding: 0 24px 0 0;
  height: 100%;
}
.ch {
  position: absolute;
  right: 10px;
  pointer-events: none;
}
</style>
