<script setup lang="ts">
// Ngăn kéo phải của trang nhân viên máy tính (spec 5.1, K2): teleport vào body, khoá cuộn, bẫy focus, Esc đóng, bấm nền mờ đóng.
// Đầu ngăn kéo: tiêu đề (cũng là tên dialog) + dòng phụ, nút × "Đóng"; slot #badge nằm ngay dưới đầu; thân ở slot mặc định.
// Đóng xong mà focus rơi xuống <body> (mở thẳng từ URL, không có phần tử mở) thì trả về nút tài khoản.
//   <SideDrawer title="Thứ Ba 27/10/2026" sub="Ca HC 08:00–17:00" @close="…"><template #badge>…</template> …thân… </SideDrawer>
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { lockScroll, registerOverlayFocus, unlockScroll } from '@/components/ui/overlay-lock';
import PhIcon from '@/views/staff-phone/components/PhIcon.vue';

defineProps<{ title: string; sub?: string }>();
const emit = defineEmits<{ close: [] }>();

const panel = ref<HTMLElement | null>(null);
let release: (() => void) | null = null;

onMounted(() => {
  lockScroll();
  if (panel.value) release = registerOverlayFocus(panel.value, () => emit('close'), () => true);
});
onBeforeUnmount(() => {
  release?.();
  release = null;
  unlockScroll();
  nextTick(() => {
    if (document.activeElement === document.body) document.getElementById('sd-account')?.focus();
  });
});
</script>

<template>
  <Teleport to="body">
    <div class="sd-drawer-root">
      <div class="sd-scrim" @click="emit('close')" />
      <aside ref="panel" class="sd-drawer" role="dialog" aria-modal="true" tabindex="-1" :aria-label="title">
        <div class="sd-dh">
          <div class="sd-dt">
            <h2>{{ title }}</h2>
            <div v-if="sub" class="mut">{{ sub }}</div>
          </div>
          <button type="button" class="rb" aria-label="Đóng" @click="emit('close')"><PhIcon name="x" /></button>
        </div>
        <div v-if="$slots.badge" class="sd-db"><slot name="badge" /></div>
        <slot />
      </aside>
    </div>
  </Teleport>
</template>
