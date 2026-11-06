<script setup lang="ts">
// Hàng công cụ của thẻ bảng (board G, 06/11). Hàng trên: cặp bộ lọc nhân sự (trạng thái, phòng ban), ô tìm theo tên,
// nút "Tính lại lương" (mở chế độ chọn; ẩn khi kỳ đã phê duyệt hay đang chọn) và nút xuất các dòng đang lọc.
// Hàng dưới: các nút lọc trạng thái phiếu kèm số đếm cả kỳ.
import { computed } from 'vue';
import BulkButton from '@/components/select-mode/BulkButton.vue';
import StaffScopeFilter from '@/components/staff-scope/StaffScopeFilter.vue';
import type { StaffPst } from '@/components/staff-scope/staffScope';
import Icon from '@/components/ui/Icon.vue';
import type { PayrollStatus, SlipCounts } from '@/mock/payroll';

const props = defineProps<{ counts: SlipCounts; depts: string[]; recalc: boolean }>();
defineEmits<{ export: []; recalc: [] }>();
const filter = defineModel<'all' | PayrollStatus>('filter', { required: true });
const query = defineModel<string>('query', { required: true });
const pst = defineModel<StaffPst>('pst', { required: true });
const dept = defineModel<string>('dept', { required: true });

const FILTERS = [
  { key: 'all', label: 'Tất cả', dot: '' },
  { key: 'draft', label: 'Nháp', dot: 'var(--status-draft)' },
  { key: 'pending', label: 'Chờ duyệt', dot: 'var(--status-pending)' },
  { key: 'done', label: 'Đã duyệt', dot: 'var(--status-done)' },
  { key: 'rejected', label: 'Từ chối', dot: 'var(--status-rejected)' }
] as const;
const buttons = computed(() => FILTERS.map(f => ({ ...f, count: props.counts[f.key] })));
</script>

<template>
  <div class="tb">
    <div class="row1">
      <StaffScopeFilter v-model:pst="pst" v-model:dept="dept" :depts="depts" />
      <label class="find">
        <Icon name="search" :size="16" />
        <input v-model="query" type="text" placeholder="Tìm theo tên…" aria-label="Tìm theo tên" />
      </label>
      <span class="sp" />
      <BulkButton v-if="recalc" icon="refresh" @click="$emit('recalc')">Tính lại lương</BulkButton>
      <button
        type="button"
        class="xp"
        aria-label="Xuất bảng lương ra Excel"
        title="Xuất bảng lương ra Excel"
        @click="$emit('export')"
      >
        <Icon name="download" :size="18" />
      </button>
    </div>
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
  </div>
</template>

<style scoped>
.tb {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 20px 20px 16px;
}
.row1 {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 12px;
}
.sp {
  flex-grow: 1;
}
.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
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
.find {
  width: 220px;
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
