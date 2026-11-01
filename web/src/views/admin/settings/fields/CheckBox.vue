<script setup lang="ts">
// Ô tick (.cb). locked = tick xám, không bấm được (vai trò Admin).
import Icon from '@/components/ui/Icon.vue';
import '../settings-extra.css';

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  locked: { type: Boolean, default: false },
  label: { type: String, default: '' }
});
const emit = defineEmits(['update:modelValue']);
const toggle = () => {
  if (!props.locked) emit('update:modelValue', !props.modelValue);
};
</script>

<template>
  <button
    type="button"
    class="cb"
    :class="{ on: modelValue, lk: locked }"
    role="checkbox"
    :aria-checked="modelValue"
    :aria-label="label || undefined"
    :disabled="locked"
    @click="toggle"
  >
    <Icon v-if="modelValue" name="check" :size="12" :stroke="3" />
  </button>
</template>
