<script setup lang="ts">
// Hàng công cụ của thẻ danh sách: cặp bộ lọc nhân sự (trạng thái, phòng ban), ô tìm, hai thao tác nhiều người
// ("Gán ca", "Đổi phòng ban"; ẩn khi đang chọn hoặc khi máy chủ chưa hỗ trợ) và nút xuất các dòng đang lọc.
// `none`: danh sách đang lọc không còn ai chọn được (vd. chỉ người đã nghỉ việc), hai nút khoá kèm lời giải thích.
import StaffScopeFilter from '@/components/staff-scope/StaffScopeFilter.vue';
import type { StaffPst } from '@/components/staff-scope/staffScope';
import BulkButton from '@/components/select-mode/BulkButton.vue';
import Icon from '@/components/ui/Icon.vue';

const q = defineModel<string>('q', { required: true });
const pst = defineModel<StaffPst>('pst', { required: true });
const dept = defineModel<string>('dept', { required: true });
defineProps<{ depts: string[]; bulk: boolean; none?: boolean }>();
const NONE_WHY = 'Không có người nào chọn được trong danh sách đang lọc';
defineEmits<{ export: []; shift: []; move: [] }>();
</script>

<template>
  <div class="stools">
    <StaffScopeFilter v-model:pst="pst" v-model:dept="dept" :depts="depts" />
    <label class="find">
      <Icon name="search" :size="16" />
      <input v-model="q" type="search" placeholder="Tìm tên, mã, email…" aria-label="Tìm theo tên, mã hoặc email" />
    </label>
    <span class="sp" />
    <template v-if="bulk">
      <BulkButton icon="clock" :disabled="none" :title="none ? NONE_WHY : undefined" @click="$emit('shift')">Gán ca</BulkButton>
      <BulkButton icon="team" :disabled="none" :title="none ? NONE_WHY : undefined" @click="$emit('move')">
        Đổi phòng ban
      </BulkButton>
    </template>
    <button
      type="button"
      class="exp"
      aria-label="Xuất danh sách ra Excel"
      title="Xuất danh sách ra Excel"
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
  flex: 0 1 240px;
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
.sp {
  flex-grow: 1;
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
.exp:focus-visible {
  outline: 2px solid var(--text);
  outline-offset: 2px;
}
@media (max-width: 767px) {
  .find {
    flex-basis: 100%;
  }
}
</style>
