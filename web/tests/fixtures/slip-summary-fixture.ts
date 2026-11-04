// Gắn riêng SlipSummary để thử chỗ đặt hai slot của Task 5 (kpi, history) trước khi có nội dung thật.
// ?id=<mã phiếu> chọn người, ?slots=1 đổ nội dung dấu vào hai slot.
import { createApp, h } from 'vue';
import { payslipView } from '../../src/mock/payroll';
import SlipSummary from '../../src/views/admin/payroll/payslip/SlipSummary.vue';
import '../../src/styles/base.css';

const q = new URLSearchParams(location.search);
document.documentElement.dataset.density = 'gon';
const slip = payslipView('2026-10', q.get('id') ?? 'GFT-0142')!;
const slots =
  q.get('slots') === '1'
    ? { kpi: () => h('div', 'SLOT-KPI'), history: () => h('div', 'SLOT-HISTORY') }
    : undefined;

createApp({ render: () => h(SlipSummary, { slip, month: '2026-10' }, slots) }).mount('#app');
