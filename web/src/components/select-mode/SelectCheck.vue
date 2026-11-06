<script setup lang="ts">
// Ô chọn 18px của chế độ chọn: trạng thái on / mixed / off; khoá thì nền nhạt và title nói vì sao không chọn được.
import Icon from '@/components/ui/Icon.vue';
import type { CheckState } from './useSelectMode';

defineProps<{ state: CheckState; label: string; disabled?: boolean; why?: string }>();
defineEmits<{ toggle: [] }>();
</script>

<template>
  <button
    type="button"
    class="smc"
    :class="{ on: state === 'true', mix: state === 'mixed' }"
    role="checkbox"
    :aria-checked="state"
    :aria-label="label"
    :disabled="disabled"
    :title="disabled ? why : undefined"
    @click.stop="$emit('toggle')"
  >
    <Icon v-if="state === 'true'" name="check" :size="12" :stroke="3" />
  </button>
</template>

<style scoped>
.smc {
  position: relative;
  width: 18px;
  height: 18px;
  flex: none;
  margin: 0;
  padding: 0;
  display: inline-grid;
  place-items: center;
  vertical-align: middle;
  border-radius: 4px;
  border: 1.5px solid var(--control);
  background: var(--surface);
  color: var(--on-primary);
  cursor: pointer;
}
.smc.on,
.smc.mix {
  background: var(--surface-dark);
  border-color: var(--surface-dark);
}
.smc.mix::after {
  content: '';
  position: absolute;
  width: 8px;
  height: 2px;
  border-radius: 1px;
  background: var(--on-primary);
}
.smc:disabled {
  background: var(--ground);
  border-color: var(--border);
  cursor: not-allowed;
}
.smc:focus-visible {
  outline: 2px solid var(--text);
  outline-offset: 2px;
}
</style>
