<script setup lang="ts">
// Chấm công tháng trong phiếu: dải một ô mỗi ngày, năm ô số và liên kết sang hồ sơ chấm công (spec 4.2).
import { computed } from 'vue';
import type { DayKind, Payslip } from '@/mock/payroll';
import { num } from '@/utils/format';
import { monthNo } from '../../requests/helpers';

const props = defineProps<{ slip: Payslip; month: string }>();

const no = computed(() => monthNo(props.month));
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const d = computed(() => props.slip.days);
const summary = computed(
  () =>
    `Chấm công tháng ${no.value}: ${d.value.work} ngày công, ${d.value.leave} phép, ${d.value.isat} iSAT, ` +
    `${d.value.pending} chờ giải trình, ${d.value.unpaid} không lương`
);
const stats = computed(() => [
  { label: 'Ngày công', value: String(d.value.work), unit: ` / ${d.value.standard}` },
  { label: 'Phép · iSAT', value: `${d.value.leave} · ${d.value.isat}`, unit: '' },
  { label: 'Chờ giải trình', value: String(d.value.pending), unit: '' },
  { label: 'Làm thêm', value: num(sum(props.slip.ot.hours)), unit: ' giờ' },
  { label: 'Đi muộn', value: String(sum(props.slip.late.minutes)), unit: ' phút' }
]);
const KIND_CLASS: Record<DayKind, string> = {
  work: 'work',
  leave: 'off',
  isat: 'off',
  pending: 'pend',
  unpaid: 'unpaid',
  sunday: 'sun',
  future: 'next'
};
</script>

<template>
  <section class="sa" :aria-label="`Chấm công tháng ${no}`">
    <div class="sa-h">
      <h3>Chấm công tháng {{ no }}</h3>
      <RouterLink :to="{ path: '/admin/cham-cong', query: { thang: month } }">Xem từng ngày ›</RouterLink>
    </div>
    <div class="sa-days" role="img" :aria-label="summary">
      <i v-for="(kind, i) in slip.calendar" :key="i" :class="KIND_CLASS[kind]" :title="`${i + 1}/${no}`" />
    </div>
    <dl class="sa-stats">
      <div v-for="s in stats" :key="s.label">
        <dt>{{ s.label }}</dt>
        <dd>
          {{ s.value }}<span v-if="s.unit">{{ s.unit }}</span>
        </dd>
      </div>
    </dl>
  </section>
</template>

<style scoped>
.sa {
  padding: 20px 24px 4px;
}
.sa-h {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
}
.sa-h h3 {
  margin: 0;
  font-size: 15px;
  line-height: 24px;
  font-weight: 600;
}
.sa-h a {
  font-size: 12px;
  color: var(--muted);
}
.sa-h a:hover {
  color: var(--text);
  text-decoration: underline;
}
.sa-h a:focus-visible {
  outline: 2px solid var(--text);
  outline-offset: 2px;
  border-radius: 4px;
}
.sa-days {
  display: flex;
  gap: 3px;
  margin: 12px 0 16px;
}
.sa-days i {
  flex: 1 1 0;
  min-width: 0;
  height: 14px;
  border-radius: 4px;
  border: 0 solid transparent;
  background: var(--surface);
}
.sa-days .work {
  background: var(--surface-dark);
}
.sa-days .off {
  background: var(--status-done);
}
.sa-days .pend {
  border: 2px solid var(--status-pending);
}
.sa-days .unpaid {
  background: var(--status-draft);
}
.sa-days .sun {
  background: var(--ground);
}
.sa-days .next {
  border: 1px solid var(--border);
}
.sa-stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(84px, 1fr));
  gap: 8px;
  margin: 0;
}
.sa-stats > div {
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 12px;
}
.sa-stats dt {
  font-size: 12px;
  line-height: 16px;
  color: var(--muted);
}
.sa-stats dd {
  margin: 2px 0 0;
  font-size: 16px;
  line-height: 24px;
  font-weight: 600;
  white-space: nowrap;
}
.sa-stats dd span {
  font-size: 12px;
  font-weight: 400;
  color: var(--muted);
}
</style>
