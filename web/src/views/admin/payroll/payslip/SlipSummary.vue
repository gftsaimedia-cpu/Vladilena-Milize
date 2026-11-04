<script setup lang="ts">
// Bảng Tổng hợp lương của phiếu (spec 4.3): nhóm khoản, phần tổng, dải Thực nhận.
// Slot `kpi` (5 ô điểm) và `history` (lịch sử sửa điểm) nằm trong nhóm LƯƠNG KPI; Task 5 đổ nội dung vào.
import { computed } from 'vue';
import { KPI_LABELS, type Payslip } from '@/mock/payroll';
import { num, vnd } from '@/utils/format';
import { monthNo } from '../../requests/helpers';

const props = defineProps<{ slip: Payslip; month: string }>();

// Một dòng: nhãn, dòng phụ, ô "theo quy chế", ô "thực tế". dot: chấm cam; strong: dòng đậm.
type Row = { label: string; sub?: string; rule?: string; actual?: string; dot?: boolean; strong?: boolean };
type Group = { id: string; title: string; rows: Row[] };

const money = (n: number) => vnd(n);
const cut = (n: number) => (n === 0 ? '0' : `−${vnd(n)}`);
const minutes = computed(() => props.slip.late.minutes.reduce((a, b) => a + b, 0));

const groups = computed<Group[]>(() => {
  const s = props.slip;
  const c = s.calc;
  const missing = c.kpiMissing.map(p => KPI_LABELS[p]);
  const lateSub = minutes.value
    ? `Đi muộn ${minutes.value} phút` + (s.late.minutes.every(m => m <= 15) ? ', không quá 15 phút nên không trừ' : '')
    : undefined;
  return [
    {
      id: 'work',
      title: 'Ngày công và lương cơ bản',
      rows: [
        { label: `Ngày công tháng ${monthNo(props.month)}`, rule: String(s.days.standard), actual: String(s.days.work) },
        { label: 'Lương cơ bản (đ)', rule: money(s.base), actual: money(c.baseActual) },
        {
          label: 'Chờ giải trình (ngày)',
          actual: String(s.days.pending),
          dot: s.days.pending > 0,
          sub: s.days.pending > 0 ? `${s.pendingDates.join(', ')} · tạm tính 0 đ tới khi duyệt` : undefined
        },
        { label: 'Nghỉ không lương (ngày)', actual: String(s.days.unpaid) }
      ]
    },
    {
      id: 'leave',
      title: 'Nghỉ phép và ngày lễ',
      rows: [
        { label: 'Nghỉ phép có lương (ngày)', rule: String(s.days.leave), actual: money(s.leavePay) },
        { label: 'Quyết toán phép dư (ngày)', rule: '0', actual: '0' },
        { label: 'Nghỉ thứ 7 hưởng lương · iSAT (ngày)', rule: String(s.days.isat), actual: money(s.isatPay) },
        { label: 'Nghỉ lễ hưởng lương (ngày)', rule: '0', actual: '0' }
      ]
    },
    {
      id: 'ot',
      title: 'Làm thêm giờ',
      rows: [
        { label: 'OT ×1,5 · ×2 · ×3 (giờ)', rule: s.ot.hours.map(h => num(h)).join(' · ') },
        { label: 'Tiền OT', actual: money(s.ot.pay) }
      ]
    },
    {
      id: 'allowance',
      title: 'Phụ cấp',
      rows: [
        ...s.allowances.map(a => ({ label: a.label, rule: money(a.rule), actual: money(a.actual) })),
        { label: 'Tổng phụ cấp (đ)', actual: money(c.allowanceTotal), strong: true }
      ]
    },
    {
      id: 'kpi',
      title: 'Lương KPI',
      rows: [
        { label: 'Tổng điểm KPI', actual: `${num(c.kpiPercent)}%` },
        ...(missing.length ? [{ label: `Thiếu điểm ${missing.join(', ')}`, sub: 'Cột thiếu tính 0 điểm', dot: true }] : []),
        { label: 'Lương KPI (đề xuất → thực tế) (đ)', rule: money(s.kpi.proposal), actual: money(c.kpiPay), strong: true }
      ]
    },
    {
      id: 'late',
      title: 'Đi muộn, về sớm, ra ngoài',
      rows: [{ label: 'Giờ và tiền bị trừ', sub: lateSub, rule: num(s.late.hours), actual: cut(s.late.cut) }]
    }
  ];
});

const totals = computed<Row[]>(() => {
  const s = props.slip;
  const c = s.calc;
  return [
    { label: 'Tổng thu nhập (đ)', actual: money(c.gross), strong: true },
    { label: 'Các khoản miễn thuế', actual: money(s.exempt) },
    { label: 'Thu nhập chịu thuế', actual: money(c.taxable) },
    { label: 'Bảo hiểm bắt buộc 10,5%', sub: 'BHXH 8% · BHTN 1% · BHYT 1,5%', actual: money(c.insurance) },
    { label: 'Thu nhập sau bảo hiểm (đ)', actual: money(c.afterInsurance), strong: true },
    { label: 'Thuế TNCN', sub: `Lũy tiến · ${s.dependants} người phụ thuộc`, actual: money(c.tax) },
    { label: 'Tạm ứng', actual: money(s.advance) }
  ];
});
const zero = (v?: string) => (v === '0' ? 'zero' : undefined);
</script>

