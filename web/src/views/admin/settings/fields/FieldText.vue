<script setup lang="ts">
// Ô chữ ngắn của Cài đặt (khung .fi.l): tên ca, giờ vào/ra…
import '../settings-extra.css';

defineProps({
  modelValue: { type: String, default: '' },
  placeholder: { type: String, default: '' },
  disabled: { type: Boolean, default: false },
  label: { type: String, default: '' }
});
defineEmits(['update:modelValue']);
</script>

<template>
  <label class="fi l">
    <input
      type="text"
      autocomplete="off"
      :value="modelValue"
      :placeholder="placeholder"
      :disabled="disabled"
      :aria-label="label || undefined"
      @input="$emit('update:modelValue', ($event.target as HTMLInputElement).value)"
    />
  </label>
</template>
