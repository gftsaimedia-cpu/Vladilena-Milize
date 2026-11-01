<script setup lang="ts">
// Ô chọn có nhãn (lớp .fld .inp của thiết kế, <select> thật bên trong, mũi tên bên phải).
// warn: viền đỏ như ô "Ca cố định" khi chưa có ca.
import { useId } from 'vue';
import Icon from '@/components/ui/Icon.vue';

defineProps({
  modelValue: { type: [String, Number], default: '' },
  label: { type: String, default: '' },
  small: { type: String, default: '' },
  options: { type: Array as () => any[], required: true }, // [{ value, label }]
  warn: { type: Boolean, default: false }
});
defineEmits(['update:modelValue']);
const id = useId();
</script>

<template>
  <div class="fld" :class="{ warnf: warn }">
    <label v-if="label" :for="id"
      >{{ label }} <small v-if="small">({{ small }})</small></label
    >
    <div class="inp sel-box">
      <select
        :id="id"
        :value="modelValue"
        @change="$emit('update:modelValue', ($event.target as HTMLInputElement).value)"
      >
        <option v-for="o in options" :key="o.value" :value="o.value">{{ o.label }}</option>
      </select>
      <span class="end"><Icon name="chev" /></span>
    </div>
  </div>
</template>

<style scoped>
.sel-box {
  position: relative;
}
.inp:focus-within {
  border-color: var(--text);
  box-shadow: 0 0 0 3px #e9e9e9;
}
.warnf .inp {
  border-color: var(--err-ink);
  box-shadow: 0 0 0 3px var(--err-bg);
}
select {
  appearance: none;
  width: 100%;
  height: 38px;
  padding: 0 24px 0 0;
  border: 0;
  outline: 0;
  background: transparent;
  font: inherit;
  color: inherit;
  cursor: pointer;
}
.end {
  position: absolute;
  right: 12px;
  pointer-events: none;
}
</style>
