<script setup lang="ts">
// Ô "Tìm nhân sự" của thanh công cụ: gõ xong khoảng 0,25 giây mới báo ra ngoài (v-model).
import { onBeforeUnmount, ref, watch } from 'vue';
import Icon from '@/components/ui/Icon.vue';

const props = defineProps({
  modelValue: { type: String, default: '' },
  placeholder: { type: String, default: 'Tìm nhân sự' }
});
const emit = defineEmits(['update:modelValue']);
const text = ref(props.modelValue);
let timer: any = null;
watch(text, v => {
  clearTimeout(timer);
  timer = setTimeout(() => emit('update:modelValue', v.trim()), 250);
});
watch(
  () => props.modelValue,
  v => {
    if (v !== text.value.trim()) text.value = v;
  }
);
onBeforeUnmount(() => clearTimeout(timer));
</script>

<template>
  <label class="search">
    <Icon name="search" :size="14" />
    <input v-model="text" type="text" :placeholder="placeholder" :aria-label="placeholder" />
  </label>
</template>

<style scoped>
input {
  flex: 1;
  min-width: 0;
  border: 0;
  outline: 0;
  padding: 0;
  background: transparent;
  font: inherit;
  color: var(--text);
}
input::placeholder {
  color: var(--faint);
}
.search:focus-within {
  border-color: var(--text);
}
</style>
