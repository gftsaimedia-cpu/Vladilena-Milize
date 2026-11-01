<script setup lang="ts">
// Ô nhập của hộp thoại (.fld > label + .inp): một dòng, nhiều dòng (area) hoặc chọn (options).
// Khung .inp giữ dáng thiết kế; ô nhập thật bên trong không viền, nền trong suốt.
import { useId } from 'vue';
import Icon from '@/components/ui/Icon.vue';

defineProps({
  modelValue: { type: [String, Number], default: '' },
  label: { type: String, default: '' },
  hint: { type: String, default: '' },
  placeholder: { type: String, default: '' },
  area: { type: Boolean, default: false },
  type: { type: String, default: 'text' },
  inputmode: { type: String as () => any, default: undefined },
  maxlength: { type: Number, default: undefined },
  options: { type: Array as () => any[], default: null }
});
defineEmits(['update:modelValue']);
const id = useId();
</script>

<template>
  <div class="fld">
    <label v-if="label" :for="id">
      {{ label }}
      <small v-if="hint">{{ hint }}</small>
    </label>
    <div class="inp" :class="{ area }">
      <select
        v-if="options"
        :id="id"
        :value="modelValue"
        @change="$emit('update:modelValue', ($event.target as HTMLInputElement).value)"
      >
        <option v-for="o in options" :key="o.value" :value="o.value">{{ o.label }}</option>
      </select>
      <textarea
        v-else-if="area"
        :id="id"
        :value="modelValue"
        :placeholder="placeholder"
        :maxlength="maxlength"
        @input="$emit('update:modelValue', ($event.target as HTMLInputElement).value)"
      />
      <input
        v-else
        :id="id"
        :type="type"
        :value="modelValue"
        :placeholder="placeholder"
        :inputmode="inputmode"
        :maxlength="maxlength"
        @input="$emit('update:modelValue', ($event.target as HTMLInputElement).value)"
      />
      <span v-if="options" class="end"><Icon name="chev" /></span>
      <span v-else-if="$slots.end" class="end"><slot name="end" /></span>
    </div>
  </div>
</template>

<style scoped>
.inp {
  position: relative;
}
.inp:focus-within {
  border-color: var(--text);
  box-shadow: 0 0 0 3px #e9e9e9;
}
.inp input,
.inp textarea,
.inp select {
  flex: 1;
  min-width: 0;
  border: 0;
  outline: 0;
  background: transparent;
  font: inherit;
  color: inherit;
  padding: 0;
}
.inp textarea {
  resize: none;
  align-self: stretch;
  min-height: 54px;
}
.inp select {
  appearance: none;
  cursor: pointer;
  align-self: stretch;
}
.inp select + .end {
  pointer-events: none;
}
.inp ::placeholder {
  color: #9e9e9e;
}
</style>
