<script setup lang="ts">
// <PhIcon name="cal" :size="20" :stroke="1.8" />: bộ biểu tượng riêng của app điện thoại (spec 3.2, R12).
// Đường vẽ chép nguyên từ ICON của gen-mobile.js (board J1–J7); nét 24×24 theo currentColor, ẩn khỏi trình đọc màn hình.
import { computed } from 'vue';
import type { PhoneIconName } from '@/mock/staff-phone';

const props = withDefaults(defineProps<{ name: PhoneIconName; size?: number; stroke?: number }>(), {
  size: 20,
  stroke: 1.8
});

const ICON: Record<PhoneIconName, string> = {
  home: '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1Z"></path>',
  cal: '<rect x="3" y="4" width="18" height="17" rx="2"></rect><path d="M16 2v4M8 2v4M3 10h18"></path>',
  doc: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z"></path><path d="M14 3v5h5M9 13h6M9 17h4"></path>',
  wallet:
    '<path d="M19 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0 0 4h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5"></path><path d="M17 14h.01"></path>',
  user: '<circle cx="12" cy="8" r="4"></circle><path d="M4 21a8 8 0 0 1 16 0"></path>',
  left: '<path d="m15 18-6-6 6-6"></path>',
  right: '<path d="m9 18 6-6-6-6"></path>',
  plus: '<path d="M12 5v14M5 12h14"></path>',
  pin: '<path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11Z"></path><circle cx="12" cy="10" r="2.5"></circle>',
  out: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"></path>',
  clock: '<circle cx="12" cy="12" r="9"></circle><path d="M12 7v5l3 2"></path>',
  leave:
    '<path d="M8 2v4M16 2v4"></path><rect x="3" y="4" width="18" height="17" rx="2"></rect><path d="m9 15 2 2 4-4"></path>',
  coin: '<circle cx="12" cy="12" r="9"></circle><path d="M14.8 9a3 3 0 0 0-2.8-1.5c-1.7 0-3 .9-3 2.2 0 3 6 1.6 6 4.6 0 1.3-1.3 2.2-3 2.2A3.2 3.2 0 0 1 9 15M12 6v1.5M12 16.5V18"></path>',
  lock: '<rect x="4" y="11" width="16" height="10" rx="2"></rect><path d="M8 11V7a4 4 0 0 1 8 0v4"></path>',
  target:
    '<circle cx="12" cy="12" r="9"></circle><circle cx="12" cy="12" r="5"></circle><circle cx="12" cy="12" r="1"></circle>',
  shield: '<path d="M12 3 4 6v6c0 4.5 3.4 8.3 8 9 4.6-.7 8-4.5 8-9V6Z"></path>',
  gift: '<rect x="3" y="8" width="18" height="4" rx="1"></rect><path d="M12 8v13M5 12v9h14v-9M12 8S10.5 3 8 3a2.5 2.5 0 0 0 0 5M12 8s1.5-5 4-5a2.5 2.5 0 0 1 0 5"></path>',
  x: '<path d="M18 6 6 18M6 6l12 12"></path>'
};
const paths = computed(() => ICON[props.name] || '');
</script>

<template>
  <svg
    class="phi"
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    :stroke-width="stroke"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    focusable="false"
    v-html="paths"
  />
</template>
