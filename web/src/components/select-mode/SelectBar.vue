<script setup lang="ts">
// Thanh đen của chế độ chọn: Huỷ · tên thao tác · "Đã chọn N / M <đơn vị>" · ghi chú · [ô chọn thêm] · nút chạy (khoá khi chưa đủ).
import Icon from '@/components/ui/Icon.vue';

defineProps<{
  title: string;
  count: number;
  total: number;
  unit: string;
  note?: string;
  goLabel: string;
  goDisabled: boolean;
}>();
defineEmits<{ quit: []; run: [] }>();
</script>

<template>
  <div class="smb-wrap">
    <div class="smb" role="toolbar" :aria-label="`${title} cho nhiều ${unit}`">
      <button type="button" class="smx" aria-label="Huỷ, thoát chế độ chọn" @click="$emit('quit')">
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
.smx:hover {
  background: var(--surface-dark-raised);
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
