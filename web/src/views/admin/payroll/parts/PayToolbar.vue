<script setup lang="ts">
// Hàng công cụ của thẻ bảng: nút lọc trạng thái (kèm số đếm cả kỳ), ô tìm theo tên, lọc phòng ban và nút xuất Excel.
import { computed } from 'vue';
import Icon from '@/components/ui/Icon.vue';
import type { PayrollStatus, SlipCounts } from '@/mock/payroll';

const props = defineProps<{ counts: SlipCounts; depts: string[]; selectedCount: number }>();
defineEmits<{ export: [] }>();
const filter = defineModel<'all' | PayrollStatus>('filter', { required: true });
const query = defineModel<string>('query', { required: true });
const dept = defineModel<string>('dept', { required: true });

const FILTERS = [
  { key: 'all', label: 'Tất cả', dot: '' },
  { key: 'draft', label: 'Nháp', dot: 'var(--status-draft)' },
  { key: 'pending', label: 'Chờ duyệt', dot: 'var(--status-pending)' },
  { key: 'done', label: 'Đã duyệt', dot: 'var(--status-done)' },
  { key: 'rejected', label: 'Từ chối', dot: 'var(--status-rejected)' }
] as const;
const buttons = computed(() => FILTERS.map(f => ({ ...f, count: props.counts[f.key] })));
const exportLabel = computed(() =>
  props.selectedCount ? `Xuất ${props.selectedCount} phiếu đã chọn ra Excel` : 'Xuất bảng lương ra Excel'
);
</script>

<template>
  <div class="tb">
    <div class="chips" role="group" aria-label="Lọc theo trạng thái">
      <button
        v-for="f in buttons"
        :key="f.key"
        type="button"
        class="sc"
        :class="{ on: filter === f.key }"
        :aria-pressed="filter === f.key"
        @click="filter = f.key"
      >
        <span v-if="f.dot" class="dot" aria-hidden="true" :style="{ background: f.dot }" />{{ f.label }}
        <span class="ct">{{ f.count }}</span>
      </button>
    </div>
    <label class="find">
      <Icon name="search" :size="16" />
      <input v-model="query" type="text" placeholder="Tìm theo tên…" aria-label="Tìm theo tên" />
    </label>
    <span class="pick">
      <select v-model="dept" aria-label="Phòng ban">
        <option value="">Phòng ban: Tất cả</option>
        <option v-for="d in depts" :key="d" :value="d">Phòng ban: {{ d }}</option>
      </select>
      <Icon name="chev" :size="16" />
    </span>
    <button type="button" class="xp" :aria-label="exportLabel" :title="exportLabel" @click="$emit('export')">
      <Icon name="download" :size="18" />
    </button>
  </div>
</template>

<style scoped>
.tb {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 12px;
  padding: 20px 20px 16px;
}
.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  flex: 1 1 320px;
}
.sc {
  height: 32px;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 0 12px;
  border: 1px solid var(--border);
  border-radius: var(--r-pill);
  background: var(--surface);
  font-size: 13px;
  white-space: nowrap;
  cursor: pointer;
}
.sc .ct {
  color: var(--muted);
}
.sc:focus-visible {
  outline: 2px solid var(--text);
  outline-offset: 2px;
}
.sc.on {
  background: var(--surface-dark);
  border-color: var(--surface-dark);
  color: var(--on-primary);
}
.sc.on .ct {
  color: var(--gold);
}
.dot {
  width: 10px;
  height: 10px;
  flex: none;
  border-radius: 50%;
}
/* 176px (không phải 220px): giữ cả năm nút lọc trên một hàng ở 1440px. */
.find {
  width: 176px;
  max-width: 100%;
  height: 40px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 12px;
  border: 1px solid var(--control);
  border-radius: var(--r-ctl);
  background: var(--surface);
  color: var(--muted);
}
.find:focus-within {
  border-color: var(--text);
  outline: 2px solid var(--text);
  outline-offset: 2px;
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
}
.pick {
  position: relative;
  display: inline-flex;
  align-items: center;
}
.pick select {
  height: 40px;
  padding: 0 36px 0 14px;
  border: 1px solid var(--control);
  border-radius: var(--r-ctl);
  background: var(--surface);
  font: inherit;
  color: var(--text);
  appearance: none;
  cursor: pointer;
}
.pick select:focus-visible {
  outline: 2px solid var(--text);
  outline-offset: 2px;
}
.pick svg {
  position: absolute;
  right: 12px;
  pointer-events: none;
}
.xp {
  width: 40px;
  height: 40px;
  display: inline-grid;
  place-items: center;
  border: 1px solid var(--control);
  border-radius: var(--r-ctl);
  background: var(--surface);
  color: var(--text);
  cursor: pointer;
}
.xp:hover {
  border-color: var(--text);
}
.xp:focus-visible {
  outline: 2px solid var(--text);
  outline-offset: 2px;
}
@media (max-width: 767px) {
  .tb {
    padding-inline: 16px;
  }
  .find {
    width: 100%;
  }
}
</style>
