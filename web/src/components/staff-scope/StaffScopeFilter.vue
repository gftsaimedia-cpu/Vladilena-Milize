<script setup lang="ts">
// Cặp ô chọn đặt trước ô tìm tên trên mọi màn có danh sách nhân sự: trạng thái nhân sự và phòng ban.
// Không có danh sách phòng ban (máy chủ thật chưa có) thì ô phòng ban khoá ở "Tất cả phòng ban".
import Icon from '@/components/ui/Icon.vue';
import { PST_OPTIONS, type StaffPst } from './staffScope';

const pst = defineModel<StaffPst>('pst', { required: true });
const dept = defineModel<string>('dept', { required: true });
defineProps<{ depts: string[] }>();
</script>

<template>
  <span class="ssf">
    <span class="ssd">
      <Icon name="users" :size="16" />
      <select v-model="pst" aria-label="Trạng thái nhân sự">
        <option v-for="o in PST_OPTIONS" :key="o.value" :value="o.value">{{ o.label }}</option>
      </select>
      <Icon class="cv" name="chev" :size="16" />
    </span>
    <span class="ssd">
      <select
        v-model="dept"
        aria-label="Phòng ban"
        :disabled="!depts.length"
        :title="depts.length ? undefined : 'Chưa có danh sách phòng ban'"
      >
        <option value="">Tất cả phòng ban</option>
        <option v-for="d in depts" :key="d" :value="d">{{ d }}</option>
      </select>
      <Icon class="cv" name="chev" :size="16" />
    </span>
  </span>
</template>

<style scoped>
.ssf {
  display: inline-flex;
  flex-wrap: nowrap;
  align-items: center;
  gap: 8px;
}
/* Màn hẹp (điện thoại): hai ô xuống hàng thay vì tràn ngang. */
@media (max-width: 599px) {
  .ssf {
    flex-wrap: wrap;
    max-width: 100%;
  }
  .ssd {
    max-width: 100%;
  }
}
.ssd {
  position: relative;
  display: inline-flex;
  align-items: center;
  color: var(--muted);
}
.ssd > .i:first-child {
  position: absolute;
  left: 12px;
  pointer-events: none;
}
.ssd select {
  height: 40px;
  max-width: 220px;
  padding: 0 36px 0 14px;
  border: 1px solid var(--control);
  border-radius: var(--r-ctl);
  background: var(--surface);
  font: inherit;
  font-size: 14px;
  color: var(--text);
  appearance: none;
  -webkit-appearance: none;
  cursor: pointer;
}
.ssd > .i:first-child + select {
  padding-left: 36px;
}
.ssd select:focus-visible {
  outline: 2px solid var(--text);
  outline-offset: 2px;
}
.ssd select:disabled {
  background: var(--ground);
  border-color: var(--border);
  color: var(--muted);
  cursor: not-allowed;
}
.cv {
  position: absolute;
  right: 12px;
  pointer-events: none;
}
</style>
