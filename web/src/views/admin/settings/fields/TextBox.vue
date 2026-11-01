<script setup lang="ts">
// Ô nhập chữ của hộp thoại (khung .inp): một dòng hoặc nhiều dòng (area).
import '../settings-extra.css';

defineProps({
  modelValue: { type: String, default: '' },
  placeholder: { type: String, default: '' },
  area: { type: Boolean, default: false },
  maxlength: { type: Number, default: undefined },
  label: { type: String, default: '' }
});
defineEmits(['update:modelValue']);
</script>

<template>
  <div class="inp" :class="{ area }">
    <textarea
      v-if="area"
      rows="3"
      :value="modelValue"
      :placeholder="placeholder"
      :maxlength="maxlength"
      :aria-label="label || undefined"
      @input="$emit('update:modelValue', ($event.target as HTMLInputElement).value)"
    />
    <input
      v-else
      type="text"
      autocomplete="off"
      :value="modelValue"
      :placeholder="placeholder"
      :maxlength="maxlength"
      :aria-label="label || undefined"
      @input="$emit('update:modelValue', ($event.target as HTMLInputElement).value)"
    />
  </div>
</template>
