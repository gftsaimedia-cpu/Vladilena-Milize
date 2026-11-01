<script setup lang="ts">
// Ô nhập nhiều dòng (khung .inp.area của thiết kế, bên trong là textarea thật).
defineProps({
  modelValue: { type: String, default: '' },
  placeholder: { type: String, default: '' },
  rows: { type: Number, default: 2 }
});
defineEmits(['update:modelValue']);
</script>

<template>
  <div class="inp area">
    <textarea
      :value="modelValue"
      :placeholder="placeholder"
      :rows="rows"
      @input="$emit('update:modelValue', ($event.target as HTMLInputElement).value)"
    />
  </div>
</template>

<style scoped>
.inp:focus-within {
  border-color: var(--text);
  box-shadow: 0 0 0 3px #e9e9e9;
}
textarea {
  width: 100%;
  border: 0;
  outline: 0;
  resize: none;
  background: transparent;
  font: inherit;
  color: inherit;
  padding: 0;
}
textarea::placeholder {
  color: #9e9e9e;
}
</style>
