<script setup lang="ts">
// Nhãn trạng thái nhân sự: chấm 8px theo trạng thái rồi chữ. Dùng chung bảng và ngăn kéo hồ sơ.
import type { StaffStatus } from '@/mock/staff';

defineProps<{ status: StaffStatus; label: string }>();
</script>

<template>
  <span class="stt"
    ><i :class="`d-${status}`" aria-hidden="true" />{{ label }}</span
  >
</template>

<style scoped>
.stt {
  display: inline-flex;
  align-items: center;
  height: 24px;
  padding: 0 10px;
  border: 1px solid var(--border);
  border-radius: 50px;
  background: var(--surface);
  color: var(--text);
  font-size: 12px;
  font-weight: 500;
  line-height: 16px;
  white-space: nowrap;
}
i {
  flex: none;
  width: 8px;
  height: 8px;
  margin-right: 6px;
  border-radius: 50%;
}
.d-ok {
  background: var(--surface-dark);
}
.d-try {
  background: var(--gold);
}
.d-off {
  background: var(--status-done);
}
.d-out {
  background: var(--ink-on-dark-muted);
}
</style>
