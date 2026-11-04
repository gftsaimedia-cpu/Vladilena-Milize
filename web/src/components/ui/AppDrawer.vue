<script setup lang="ts">
// Ngăn kéo bên phải (lớp .drw của thiết kế, rộng 720 mặc định). Dùng như AppModal:
//   <AppDrawer title="Phụ cấp" sub="…" @close="…"> …thân… <template #footer>…</template> </AppDrawer>
// Thân ngăn kéo tự cuộn; chân (#footer) dính đáy. `floating`: thẻ nổi cách mép 16px, bo 24px, không bóng, rộng 540
// (kiểu của phiếu lương); CSS nằm ở .drw.floating, không đổi gì khi tắt.
import { onBeforeUnmount, onMounted, ref } from 'vue';
import Icon from './Icon.vue';
import { lockScroll, registerOverlayFocus, unlockScroll } from './overlay-lock';

const props = defineProps({
  title: { type: String, default: '' },
  sub: { type: String, default: '' },
  width: { type: [Number, String], default: 720 },
  dismissable: { type: Boolean, default: true },
  floating: { type: Boolean, default: false }
});
const emit = defineEmits(['close']);
const close = () => emit('close');
const dialog = ref<HTMLElement | null>(null);
let unregisterFocus = () => {};
onMounted(() => {
  lockScroll();
  if (dialog.value) unregisterFocus = registerOverlayFocus(dialog.value, close, () => props.dismissable);
});
onBeforeUnmount(() => {
  unregisterFocus();
  unlockScroll();
});
</script>

<template>
  <Teleport to="body">
    <div class="drw-root" style="overflow: hidden">
      <div class="scrim" @click="dismissable && close()" />
      <aside
        ref="dialog"
        class="drw"
        :class="{ floating }"
        role="dialog"
        aria-modal="true"
        tabindex="-1"
        :aria-label="title || undefined"
        :style="
          floating
            ? undefined
            : {
                width: typeof width === 'number' ? width + 'px' : width,
                maxWidth: '100vw',
                boxSizing: 'border-box'
              }
        "
      >
        <div class="drw-h">
          <div>
            <slot name="head">
              <h2>{{ title }}</h2>
              <div v-if="sub" class="s">{{ sub }}</div>
            </slot>
          </div>
          <button type="button" class="x" aria-label="Đóng" @click="close"><Icon name="x" /></button>
        </div>
        <slot />
        <div v-if="$slots.footer" class="drw-f"><slot name="footer" /></div>
      </aside>
    </div>
  </Teleport>
</template>
