<script setup lang="ts">
// Thân ngăn kéo phiếu lương: dải 5 số (tổng thu nhập − bảo hiểm − thuế − tạm ứng = thực nhận) và danh sách "Chi tiết".
// Số đã được máy chủ tính; ở đây chỉ định dạng.
import { computed } from 'vue';
import Icon from '@/components/ui/Icon.vue';
import { num, vnd, vndc } from '@/utils/format';
import { cellText } from '@/views/print/slipFormat';

const props = defineProps({ payslip: { type: Object as () => any, required: true } });
defineEmits(['edit']);

const est = computed(() => props.payslip.estimated);

const UNIT = { days: (v?) => `${cellText(v)} ngày`, hours: (v?) => `${num(v)} giờ`, pct: (v?) => `${num(v)}%` };
const lineText = (l?) =>
  l.v == null || l.v === '' ? '—' : UNIT[l.kind] ? UNIT[l.kind](l.v) : l.kind === 'text' ? l.v : cellText(l.v);

const sum = computed(() => {
  const s = props.payslip.sum;
  const advanceAndDeduct = s.deduct == null ? s.advance : s.advance == null ? null : s.advance + s.deduct;
  return [
    ['Tổng thu nhập', vnd(s.gross), '−'],
    ['Bảo hiểm', vnd(s.insurance), '−'],
    ['Thuế TNCN', vnd(s.tax), '−'],
    [s.deduct != null ? 'Tạm ứng và khoản trừ' : 'Tạm ứng', vnd(advanceAndDeduct), '=']
  ];
});
</script>

<template>
  <div class="sec">
    <div class="sum5">
      <template v-for="[label, value, op] in sum" :key="label">
        <div>
          <div class="l">{{ label }}</div>
          <div class="v" :class="{ est }">{{ value }}</div>
        </div>
        <div class="op">{{ op }}</div>
      </template>
      <div class="lead">
        <div class="l">Thực nhận</div>
        <div class="v" :class="est ? 'est-u' : ''">{{ vndc(payslip.sum.net) }}</div>
      </div>
      <div v-if="payslip.employeeStatus" class="staff-status">
        <span>Trạng thái nhân sự</span><b>{{ payslip.employeeStatus }}</b>
      </div>
    </div>
  </div>

  <div class="sec lines">
    <div class="lh">
      <b>Chi tiết</b>
      <button v-if="payslip.canEditNumbers" type="button" class="btn sm" @click="$emit('edit')">
        <Icon name="edit" />Sửa số trên phiếu
      </button>
    </div>

    <template v-for="g in payslip.groups" :key="g.title">
      <div class="lg">
        <span>{{ g.title }}</span>
      </div>
      <div v-for="(l, index) in g.lines" :key="g.title + '-' + index" class="ln">
        <span>{{ l.label }}</span>
        <span class="v" :class="{ est: est && l.kind === 'money' }">
          <span v-if="l.kind === 'text'" class="soft">{{ l.v }}</span>
          <template v-else>{{ lineText(l) }}</template>
        </span>
      </div>
    </template>

    <div v-for="t in payslip.totals" :key="t.label" class="tot" :class="{ hl: t.hl }">
      <span>{{ t.label }}</span>
      <span :class="t.hl ? (est ? 'est-u' : '') : est ? 'est' : ''">{{ vndc(t.v) }}</span>
    </div>

  </div>
</template>

<style scoped>
.sec {
  padding: 16px 28px 0;
}
.sum5 {
  display: grid;
  grid-template-columns: 1fr 14px 1fr 14px 0.8fr 14px 1fr 14px 1.15fr;
  align-items: center;
  border: 1px solid var(--border);
  border-radius: 14px;
  padding: 12px 16px;
  background: var(--raised);
}
.sum5 .op {
  color: #9e9e9e;
  text-align: center;
}
.sum5 .l {
  font-size: 11px;
  color: var(--muted);
}
.sum5 .v {
  font-size: 15px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  margin-top: 2px;
}
.sum5 .lead .v {
  font-size: 18px;
}
.staff-status {
  display: flex;
  gap: 6px;
  margin-top: 10px;
  color: var(--muted);
  font-size: 12px;
}
.staff-status b {
  color: var(--text);
  font-weight: 600;
}
.lines {
  margin-top: 14px;
}
.lh {
  display: flex;
  align-items: center;
  padding: 0 0 8px;
}
.lh b {
  font-size: 14px;
}
.lh .btn {
  margin-left: auto;
}
.lg {
  display: grid;
  grid-template-columns: 1fr auto;
  padding: 0 12px;
  height: 34px;
  align-items: center;
  background: var(--raised);
  border-top: 1px solid var(--rule);
  font-size: 12px;
  font-weight: 600;
  color: var(--muted);
}
.ln {
  display: grid;
  grid-template-columns: 1fr auto;
  padding: 0 12px;
  min-height: 38px;
  align-items: center;
  border-top: 1px solid var(--rule);
  font-size: 13px;
}
.ln .v {
  font-variant-numeric: tabular-nums;
  font-weight: 500;
}
.ln .v .soft {
  color: var(--muted);
  font-weight: 400;
}
.tot {
  display: grid;
  grid-template-columns: 1fr auto;
  padding: 0 12px;
  min-height: 42px;
  align-items: center;
  border-top: 1.5px solid var(--text);
  font-size: 14px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.tot.hl {
  background: var(--gold-pale);
  font-size: 16px;
  min-height: 50px;
}
</style>
