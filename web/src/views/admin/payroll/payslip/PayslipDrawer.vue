<script setup lang="ts">
// Phiếu lương một người (board H): ngăn kéo nổi gồm đầu phiếu, định danh, chấm công tháng và bảng Tổng hợp lương.
// Đợt này chỉ để xem; chấm điểm KPI và duyệt / từ chối thêm ở các đợt sau (slot kpi, history của SlipSummary).
import AppDrawer from '@/components/ui/AppDrawer.vue';
import Icon from '@/components/ui/Icon.vue';
import type { Payslip } from '@/mock/payroll';
import { monthShort } from '@/utils/format';
import StatusPill from '../parts/StatusPill.vue';
import SlipAttendance from './SlipAttendance.vue';
import SlipSummary from './SlipSummary.vue';

defineProps<{ slip: Payslip; month: string; hasPrev: boolean; hasNext: boolean }>();
const emit = defineEmits<{ close: []; prev: []; next: [] }>();
</script>

<template>
  <AppDrawer :title="`Phiếu lương của ${slip.name}`" floating @close="emit('close')">
    <template #head>
      <div class="pd-head">
        <h2>Phiếu lương tháng {{ monthShort(month) }}</h2>
        <button type="button" class="pd-ib" aria-label="Phiếu trước" :disabled="!hasPrev" @click="emit('prev')">
          <Icon name="chevl" />
        </button>
        <button type="button" class="pd-ib" aria-label="Phiếu sau" :disabled="!hasNext" @click="emit('next')">
          <Icon name="chevr" />
        </button>
      </div>
    </template>

    <div class="pd-body">
      <div class="pd-id">
        <span class="pd-av" aria-hidden="true">{{ slip.initials }}</span>
        <div class="pd-who">
          <b>{{ slip.name }}</b>
          <span>{{ slip.dept }} · {{ slip.title }} · {{ slip.id }}</span>
        </div>
        <StatusPill :status="slip.status" />
      </div>
      <dl class="pd-info">
        <div>
          <dt>Loại · bậc</dt>
          <dd>{{ slip.kind }} · Bậc {{ slip.level }}</dd>
        </div>
        <div>
          <dt>Tình trạng</dt>
          <dd>{{ slip.contract }}</dd>
        </div>
        <div>
          <dt>Trả lương</dt>
          <dd>{{ slip.payday }}</dd>
        </div>
      </dl>
      <p class="pd-note">{{ slip.note }}</p>
    </div>

    <SlipAttendance :slip="slip" :month="month" />
    <SlipSummary :slip="slip" :month="month" />
  </AppDrawer>
</template>

<style scoped>
.pd-head {
  display: flex;
  align-items: center;
  gap: 4px;
}
.pd-head h2 {
  flex: 1;
  min-width: 0;
  margin: 0;
  font-size: 18px;
  line-height: 26px;
  font-weight: 600;
}
.pd-ib {
  width: 36px;
  height: 36px;
  flex: none;
  display: grid;
  place-items: center;
  padding: 0;
  border: 0;
  border-radius: 8px;
  background: none;
  color: var(--text);
  cursor: pointer;
}
.pd-ib:hover:not(:disabled) {
  background: var(--ground);
}
.pd-ib:disabled {
  opacity: 0.35;
  cursor: default;
}
.pd-body {
  padding: 8px 24px 0;
}
.pd-id {
  display: flex;
  align-items: center;
  gap: 12px;
}
.pd-av {
  width: 48px;
  height: 48px;
  flex: none;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: var(--gold-light);
  font-size: 16px;
  font-weight: 600;
}
.pd-who {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.pd-who b {
  font-size: 16px;
  line-height: 24px;
  font-weight: 600;
}
.pd-who span {
  font-size: 12px;
  line-height: 16px;
  color: var(--muted);
}
.pd-info {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  margin: 16px 0 0;
  border: 1px solid var(--border);
  border-radius: 12px;
}
.pd-info > div {
  padding: 10px 14px;
  min-width: 0;
}
.pd-info > div + div {
  border-left: 1px solid var(--border);
}
.pd-info dt {
  font-size: 12px;
  line-height: 16px;
  color: var(--muted);
}
.pd-info dd {
  margin: 2px 0 0;
  font-weight: 500;
}
.pd-note {
  margin: 12px 0 0;
  font-size: 12px;
  line-height: 16px;
  color: var(--muted);
}
</style>
