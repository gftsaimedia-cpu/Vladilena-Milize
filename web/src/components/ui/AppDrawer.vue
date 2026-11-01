<script setup lang="ts">
// Ngăn kéo bên phải (lớp .drw của thiết kế, rộng 720 mặc định). Dùng như AppModal:
//   <AppDrawer title="Phụ cấp" sub="…" @close="…"> …thân… <template #footer>…</template> </AppDrawer>
// Thân ngăn kéo tự cuộn; chân (#footer) dính đáy.
import { onBeforeUnmount, onMounted } from 'vue';
import Icon from './Icon.vue';
import { lockScroll, unlockScroll } from './overlay-lock';

const props = defineProps({
  title: { type: String, default: '' },
  sub: { type: String, default: '' },
  width: { type: [Number, String], default: 720 },
  dismissable: { type: Boolean, default: true }
});
const emit = defineEmits(['close']);
const close = () => emit('close');
const onKey = (e?) => {
  if (e.key === 'Escape' && props.dismissable) close();
};
onMounted(() => {
  lockScroll();
  document.addEventListener('keydown', onKey);
});
onBeforeUnmount(() => {
  unlockScroll();
  document.removeEventListener('keydown', onKey);
});
</script>

<template>
  <Teleport to="body">
    <div class="drw-root">
      <div class="scrim" @click="dismissable && close()" />
      <aside
        class="drw"
        role="dialog"
        aria-modal="true"
        :aria-label="title || undefined"
        :style="{ width: typeof width === 'number' ? width + 'px' : width }"
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
