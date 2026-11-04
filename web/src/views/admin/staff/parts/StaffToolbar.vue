<script setup lang="ts">
// Hàng công cụ của thẻ danh sách: ô tìm, công tắc "Chưa kích hoạt tài khoản" (số đếm không đổi theo ô tìm),
// vùng "Đã chọn n" và nút xuất CSV.
import Icon from '@/components/ui/Icon.vue';

const q = defineModel<string>('q', { required: true });
const inactiveOnly = defineModel<boolean>('inactiveOnly', { required: true });
defineProps<{ inactiveCount: number; selectedCount: number }>();
defineEmits<{ export: [] }>();
</script>

<template>
  <div class="stools">
    <label class="find">
      <Icon name="search" :size="16" />
      <input v-model="q" type="search" placeholder="Tìm tên, mã, email…" aria-label="Tìm theo tên, mã hoặc email" />
    </label>
    <button
      type="button"
      class="swb"
      :class="{ on: inactiveOnly }"
      role="switch"
      :aria-checked="inactiveOnly"
      @click="inactiveOnly = !inactiveOnly"
    >
      <span class="sw" aria-hidden="true"><i /></span>
      Chưa kích hoạt tài khoản
      <span class="ct">{{ inactiveCount }}</span>
    </button>
    <div class="selb" aria-live="polite">{{ selectedCount > 0 ? `Đã chọn ${selectedCount}` : '' }}</div>
    <button
      type="button"
      class="exp"
      :aria-label="selectedCount > 0 ? `Xuất ${selectedCount} người đã chọn ra Excel` : 'Xuất danh sách ra Excel'"
      :title="selectedCount > 0 ? `Xuất ${selectedCount} người đã chọn ra Excel` : 'Xuất danh sách ra Excel'"
      @click="$emit('export')"
    >
      <Icon name="download" :size="16" />
    </button>
  </div>
</template>

<style scoped>
.stools {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 12px;
  padding: 16px 20px;
}
.find {
  flex: 0 1 280px;
  display: flex;
  align-items: center;
  gap: 8px;
  height: 40px;
  padding: 0 12px;
  border: 1px solid var(--control);
  border-radius: var(--r-ctl);
  background: var(--surface);
  color: var(--faint);
  font-size: 14px;
}
.find:focus-within {
  border-color: var(--text);
  outline: 2px solid var(--text);
  outline-offset: 0;
}
.find input {
  flex: 1;
  min-width: 0;
  border: 0;
  outline: 0;
  padding: 0;
  background: transparent;
  font: inherit;
  color: var(--text);
  -webkit-appearance: none;
  appearance: none;
}
.find input::-webkit-search-cancel-button {
  display: none;
}
.swb {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  width: auto;
  height: 40px;
  padding: 0 12px;
  border: 1px solid var(--control);
  border-radius: var(--r-ctl);
  background: var(--surface);
  color: var(--text);
  font-size: 14px;
  cursor: pointer;
}
.swb:focus-visible,
.exp:focus-visible {
  outline: 2px solid var(--text);
  outline-offset: 2px;
}
.swb.on {
  border-color: var(--surface-dark);
}
.sw {
  position: relative;
  flex: none;
  width: 32px;
  height: 18px;
  border-radius: 9px;
  background: var(--status-draft);
}
.sw i {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: var(--surface);
}
.swb.on .sw {
  background: var(--surface-dark);
}
.swb.on .sw i {
  left: 16px;
  background: var(--gold);
}
.ct {
  color: var(--muted);
}
.selb {
  margin-left: auto;
  font-size: 14px;
  font-weight: 600;
}
.exp {
  display: inline-grid;
  place-items: center;
  flex: none;
  width: 40px;
  height: 40px;
  padding: 0;
  border: 1px solid var(--control);
  border-radius: var(--r-ctl);
  background: var(--surface);
  color: var(--text);
  cursor: pointer;
}
@media (max-width: 767px) {
  .find {
    flex-basis: 100%;
  }
}
</style>
