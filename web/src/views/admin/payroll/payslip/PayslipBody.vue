<script setup>
// Thân ngăn kéo phiếu lương: dải 5 số (tổng thu nhập − bảo hiểm − thuế − tạm ứng = thực nhận) và danh sách "Chi tiết".
// Dòng bằng 0 hoặc để trống ẩn mặc định, bấm để hiện. Số đã được máy chủ tính; ở đây chỉ định dạng.
import { computed, ref } from 'vue';
import Icon from '@/components/ui/Icon.vue';
import { num, vnd, vndc } from '@/utils/format.js';
import { cellText } from '@/views/print/slipFormat.js';

const props = defineProps({ payslip: { type: Object, required: true } });
defineEmits(['edit']);

const est = computed(() => props.payslip.estimated);
const showZero = ref(false);

const UNIT = { days: v => `${cellText(v)} ngày`, hours: v => `${num(v)} giờ`, pct: v => `${num(v)}%` };
const lineText = l => (UNIT[l.kind] ? UNIT[l.kind](l.v) : l.kind === 'text' ? l.v : cellText(l.v));

const sum = computed(() => {
  const s = props.payslip.sum;
  return [
    ['Tổng thu nhập', vnd(s.gross), '−'],
    ['Bảo hiểm', vnd(s.insurance), '−'],
    ['Thuế TNCN', vnd(s.tax), '−'],
    [s.deduct ? 'Tạm ứng và khoản trừ' : 'Tạm ứng', vnd((s.advance || 0) + (s.deduct || 0)), '=']
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
    </div>
  </div>

  <div class="sec lines">
    <div class="lh">
      <b>Chi tiết</b>
      <span class="hint">chỉ hiện dòng có số</span>
      <button v-if="payslip.canEditNumbers" type="button" class="btn sm" @click="$emit('edit')">
        <Icon name="edit" />Sửa số trên phiếu
      </button>
    </div>

    <template v-for="g in payslip.groups" :key="g.title">
      <div class="lg">
        <span>{{ g.title }}</span>
      </div>
      <div v-for="l in g.lines" :key="l.label" class="ln">
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

    <button v-if="payslip.zero.length" type="button" class="more0" @click="showZero = !showZero">
      <Icon name="chev" :class="{ up: showZero }" />
      <span class="link">{{ showZero ? 'Ẩn' : 'Hiện' }} {{ payslip.zero.length }} dòng bằng 0 hoặc để trống</span>
    </button>
    <template v-if="showZero">
      <div class="lg">
        <span>Dòng bằng 0 hoặc để trống</span>
      </div>
      <div v-for="l in payslip.zero" :key="l.label" class="ln zero">
        <span>{{ l.label }}</span>
        <span class="v">{{ lineText(l) }}</span>
      </div>
    </template>
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
.lh .hint {
  color: var(--muted);
  font-size: 12px;
  margin-left: 8px;
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
.ln.zero {
  color: var(--muted);
}
.ln.zero .v {
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
.more0 {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: 12px 12px 18px;
  font-size: 13px;
  color: var(--muted);
  background: none;
  border: 0;
  cursor: pointer;
  text-align: left;
}
.more0 .link {
  color: var(--text);
}
.more0 .up {
  transform: rotate(180deg);
}
</style>
