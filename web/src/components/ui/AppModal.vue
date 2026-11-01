<script setup lang="ts">
// Hộp thoại (lớp .dlg của thiết kế). Dùng:
//   <AppModal title="Chốt công tháng 10/2026" sub="Còn 2 việc…" :width="640" :top="120" @close="open = false">
//     …thân hộp…
//     <template #footer><span class="sp" /><button class="btn" @click="open = false">Huỷ</button>…</template>
//   </AppModal>
// Slot #head thay tiêu đề mặc định. dismissable=false: bấm nền hay Esc không đóng (hộp có dữ liệu đang nhập).
import { onBeforeUnmount, onMounted } from 'vue';
import Icon from './Icon.vue';
import { lockScroll, unlockScroll } from './overlay-lock';

const props = defineProps({
  title: { type: String, default: '' },
  sub: { type: String, default: '' },
  width: { type: [Number, String], default: 560 },
  top: { type: Number, default: 96 },
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
    <div class="ov-root">
      <div class="scrim" @click="dismissable && close()" />
      <div
        class="dlg"
        role="dialog"
        aria-modal="true"
        :aria-label="title || undefined"
        :style="{ width: typeof width === 'number' ? width + 'px' : width, marginTop: top + 'px' }"
      >
        <div class="dlg-h">
          <div>
            <slot name="head">
              <h2>{{ title }}</h2>
              <div v-if="sub" class="s">{{ sub }}</div>
            </slot>
          </div>
          <button type="button" class="x" aria-label="Đóng" @click="close"><Icon name="x" /></button>
        </div>
        <div class="dlg-b"><slot /></div>
        <div v-if="$slots.footer" class="dlg-f"><slot name="footer" /></div>
      </div>
    </div>
  </Teleport>
</template>