<template>
  <section class="ss">
    <div class="ss-h">
      <h3>Tổng hợp lương</h3>
      <span>Số tiền tính bằng đồng</span>
    </div>
    <table class="ss-t" aria-label="Tổng hợp lương">
      <colgroup>
        <col />
        <col class="c-rule" />
        <col class="c-act" />
      </colgroup>
      <thead>
        <tr>
          <th scope="col">Khoản</th>
          <th scope="col" class="n">Theo quy chế</th>
          <th scope="col" class="n">Thực tế</th>
        </tr>
      </thead>
      <tbody v-for="g in groups" :key="g.id">
        <tr>
          <th colspan="3" scope="colgroup" class="gt">{{ g.title }}</th>
        </tr>
        <template v-for="r in g.rows" :key="r.label">
          <tr :class="{ strong: r.strong }">
            <th scope="row" class="lb">
              <i v-if="r.dot" class="dot" aria-hidden="true" />{{ r.label }}
              <span v-if="r.sub" class="sub">{{ r.sub }}</span>
            </th>
            <td :class="zero(r.rule)">{{ r.rule }}</td>
            <td :class="zero(r.actual)">{{ r.actual }}</td>
          </tr>
          <tr v-if="g.id === 'kpi' && r.label === 'Tổng điểm KPI' && $slots.kpi" class="slot">
            <td colspan="3"><slot name="kpi" /></td>
          </tr>
        </template>
        <tr v-if="g.id === 'kpi' && $slots.history" class="slot">
          <td colspan="3"><slot name="history" /></td>
        </tr>
      </tbody>
      <tbody class="tot">
        <tr v-for="r in totals" :key="r.label" :class="{ strong: r.strong }">
          <th scope="row" class="lb">
            {{ r.label }}
            <span v-if="r.sub" class="sub">{{ r.sub }}</span>
          </th>
          <td></td>
          <td :class="zero(r.actual)">{{ r.actual }}</td>
        </tr>
        <tr class="net">
          <th scope="row">Thực nhận</th>
          <td colspan="2">{{ money(slip.calc.net) }} ₫</td>
        </tr>
        <tr>
          <th scope="row" class="lb">Ngày phép năm còn lại</th>
          <td></td>
          <td>{{ slip.leaveLeft }} ngày</td>
        </tr>
      </tbody>
    </table>
  </section>
</template>

<style scoped>
.ss {
  padding: 20px 24px 24px;
}
.ss-h {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 8px;
}
.ss-h h3 {
  margin: 0;
  font-size: 15px;
  line-height: 24px;
  font-weight: 600;
}
.ss-h span {
  font-size: 12px;
  color: var(--muted);
}
.ss-t {
  table-layout: fixed;
  border-collapse: collapse;
  font-variant-numeric: tabular-nums;
}
.ss-t col.c-rule {
  width: 92px;
}
.ss-t col.c-act {
  width: 104px;
}
/* Luật chung của bảng (base.css) đệm 24px hai đầu và nền Gọn ép chiều cao ô; ở đây lề 0 và chiều cao theo nội dung. */
.ss-t th,
.ss-t td {
  padding: 8px 0;
  border-bottom: 1px solid var(--border);
  border-top: 0;
  font-size: 14px;
  line-height: 20px;
  white-space: normal;
}
.ss-t td {
  text-align: right;
  padding-left: 8px;
}
.ss-t thead th {
  padding: 6px 0;
  font-size: 12px;
  line-height: 16px;
  color: var(--muted);
}
.ss-t thead th.n {
  text-align: right;
}
.ss-t .gt {
  padding: 6px 8px;
  background: var(--ground);
  font-size: 11px;
  line-height: 16px;
  font-weight: 500;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--muted);
}
.ss-t .lb {
  font-weight: 400;
  color: var(--text);
  text-align: left;
}
.ss-t tr.strong .lb,
.ss-t tr.strong td {
  font-weight: 600;
}
.ss-t .sub {
  display: block;
  font-size: 12px;
  line-height: 16px;
  font-weight: 400;
  color: var(--muted);
}
.ss-t .zero {
  color: var(--faint);
}
.dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  margin-right: 6px;
  border-radius: 50%;
  background: var(--status-pending);
  vertical-align: 1px;
}
.ss-t tr.slot td {
  padding: 8px 0;
  text-align: left;
}
/* Phần tổng: đường 2px phía trên, rồi dải Thực nhận. */
.ss-t tbody.tot tr:first-child > * {
  border-top: 2px solid var(--text);
}
.ss-t tr.net th,
.ss-t tr.net td {
  padding: 12px 8px;
  border-top: 2px solid var(--text);
  border-bottom: 2px solid var(--text);
  background: var(--gold-pale);
  font-size: 18px;
  line-height: 24px;
  font-weight: 600;
  color: var(--text);
}
.ss-t tr.net th {
  text-align: left;
}
</style>
