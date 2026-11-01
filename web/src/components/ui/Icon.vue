<script setup lang="ts">
// <Icon name="check" :size="16" :stroke="1.6" />: biểu tượng nét của thiết kế (icons.js). Tên không có thì vẽ khung rỗng.
import { computed } from 'vue';
import { ICONS } from './icons';

const props = defineProps({
  name: { type: String, required: true },
  size: { type: [Number, String], default: 16 },
  stroke: { type: [Number, String], default: 1.6 }
});
const paths = computed(() => ICONS[props.name] || '');
</script>

<template>
  <svg
    class="i"
    :width="size"
    :height="size"
    :style="{ width: size + 'px', height: size + 'px' }"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    :stroke-width="stroke"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    v-html="paths"
  />
</template>
