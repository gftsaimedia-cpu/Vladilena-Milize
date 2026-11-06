<script setup lang="ts">
// Thanh đen của chế độ chọn: Huỷ · tên thao tác · "Đã chọn N / M <đơn vị>" · ghi chú · [ô chọn thêm] · nút chạy (khoá khi chưa đủ).
// Tiêu điểm: hiện ra khi nút mở vừa biến mất (tiêu điểm rơi về body) thì đặt vào Huỷ; đóng lại khi tiêu điểm đang trong
// thanh (Huỷ, nút chạy) hay đã rơi về body thì trả về nút đã mở chế độ (opener.ts).
import { onBeforeUnmount, onMounted, onUnmounted, ref } from 'vue';
import Icon from '@/components/ui/Icon.vue';
import { focusOpener } from './opener';

defineProps<{
  title: string;
  count: number;
  total: number;
  unit: string;
  note?: string;
  goLabel: string;
  goDisabled: boolean;
  /** Đang chạy: Huỷ khoá, vì các mục đã gửi đi không dừng được; chạy xong màn tự thoát chế độ. */
  running?: boolean;
}>();
defineEmits<{ quit: []; run: [] }>();

const bar = ref<HTMLElement | null>(null);
const quitBtn = ref<HTMLButtonElement | null>(null);
const idle = () => !document.activeElement || document.activeElement === document.body;
onMounted(() => {
  if (idle()) quitBtn.value?.focus();
});
let giveBack = false;
onBeforeUnmount(() => {
  giveBack = idle() || !!bar.value?.contains(document.activeElement);
});
// onUnmounted chạy sau khi cả màn đã vẽ lại, lúc nút mở chế độ (hay dòng kết quả) đã có trong trang.
onUnmounted(() => {
  if (giveBack) focusOpener();
});
</script>

<template>
  <div class="smb-wrap">
    <div ref="bar" class="smb" role="toolbar" :aria-label="`${title} cho nhiều ${unit}`">
      <button
        ref="quitBtn"
        type="button"
        class="smx"
        aria-label="Huỷ, thoát chế độ chọn"
        :disabled="running"
        @click="$emit('quit')"
      >
        <Icon name="x" :size="18" :stroke="2" />
      </button>
      <span class="smt">{{ title }}</span>
      <span aria-live="polite">Đã chọn <span class="smn">{{ count }}</span> / {{ total }} {{ unit }}</span>
      <span v-if="note" class="smm">{{ note }}</span>
      <span class="smg" />
      <slot />
      <button type="button" class="smgo" :disabled="goDisabled" @click="$emit('run')">{{ goLabel }}</button>
    </div>
  </div>
</template>

<style scoped>
.smb-wrap {
  padding: 0 20px 16px;
}
.smb {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 12px;
  min-height: 56px;
  padding: 8px;
  border-radius: 12px;
  background: var(--surface-dark);
  color: var(--on-primary);
  font-size: 14px;
}
.smx {
  width: 40px;
  height: 40px;
  flex: none;
  display: grid;
  place-items: center;
  border: 0;
  border-radius: var(--r-ctl);
  background: transparent;
  color: var(--on-primary);
  cursor: pointer;
}
.smx:hover:not(:disabled) {
  background: var(--surface-dark-raised);
}
.smx:disabled {
  color: var(--ink-on-dark-muted);
  cursor: default;
}
.smt,
.smn {
  font-weight: 600;
}
.smn {
  color: var(--gold);
}
.smm {
  font-size: 12px;
  line-height: 16px;
  color: var(--ink-on-dark-muted);
}
.smg {
  flex-grow: 1;
}
.smb :deep(select) {
  height: 40px;
  margin: 0;
  padding: 0 12px;
  border-radius: var(--r-ctl);
  border: 1px solid var(--muted);
  background: var(--surface-dark-raised);
  font: inherit;
  color: var(--on-primary);
  cursor: pointer;
}
.smgo {
  height: 40px;
  padding: 0 16px;
  border-radius: var(--r-ctl);
  border: 1px solid var(--gold);
  background: var(--gold);
  font: inherit;
  font-weight: 600;
  color: var(--text);
  white-space: nowrap;
  cursor: pointer;
}
.smgo:disabled {
  background: var(--surface-dark-raised);
  border-color: var(--surface-dark-raised);
  color: var(--ink-on-dark-muted);
  cursor: not-allowed;
}
.smb button:focus-visible,
.smb :deep(select:focus-visible) {
  outline: 2px solid var(--gold);
  outline-offset: 2px;
}
@media (max-width: 767px) {
  .smb-wrap {
    padding-inline: 16px;
  }
}
</style>
