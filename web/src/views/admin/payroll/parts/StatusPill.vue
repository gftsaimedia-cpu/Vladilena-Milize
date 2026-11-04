<script setup lang="ts">
// Nhãn trạng thái phiếu lương (bảng và đầu phiếu dùng chung).
import type { PayrollStatus } from '@/mock/payroll';
import { STATUS_LABEL } from '../payrollCsv';

defineProps<{ status: PayrollStatus }>();
</script>

<template>
  <span class="pill" :class="`st-${status}`">{{ STATUS_LABEL[status] }}</span>
</template>

<style scoped>
.pill {
  display: inline-flex;
  align-items: center;
  height: 24px;
  padding: 0 10px;
  border-radius: var(--r-pill);
  font-size: 12px;
  line-height: 16px;
  font-weight: 500;
}
.pill.st-draft {
  background: var(--status-draft);
  color: var(--text);
}
.pill.st-pending {
  background: var(--status-pending);
  color: var(--text);
}
.pill.st-done {
  background: var(--status-done);
  color: var(--on-primary);
}
.pill.st-rejected {
  background: var(--status-rejected);
  color: var(--on-primary);
}
</style>
