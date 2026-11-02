<script setup lang="ts">
// Ô nhập có nhãn của hộp thoại/ngăn kéo (lớp .fld .inp của thiết kế, ô nhập thật bên trong).
// kind: text | password | number | date | time | area. Date values stay ISO YYYY-MM-DD.
import { ref, useId, watch } from 'vue';
import Icon from '@/components/ui/Icon.vue';

const props = defineProps({
  modelValue: { type: [String, Number], default: '' },
  label: { type: String, default: '' },
  small: { type: String, default: '' },
  kind: { type: String, default: 'text' },
  placeholder: { type: String, default: '' },
  icon: { type: String, default: '' },
  step: { type: [String, Number], default: undefined },
  autofocus: { type: Boolean, default: false }
});
const emit = defineEmits(['update:modelValue']);
const id = useId();

const toText = v => (props.kind === 'date' && v ? String(v).slice(0, 10) : (v ?? ''));
const text = ref(toText(props.modelValue));
watch(
  () => props.modelValue,
  v => {
    if (String(v ?? '') !== String(text.value)) text.value = toText(v);
  }
);
function onInput(e?) {
  text.value = e.target.value;
  if (props.kind === 'number') emit('update:modelValue', text.value === '' ? '' : Number(text.value));
  else emit('update:modelValue', text.value);
}
const vFocus = { mounted: (el, { value }: any) => value && el.focus() };
</script>

<template>
  <div class="fld">
    <label v-if="label" :for="id"
      >{{ label }} <small v-if="small">({{ small }})</small></label
    >
    <div class="inp" :class="{ area: kind === 'area' }">
      <textarea
        v-if="kind === 'area'"
        :id="id"
        v-focus="autofocus"
        :value="text"
        :placeholder="placeholder"
        @input="onInput"
      />
      <input
        v-else
        :id="id"
        v-focus="autofocus"
        :type="kind === 'password' ? 'password' : kind === 'number' ? 'number' : kind === 'date' ? 'date' : 'text'"
        :step="step"
        :value="text"
        :placeholder="kind === 'time' ? 'hh:mm' : placeholder"
        autocomplete="off"
        @input="onInput"
      />
      <span v-if="icon && kind !== 'date'" class="end"><Icon :name="icon" /></span>
    </div>
  </div>
</template>

<style scoped>
.inp:focus-within {
  border-color: var(--text);
  box-shadow: 0 0 0 3px #e9e9e9;
}
input,
textarea {
  flex: 1;
  min-width: 0;
  width: 100%;
  border: 0;
  outline: 0;
  background: transparent;
  font: inherit;
  color: inherit;
  padding: 0;
  height: 38px;
}
textarea {
  height: 62px;
  resize: none;
  line-height: 20px;
}
input::placeholder,
textarea::placeholder {
  color: #9e9e9e;
}
input[type='number'] {
  appearance: textfield;
}
</style>
